using System.Text.Json;
using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.ThemeSongVolume;

public sealed record VolumeProfile
{
    [JsonPropertyName("volume")]
    public int Volume { get; init; } = 25;
    [JsonPropertyName("overrides")]
    public Dictionary<string, int> Overrides { get; init; } = [];

    public VolumeProfile Validated()
    {
        if (Volume is < 0 or > 100 || Overrides is null || Overrides.Count > 512)
            throw new ArgumentException("Volume must be between 0 and 100; at most 512 overrides are allowed.");
        var overrides = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (var (id, volume) in Overrides)
        {
            if (!Guid.TryParse(id, out var guid) || guid == Guid.Empty || volume is < 0 or > 100)
                throw new ArgumentException("Each override must have a valid song ID and a volume between 0 and 100.");
            if (!overrides.TryAdd(guid.ToString("N"), volume))
                throw new ArgumentException("Duplicate song ID.");
        }
        return this with { Overrides = overrides };
    }
}

public sealed class ProfileStore(string directory)
{
    private readonly object _gate = new();
    private bool _removed;
    private static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    private string FileFor(Guid user) => Path.Combine(directory, $"profile-{user:N}.json");

    public VolumeProfile Get(Guid user)
    {
        lock (_gate)
        {
            ObjectDisposedException.ThrowIf(_removed, this);
            var path = FileFor(user);
            if (!File.Exists(path)) return new();
            return (JsonSerializer.Deserialize<VolumeProfile>(File.ReadAllText(path), Json)
                ?? throw new JsonException("Invalid theme volume profile.")).Validated();
        }
    }

    public VolumeProfile Save(Guid user, VolumeProfile profile)
    {
        profile = profile.Validated();
        lock (_gate)
        {
            ObjectDisposedException.ThrowIf(_removed, this);
            Directory.CreateDirectory(directory);
            var path = FileFor(user);
            var temp = path + ".tmp";
            try
            {
                File.WriteAllText(temp, JsonSerializer.Serialize(profile, Json));
                File.Move(temp, path, true);
            }
            finally
            {
                if (File.Exists(temp)) File.Delete(temp);
            }
            return profile;
        }
    }

    public void Reset(Guid user)
    {
        lock (_gate)
        {
            ObjectDisposedException.ThrowIf(_removed, this);
            File.Delete(FileFor(user));
        }
    }

    public void RemoveAll()
    {
        lock (_gate)
        {
            _removed = true;
            if (!Directory.Exists(directory)) return;
            // Only remove files owned by this plugin, never an unknown file or tree.
            foreach (var file in Directory.EnumerateFiles(directory))
            {
                var name = Path.GetFileName(file);
                var match = System.Text.RegularExpressions.Regex.Match(name, @"^profile-([0-9a-f]{32})\.json(?:\.tmp)?$");
                if (match.Success && Guid.TryParseExact(match.Groups[1].Value, "N", out _)) File.Delete(file);
            }
            if (!Directory.EnumerateFileSystemEntries(directory).Any()) Directory.Delete(directory);
        }
    }
}
