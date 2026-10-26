using System.Net;
using System.Text.Json;
using Jellyfin.Plugin.AbyssTheme;
using Microsoft.AspNetCore.Authorization;
using Xunit;

public sealed class UpdateTests : IDisposable
{
    private readonly string _directory = Path.Combine(Path.GetTempPath(), "abyss-updates-" + Guid.NewGuid().ToString("N"));
    public void Dispose() { if (Directory.Exists(_directory)) Directory.Delete(_directory, true); }
    private static ThemeBundle NewBundle(char revision = 'a') => ThemeStore.Bundled with { Revision = new string(revision, 40) };

    [Fact]
    public void SettingsOverridesPersistenceRollbackAndReset()
    {
        var store = new ThemeStore(_directory);
        ThemeStore.Validate(ThemeStore.Bundled);
        Assert.False(store.Snapshot().State.Settings.AutomaticUpdates);
        Assert.DoesNotContain("data-abyss-override", store.Css());
        store.Settings(new(true, true, false));
        Assert.Contains("data-abyss-override=\"je\"", store.Css());
        Assert.DoesNotContain("data-abyss-override=\"mbe\"", store.Css());
        store.Settings(new(true, false, true));
        Assert.DoesNotContain("data-abyss-override=\"je\"", store.Css());
        Assert.Contains("data-abyss-override=\"mbe\"", store.Css());
        store.Promote(NewBundle(), store.Snapshot().Generation);
        store.Promote(NewBundle('b'), store.Snapshot().Generation);
        var restarted = new ThemeStore(_directory);
        Assert.Equal(new string('b', 40), restarted.Snapshot().State.Current!.Revision);
        restarted.Rollback();
        Assert.Equal(new string('a', 40), restarted.Snapshot().State.Current!.Revision);
        Assert.False(restarted.Snapshot().State.Settings.AutomaticUpdates);
        restarted.Reset();
        Assert.Null(restarted.Snapshot().State.Current);
        Assert.Equal(new ThemeSettings(), restarted.Snapshot().State.Settings);
    }

    [Fact]
    public void PendingUpdatesCannotOverrideSettingsRollbackOrUninstall()
    {
        var store = new ThemeStore(_directory);
        var generation = store.Snapshot().Generation;
        store.Rollback();
        Assert.False(store.Promote(NewBundle(), generation));
        var unknown = Path.Combine(_directory, "other-plugin.txt");
        File.WriteAllText(unknown, "preserve");
        store.Remove();
        store.Remove();
        Assert.False(store.Promote(NewBundle(), store.Snapshot().Generation));
        Assert.Throws<ObjectDisposedException>(() => store.Settings(new()));
        Assert.Equal("preserve", File.ReadAllText(unknown));
        Assert.False(File.Exists(Path.Combine(_directory, "state.json")));
    }

    [Fact]
    public void InvalidBundleDoesNotReplaceActiveThemeAndCorruptDiskFallsBack()
    {
        var store = new ThemeStore(_directory);
        store.Promote(NewBundle(), store.Snapshot().Generation);
        foreach (var invalid in new[] {
            NewBundle('b') with { Css = "--abyss-accent { broken" },
            NewBundle('b') with { Css = "--abyss-accent {} </style><script>alert(1)</script>" },
            NewBundle('b') with { MediaBarEnhancedCss = "missing selector {}" },
            NewBundle('b') with { License = "All rights reserved" },
            NewBundle('b') with { Css = new string('x', 600000) } })
            Assert.Throws<ArgumentException>(() => store.Promote(invalid, store.Snapshot().Generation));
        Assert.Equal(new string('a', 40), store.Snapshot().State.Current!.Revision);
        File.WriteAllText(Path.Combine(_directory, "state.json"), "invalid json");
        var restarted = new ThemeStore(_directory);
        Assert.Null(restarted.Snapshot().State.Current);
        Assert.NotNull(restarted.LoadWarning);
    }

    [Fact]
    public async Task DownloadsAllAssetsAtOneImmutableRevisionAndRejectsPartialBundle()
    {
        var requests = new List<string>();
        using var client = new HttpClient(new Handler(request => {
            var url = request.RequestUri!.ToString();
            requests.Add(url);
            var text = url.EndsWith("commits/main") ? JsonSerializer.Serialize(new { sha = new string('a', 40) }) :
                url.EndsWith("/LICENSE") ? ThemeStore.Bundled.License :
                url.EndsWith("abyss-je.css") ? ThemeStore.Bundled.JellyfinEnhancedCss :
                url.EndsWith("abyss-mbe.css") ? ThemeStore.Bundled.MediaBarEnhancedCss : ThemeStore.Bundled.Css;
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(text) };
        }));
        var bundle = await ThemeUpdater.DownloadAsync(client, default);
        Assert.Equal(5, requests.Count);
        Assert.All(requests.Skip(1), url => Assert.Contains('/' + new string('a', 40) + '/', url));
        Assert.Equal(ThemeStore.Bundled.Css, bundle.Css);
        using var missing = new HttpClient(new Handler(_ => new(HttpStatusCode.NotFound)));
        await Assert.ThrowsAsync<HttpRequestException>(() => ThemeUpdater.DownloadAsync(missing, default));
        using var bad = new HttpClient(new Handler(_ => new(HttpStatusCode.OK) { Content = new StringContent("<html>error</html>") }));
        await Assert.ThrowsAnyAsync<JsonException>(() => ThemeUpdater.DownloadAsync(bad, default));
    }

    [Fact]
    public void EveryAdministrationEndpointRequiresElevation()
    {
        var auth = Assert.Single(typeof(Controller).GetCustomAttributes(typeof(AuthorizeAttribute), true).Cast<AuthorizeAttribute>());
        Assert.Equal("RequiresElevation", auth.Policy);
        Assert.DoesNotContain(typeof(Controller).GetMethods(), method => method.GetCustomAttributes(typeof(AllowAnonymousAttribute), true).Length > 0);
    }

    private sealed class Handler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token) => Task.FromResult(respond(request));
    }
}
