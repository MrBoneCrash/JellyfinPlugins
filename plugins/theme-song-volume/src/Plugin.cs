using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.ThemeSongVolume;

public sealed class Plugin : BasePlugin, IHasWebPages
{
    public const string PluginId = "bc7977c8-ec09-4da4-8030-97c7e5a21491";
    public static Plugin? Instance { get; private set; }
    public bool Active { get; private set; } = true;
    public ProfileStore Profiles { get; }
    public bool IntegrationReady { get; internal set; }

    public Plugin(IApplicationPaths paths)
    {
        Profiles = new ProfileStore(Path.Combine(paths.PluginConfigurationsPath, "MrBoneCrash.ThemeSongVolume"));
        Instance = this;
    }

    public override string Name => "Theme Song Volume";
    public override string Description => "Default theme-song volume and individual song overrides. Source files and normal playback volume stay unchanged.";
    public override Guid Id => Guid.Parse(PluginId);

    public IEnumerable<PluginPageInfo> GetPages() =>
    [
        new() { Name = "ThemeSongVolume", EmbeddedResourcePath = "Jellyfin.Plugin.ThemeSongVolume.Web.config.html" }
    ];

    public override void OnUninstalling()
    {
        Active = false;
        FrontendIntegration.Unregister();
        Profiles.RemoveAll();
        base.OnUninstalling();
    }

    public static string Resource(string name)
    {
        using var stream = typeof(Plugin).Assembly.GetManifestResourceStream($"Jellyfin.Plugin.ThemeSongVolume.Web.{name}")
            ?? throw new InvalidOperationException($"Missing embedded asset: {name}");
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
