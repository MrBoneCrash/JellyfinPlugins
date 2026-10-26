using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.AbyssTheme;

public sealed class Plugin : BasePlugin, IHasWebPages
{
    public const string PluginId = "de52c4ed-29ee-4e5f-b722-485dcd5503f0";
    public static Plugin? Instance { get; private set; }
    public bool Active { get; internal set; } = true;
    public bool IntegrationReady { get; internal set; }
    public ThemeStore Themes { get; }
    public CancellationTokenSource Lifetime { get; } = new();
    public static ThemeUpdater? Updater { get; internal set; }

    public Plugin(IApplicationPaths paths)
    {
        var assembly = GetType().Assembly;
        var name = assembly.GetName();
        SetAttributes(assembly.Location, Path.Combine(paths.PluginsPath, name.Name!), name.Version!);
        Themes = new ThemeStore(Path.Combine(paths.PluginConfigurationsPath, "MrBoneCrash.AbyssTheme"));
        Instance = this;
    }

    public override string Name => "Abyss Theme";
    public override Guid Id => Guid.Parse(PluginId);
    public override string Description => "Abyss theme and Spotlight by Om Gupta (AumGupta), MIT licensed: https://github.com/AumGupta/abyss-jellyfin. Configurable appearance, Lite mode, reversible layout and optional upstream updates. Requires File Transformation 3.x and compatible server-hosted Jellyfin Web.";

    public IEnumerable<PluginPageInfo> GetPages() =>
    [new() { Name = "AbyssTheme", EmbeddedResourcePath = "Jellyfin.Plugin.AbyssTheme.Web.config.html" }];

    public override void OnUninstalling()
    {
        lock (ThemeIntegration.Gate)
        {
            Active = false;
            Lifetime.Cancel();
            ThemeIntegration.Unregister();
            Themes.Remove();
        }
        base.OnUninstalling();
    }
}
