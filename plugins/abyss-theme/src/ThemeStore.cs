using System.Text.Json;
using System.Text.RegularExpressions;
using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.AbyssTheme;

public sealed record ThemeBundle(string Revision, string Css, string JellyfinEnhancedCss, string MediaBarEnhancedCss, string License,
    string? LiteCss = null, string? SpotlightCss = null, string? SpotlightHtml = null, string? SpotlightRevision = null);
public sealed record ThemeState(ThemeSettings Settings, ThemeBundle? Current = null, ThemeBundle? Previous = null);

public sealed class ThemeStore
{
    public const string BundledRevision = "2f809171ed7f3a34b5e78297608b5f2b63dd3f0f";
    public static string Resource(string name)
    {
        using var stream = typeof(Plugin).Assembly.GetManifestResourceStream(name)
            ?? throw new InvalidOperationException("Missing Abyss asset: " + name);
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
    public static readonly ThemeBundle Bundled = new(BundledRevision,
        Resource("Jellyfin.Plugin.AbyssTheme.Web.abyss.css"),
        Resource("Jellyfin.Plugin.AbyssTheme.Web.abyss-je.css"),
        Resource("Jellyfin.Plugin.AbyssTheme.Web.abyss-mbe.css"), Resource("Abyss.LICENSE"),
        Resource("Jellyfin.Plugin.AbyssTheme.Web.abyss-lite.css"), Resource("Jellyfin.Plugin.AbyssTheme.Web.spotlight.css"),
        Resource("Jellyfin.Plugin.AbyssTheme.Web.spotlight.html"), BundledRevision);
    private readonly object _gate = new();
    private readonly string _directory;
    private readonly string _file;
    private ThemeState _state = new(new());
    private bool _removed;
    private long _generation;
    public string? LoadWarning { get; private set; }

    public ThemeStore(string directory)
    {
        _directory = directory;
        _file = Path.Combine(directory, "state.json");
        try
        {
            if (!File.Exists(_file)) return;
            if (new FileInfo(_file).Length > 4 * 1024 * 1024) throw new InvalidDataException("Oversized saved state.");
            var state = JsonSerializer.Deserialize<ThemeState>(File.ReadAllText(_file)) ?? throw new InvalidDataException("Empty saved state.");
            if (state.Settings is null) throw new InvalidDataException("Missing saved settings.");
            state = state with { Settings = state.Settings.Validated() };
            if (state.Current is not null) Validate(state.Current);
            if (state.Previous is not null) Validate(state.Previous);
            _state = state;
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or JsonException or ArgumentException)
        { LoadWarning = "Saved theme state could not be loaded. Bundled CSS is active; reset settings or check the plugin's state.json file."; }
    }

    public (ThemeState State, long Generation) Snapshot() { lock (_gate) return (_state with { Settings = _state.Settings with { HomeOrder = (string[])_state.Settings.HomeOrder.Clone() } }, _generation); }
    public string Css()
    {
        lock (_gate)
        {
            var bundle = _state.Current ?? Bundled;
            // Separate style elements keep any upstream @imports valid.
            var css = ThemeStyles.Base(bundle, _state.Settings);
            if (_state.Settings.JellyfinEnhanced) css += "\n</style><style data-abyss-override=\"je\" media=\"not all\">\n" + bundle.JellyfinEnhancedCss;
            if (_state.Settings.MediaBarEnhanced) css += "\n</style><style data-abyss-override=\"mbe\" media=\"not all\">\n" + bundle.MediaBarEnhancedCss;
            if (_state.Settings.LiteMode) css += "\n</style><style data-abyss-override=\"lite\" media=\"not all\">\n" + (bundle.LiteCss ?? Bundled.LiteCss);
            css += "\n</style><style data-abyss-override=\"preferences\" media=\"not all\">\n" + ThemeStyles.Preferences(_state.Settings);
            return css;
        }
    }
    public string StyleSheet()
    {
        lock (_gate)
        {
            var bundle = _state.Current ?? Bundled;
            return ThemeStyles.Sheet(bundle, _state.Settings);
        }
    }
    public void Settings(ThemeSettings settings) { var validated = settings.Validated(); lock (_gate) Save(_state with { Settings = validated }); }
    public bool Promote(ThemeBundle bundle, long generation)
    {
        Validate(bundle);
        lock (_gate)
        {
            if (_removed || generation != _generation) return false;
            if ((_state.Current ?? Bundled) == bundle) return false;
            Save(_state with { Previous = _state.Current ?? Bundled, Current = bundle });
            return true;
        }
    }
    public void Rollback()
    {
        lock (_gate) Save(_state with { Current = _state.Previous, Previous = null,
            Settings = _state.Settings with { AutomaticUpdates = false } });
    }
    public void Reset() { lock (_gate) Save(new(new())); }
    private void Save(ThemeState state)
    {
        if (_removed) throw new ObjectDisposedException(nameof(ThemeStore));
        Directory.CreateDirectory(_directory);
        var temporary = _file + ".tmp";
        try
        {
            var json = JsonSerializer.Serialize(state);
            if (System.Text.Encoding.UTF8.GetByteCount(json) > 4 * 1024 * 1024) throw new IOException("Saved theme bundle would exceed the size limit.");
            File.WriteAllText(temporary, json);
            File.Move(temporary, _file, true);
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
        _state = state;
        _generation++;
        LoadWarning = null;
    }
    public void Remove()
    {
        lock (_gate)
        {
            _removed = true;
            _generation++;
            if (File.Exists(_file)) File.Delete(_file);
            if (File.Exists(_file + ".tmp")) File.Delete(_file + ".tmp");
            if (Directory.Exists(_directory) && !Directory.EnumerateFileSystemEntries(_directory).Any()) Directory.Delete(_directory);
        }
    }
    public static void Validate(ThemeBundle bundle)
    {
        if (bundle.Revision is null || !Regex.IsMatch(bundle.Revision, "^[a-f0-9]{40}$")) throw new ArgumentException("Invalid upstream revision.");
        // Changed licensing requires a reviewed plugin release, rather than
        // silently redistributing under potentially different terms.
        if (bundle.License?.Replace("\r\n", "\n").Trim() != Bundled.License.Replace("\r\n", "\n").Trim())
            throw new ArgumentException("Upstream license changed; a reviewed plugin update is required.");
        ValidateCss(bundle.Css, "--abyss-accent");
        ValidateCss(bundle.JellyfinEnhancedCss, "#jellyfin-enhanced-panel");
        ValidateCss(bundle.MediaBarEnhancedCss, "#slides-container");
        if (bundle.LiteCss is not null) ValidateCss(bundle.LiteCss, "--abyss-backdrop-blur");
        if (bundle.SpotlightCss is not null) ValidateCss(bundle.SpotlightCss, "#backdrop");
        if (bundle.SpotlightHtml is not null) SpotlightDocument.Adapt(bundle.SpotlightHtml);
        if (bundle.SpotlightRevision is not null && !Regex.IsMatch(bundle.SpotlightRevision, "^[a-f0-9]{40}$")) throw new ArgumentException("Invalid Spotlight revision.");
    }
    private static void ValidateCss(string css, string signature)
    {
        if (string.IsNullOrWhiteSpace(css) || css.Length > 512 * 1024 || !css.Contains(signature, StringComparison.Ordinal) ||
            css.Contains("</", StringComparison.OrdinalIgnoreCase) || css.Contains("<script", StringComparison.OrdinalIgnoreCase) ||
            css.Contains("expression(", StringComparison.OrdinalIgnoreCase) || css.Contains("javascript:", StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("Upstream CSS failed content validation.");
        // Check structural balance without treating braces in comments/strings
        // as syntax. This detects incomplete downloads, not visual regressions.
        var depth = 0;
        var comment = false;
        var quote = '\0';
        for (var i = 0; i < css.Length; i++)
        {
            var ch = css[i];
            var next = i + 1 < css.Length ? css[i + 1] : '\0';
            if (comment) { if (ch == '*' && next == '/') { comment = false; i++; } continue; }
            if (quote != '\0') { if (ch == '\\') i++; else if (ch == quote) quote = '\0'; continue; }
            if (ch == '/' && next == '*') { comment = true; i++; continue; }
            if (ch is '\'' or '"') { quote = ch; continue; }
            if (ch == '{') depth++;
            if (ch == '}' && --depth < 0) throw new ArgumentException("Unbalanced upstream CSS.");
        }
        if (depth != 0 || quote != '\0' || comment) throw new ArgumentException("Incomplete upstream CSS.");
    }
}
