using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.AbyssTheme;

public sealed class ThemeUpdater(ILogger<ThemeUpdater> logger) : BackgroundService
{
    private readonly HttpClient _client = new(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(20) };
    private readonly SemaphoreSlim _check = new(1, 1);
    private DateTimeOffset? _lastAttempt;
    public DateTimeOffset? LastChecked { get; private set; }
    public string? LastError { get; private set; }
    public bool Checking { get; private set; }

    public async Task CheckAsync(CancellationToken token)
    {
        var plugin = Plugin.Instance;
        if (plugin is not { Active: true }) return;
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(token, plugin.Lifetime.Token);
        await _check.WaitAsync(linked.Token);
        try
        {
            if (!plugin.Active) return;
            Checking = true;
            _lastAttempt = DateTimeOffset.UtcNow;
            var snapshot = plugin.Themes.Snapshot();
            try
            {
                var bundle = await DownloadAsync(_client, linked.Token, snapshot.State.Current ?? ThemeStore.Bundled, snapshot.State.Settings.UpdateSpotlightCode);
                linked.Token.ThrowIfCancellationRequested();
                if (plugin.Active) plugin.Themes.Promote(bundle, snapshot.Generation);
                LastChecked = DateTimeOffset.UtcNow;
                LastError = null;
            }
            catch (Exception e) when (e is HttpRequestException or IOException or UnauthorizedAccessException or JsonException or ArgumentException or OperationCanceledException or KeyNotFoundException or InvalidOperationException)
            {
                if (linked.IsCancellationRequested) throw;
                LastError = "Theme update failed validation or could not be downloaded. The active theme was kept. Check the server log and try again later.";
                logger.LogWarning(e, "Abyss update rejected; retaining the active theme.");
            }
        }
        finally { Checking = false; _check.Release(); }
    }

    public static async Task<ThemeBundle> DownloadAsync(HttpClient client, CancellationToken token, ThemeBundle? previous = null, bool includeSpotlightCode = false)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
        timeout.CancelAfter(TimeSpan.FromSeconds(60));
        token = timeout.Token;
        var metadata = await Fetch(client, "https://api.github.com/repos/AumGupta/abyss-jellyfin/commits/main", token);
        using var document = JsonDocument.Parse(metadata);
        var sha = document.RootElement.GetProperty("sha").GetString();
        if (sha is null || !System.Text.RegularExpressions.Regex.IsMatch(sha, "^[a-f0-9]{40}$")) throw new ArgumentException("Invalid upstream revision.");
        async Task<string> File(string path) => await Fetch(client, "https://raw.githubusercontent.com/AumGupta/abyss-jellyfin/" + sha + "/" + path, token);
        // Resolve main once, then fetch every asset and its license at that exact
        // immutable revision. A partial download never becomes the active bundle.
        var downloads = await Task.WhenAll(File("abyss.css"), File("styles/abyss-je.css"), File("styles/abyss-mbe.css"), File("LICENSE"), File("styles/abyss-lite.css"), File("scripts/spotlight/spotlight.css"));
        var spotlight = includeSpotlightCode ? await File("scripts/spotlight/spotlight.html") : previous?.SpotlightHtml ?? ThemeStore.Bundled.SpotlightHtml;
        var bundle = new ThemeBundle(sha, downloads[0], downloads[1], downloads[2], downloads[3], downloads[4], downloads[5], spotlight,
            includeSpotlightCode ? sha : previous?.SpotlightRevision ?? ThemeStore.BundledRevision);
        ThemeStore.Validate(bundle);
        return bundle;
    }

    private static async Task<string> Fetch(HttpClient client, string url, CancellationToken token)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.UserAgent.ParseAdd("MrBoneCrash-AbyssTheme/0.3.0");
        using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, token);
        if (response.StatusCode != HttpStatusCode.OK) throw new HttpRequestException("Upstream returned " + (int)response.StatusCode);
        if (response.Content.Headers.ContentLength > 512 * 1024) throw new IOException("Upstream asset is too large.");
        await using var stream = await response.Content.ReadAsStreamAsync(token);
        using var memory = new MemoryStream();
        var buffer = new byte[8192];
        int count;
        while ((count = await stream.ReadAsync(buffer, token)) != 0)
        {
            if (memory.Length + count > 512 * 1024) throw new IOException("Upstream asset is too large.");
            memory.Write(buffer, 0, count);
        }
        return new System.Text.UTF8Encoding(false, true).GetString(memory.ToArray());
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        Plugin.Updater = this;
        try
        {
            while (!stoppingToken.IsCancellationRequested && Plugin.Instance is { Active: true } plugin)
            {
                if (plugin.Themes.Snapshot().State.Settings.AutomaticUpdates &&
                    (_lastAttempt is null || DateTimeOffset.UtcNow - _lastAttempt >= TimeSpan.FromHours(plugin.Themes.Snapshot().State.Settings.UpdateIntervalHours)))
                    await CheckAsync(stoppingToken);
                await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested || Plugin.Instance is not { Active: true }) { }
        finally { if (ReferenceEquals(Plugin.Updater, this)) Plugin.Updater = null; }
    }

    public override void Dispose() { _client.Dispose(); base.Dispose(); }
}
