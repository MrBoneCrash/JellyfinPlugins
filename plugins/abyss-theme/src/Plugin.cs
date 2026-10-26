using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;

namespace Jellyfin.Plugin.AbyssTheme;

public sealed class Plugin : BasePlugin
{
    public const string PluginId = "de52c4ed-29ee-4e5f-b722-485dcd5503f0";
    public static Plugin? Instance { get; private set; }
    public bool Active { get; internal set; } = true;

    public Plugin(IApplicationPaths paths)
    {
        var assembly = GetType().Assembly;
        var name = assembly.GetName();
        SetAttributes(assembly.Location, Path.Combine(paths.PluginsPath, name.Name!), name.Version!);
        Instance = this;
    }

    public override string Name => "Abyss Theme";
    public override Guid Id => Guid.Parse(PluginId);
    public override string Description => "Abyss by Om Gupta (AumGupta), MIT licensed: https://github.com/AumGupta/abyss-jellyfin. Reapplied on server startup; requires File Transformation 3.x and server-hosted Jellyfin Web.";

    public override void OnUninstalling()
    {
        lock (ThemeIntegration.Gate)
        {
            Active = false;
            ThemeIntegration.Unregister();
        }
        base.OnUninstalling();
    }
}
