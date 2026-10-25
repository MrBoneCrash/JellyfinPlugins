using Jellyfin.Plugin.ThemeSongVolume;
using Xunit;
using System.Reflection;
using System.Security.Claims;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;

public sealed class PluginTests : IDisposable
{
    private readonly string _directory = Path.Combine(Path.GetTempPath(), "theme-volume-test-" + Guid.NewGuid().ToString("N"));
    public void Dispose() { if (Directory.Exists(_directory)) Directory.Delete(_directory, true); }

    [Fact]
    public void ProfilesAreIsolatedAndDefaultsDoNotCreateFiles()
    {
        var store = new ProfileStore(_directory);
        var user = Guid.NewGuid();
        Assert.Equal(25, store.Get(user).Volume);
        Assert.False(Directory.Exists(_directory));
        store.Save(user, new() { Volume = 0, Overrides = new() { [Guid.NewGuid().ToString()] = 100 } });
        Assert.Equal(0, store.Get(user).Volume);
        Assert.Equal(25, store.Get(Guid.NewGuid()).Volume);
        store.Reset(user);
        Assert.Empty(Directory.GetFiles(_directory));
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(101)]
    public void InvalidVolumeIsRejectedWithoutWriting(int volume)
    {
        Assert.Throws<ArgumentException>(() => new ProfileStore(_directory).Save(Guid.NewGuid(), new() { Volume = volume }));
        Assert.False(Directory.Exists(_directory));
    }

    [Fact]
    public void OverrideIdsAreValidatedAndCanonicalized()
    {
        var song = Guid.NewGuid();
        var profile = new VolumeProfile { Overrides = new() { [song.ToString()] = 0 } }.Validated();
        Assert.Equal(0, profile.Overrides[song.ToString("N")]);
        Assert.Throws<ArgumentException>(() => new VolumeProfile { Overrides = new() { ["../other"] = 50 } }.Validated());
        Assert.Throws<ArgumentException>(() => new VolumeProfile { Overrides = new() { [song.ToString()] = 101 } }.Validated());
    }

    [Fact]
    public void UninstallRemovesOwnedFilesAndPreventsLateWrites()
    {
        var store = new ProfileStore(_directory);
        store.Save(Guid.NewGuid(), new());
        store.RemoveAll();
        store.RemoveAll();
        Assert.False(Directory.Exists(_directory));
        Assert.Throws<ObjectDisposedException>(() => store.Save(Guid.NewGuid(), new()));
    }

    [Fact]
    public void UninstallPreservesUnknownFiles()
    {
        var store = new ProfileStore(_directory);
        store.Save(Guid.NewGuid(), new());
        File.WriteAllText(Path.Combine(_directory, "unrelated.txt"), "keep");
        store.RemoveAll();
        Assert.Equal(["unrelated.txt"], Directory.GetFiles(_directory).Select(Path.GetFileName));
    }

    [Theory]
    [InlineData("helper.saveVolume(this.volume)")]
    [InlineData("(0,h.saveVolume)(this.volume)")]
    public void AudioIntegrationIsScopedAndIdempotent(string save)
    {
        var source = "class A {constructor(){const s=this;s.name='Html Audio Player';s.id='htmlaudioplayer';function start(e,o){unbind(e);bind(e);const url=o.url;console.debug('playing url: '+url);}function changed(){" + save + ";}}}";
        var result = WebTransformation.Apply(source);
        Assert.Contains(".prepare(e,o.item)", result);
        Assert.Contains("shouldPersist(this)", result);
        Assert.Equal(result, WebTransformation.Apply(result));
        // If one integration point changed, do not apply half an audio integration.
        var changed = source.Replace("unbind(e)", "newBindingApi()");
        Assert.Equal(changed, WebTransformation.Apply(changed));
    }

    [Fact]
    public void ThemeIntegrationOnlyMarksAutomaticThemePlayback()
    {
        var source = "p.play({items:songs,aspectRatio:'cover',fullscreen:false,enableRemotePlayers:false});console.error('[ThemeMediaPlayer] failed to load theme media');";
        Assert.Contains(".themes(songs)", WebTransformation.Apply(source));
        var normalPlayback = source.Replace("fullscreen:false", "fullscreen:true");
        Assert.Equal(normalPlayback, WebTransformation.Apply(normalPlayback));
        Assert.Equal("unknown bundle", WebTransformation.Apply("unknown bundle"));
    }

    [Fact]
    public void IndexIntegrationPreservesOtherScriptsAndIsIdempotent()
    {
        const string source = "<html><head><script src='other.js'></script></head><body></body></html>";
        var result = WebTransformation.Apply(source);
        Assert.Contains("src='other.js'", result);
        Assert.Contains("../ThemeSongVolume/client.js", result);
        Assert.Equal(result, WebTransformation.Apply(result));
    }

    [Fact]
    public void HtmlInsideJavaScriptDoesNotReceiveAnHtmlScriptTag()
    {
        const string source = "const template = '<html><head></head><body></body></html>';";
        Assert.Equal(source, WebTransformation.Apply(source));
    }

    [Fact]
    public void IndexRegistrationSharesTheExactPipelineUsedByOtherPlugins()
    {
        var registrations = FrontendIntegration.CreateRegistrations();
        var index = Assert.Single(registrations, item => item.Value<string>("fileNamePattern") == "index.html");
        Assert.Equal(Plugin.PluginId, index.Value<string>("id"));
        Assert.Equal(2, registrations.Select(item => item.Value<string>("id")).Distinct().Count());
        var scripts = Assert.Single(registrations, item => item != index);
        var regex = new System.Text.RegularExpressions.Regex(scripts.Value<string>("fileNamePattern")!);
        Assert.Matches(regex, "htmlAudioPlayer-plugin.hash.chunk.js");
        Assert.DoesNotMatch(regex, "index.html");
    }

    [Fact]
    public void InstalledPluginInfoCanBeEnumeratedAndSerialized()
    {
        var paths = DispatchProxy.Create<IApplicationPaths, TestPaths>();
        ((TestPaths)(object)paths).Directory = _directory;
        var plugin = new Plugin(paths);
        var assembly = typeof(Plugin).Assembly;
        var local = new LocalPlugin(Path.GetDirectoryName(assembly.Location)!, true, new PluginManifest
        {
            Id = plugin.Id,
            Name = plugin.Name,
            Version = assembly.GetName().Version!.ToString()
        }) { Instance = plugin };

        // GET /Plugins lazily enumerates LocalPlugin.GetPluginInfo during serialization.
        var json = JsonSerializer.Serialize(new[] { local }.Select(item => item.GetPluginInfo()));
        using var document = JsonDocument.Parse(json);
        Assert.Equal(1, document.RootElement.GetArrayLength());
        Assert.Equal(assembly.Location, plugin.AssemblyFilePath);
        Assert.Equal(assembly.GetName().Version, plugin.Version);
        Assert.Equal(Path.Combine(_directory, assembly.GetName().Name!), plugin.DataFolderPath);
        Assert.Equal(plugin.Id, local.GetPluginInfo().Id);
        Assert.False(Directory.Exists(_directory));
    }

    [Fact]
    public void SettingsEndpointsUseOnlyTheAuthenticatedUsersIdentity()
    {
        var paths = DispatchProxy.Create<IApplicationPaths, TestPaths>();
        ((TestPaths)(object)paths).Directory = _directory;
        var plugin = new Plugin(paths);
        var user = Guid.NewGuid();
        var controller = new Jellyfin.Plugin.ThemeSongVolume.Controller
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };
        Assert.IsType<UnauthorizedResult>(controller.Settings());
        Assert.IsType<UnauthorizedResult>(controller.Save(new()));
        Assert.IsType<UnauthorizedResult>(controller.Reset());
        controller.HttpContext.User = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim("Jellyfin-UserId", user.ToString())], "fixture"));
        Assert.IsType<OkObjectResult>(controller.Save(new() { Volume = 10 }));
        Assert.Equal(10, plugin.Profiles.Get(user).Volume);
        Assert.Equal(25, plugin.Profiles.Get(Guid.NewGuid()).Volume);
        foreach (var name in new[] { "Settings", "Save", "Reset" })
            Assert.NotNull(typeof(Jellyfin.Plugin.ThemeSongVolume.Controller).GetMethod(name)!.GetCustomAttribute<AuthorizeAttribute>());
        Assert.IsType<BadRequestObjectResult>(controller.Save(new() { Volume = 101 }));
        plugin.OnUninstalling();
        Assert.IsType<StatusCodeResult>(controller.Settings());
        Assert.False(Directory.Exists(Path.Combine(_directory, "MrBoneCrash.ThemeSongVolume")));
    }

    [Fact]
    public void VerifyExternalWebSourcesWhenProvided()
    {
        var sourceDirectory = Environment.GetEnvironmentVariable("THEME_VOLUME_WEB_SOURCES");
        if (sourceDirectory is null) return;
        foreach (var name in new[] { "htmlAudioPlayer12.js", "htmlAudioPlayer12.min.js", "themeMediaPlayer12.js", "themeMediaPlayer12.min.js" })
        {
            var source = File.ReadAllText(Path.Combine(sourceDirectory, name));
            var result = WebTransformation.Apply(source);
            Assert.NotEqual(source, result);
            Assert.Contains(name.StartsWith("html") ? "shouldPersist(this)" : ".themes(", result);
            File.WriteAllText(Path.Combine(sourceDirectory, name + ".transformed.mjs"), result);
        }
    }
}

public class TestPaths : DispatchProxy
{
    public string Directory { get; set; } = "";
    protected override object? Invoke(MethodInfo? targetMethod, object?[]? args) => Directory;
}
