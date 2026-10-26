using System.Reflection;
using System.Runtime.Loader;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;

namespace Jellyfin.Plugin.AbyssTheme;

public sealed class ServiceRegistrator : IPluginServiceRegistrator
{
    public void RegisterServices(IServiceCollection services, IServerApplicationHost host)
    {
        services.AddHostedService<ThemeIntegration>();
        services.AddHostedService<ThemeUpdater>();
    }
}

public sealed class ThemeIntegration(ILogger<ThemeIntegration> logger) : BackgroundService
{
    internal static readonly object Gate = new();
    private static Type? _api;

    public static JObject Registration() => new()
    {
        ["id"] = Plugin.PluginId,
        // File Transformation prioritizes literal keys. Share its index.html
        // pipeline with Theme Song Volume and other additive UI plugins.
        ["fileNamePattern"] = "index.html",
        ["callbackAssembly"] = typeof(WebTransformation).Assembly.FullName,
        ["callbackClass"] = typeof(WebTransformation).FullName,
        ["callbackMethod"] = nameof(WebTransformation.Transform)
    };

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var waitingReported = false;
        while (!stoppingToken.IsCancellationRequested)
        {
            lock (Gate)
            {
                if (Plugin.Instance is not { Active: true }) return;
                var api = AssemblyLoadContext.All.SelectMany(context => context.Assemblies)
                    .Where(assembly => assembly.GetName().Version?.Major == 3)
                    .Select(assembly => assembly.GetType("Jellyfin.Plugin.FileTransformation.PluginInterface"))
                    .FirstOrDefault(type => type is not null);
                if (api?.GetMethod("RegisterTransformation", [typeof(JObject)]) is { } register &&
                    api.GetMethod("RemoveTransformation", [typeof(Guid)]) is not null)
                {
                    try
                    {
                        _api = api;
                        register.Invoke(null, [Registration()]);
                        if (Plugin.Instance is { } plugin) plugin.IntegrationReady = true;
                        logger.LogInformation("Abyss Theme registered. Theme and Spotlight: Om Gupta (AumGupta), MIT; https://github.com/AumGupta/abyss-jellyfin. Configure appearance, Spotlight and layout on the plugin settings page.");
                        return;
                    }
                    catch (Exception error) when (error is TargetInvocationException or InvalidOperationException)
                    {
                        logger.LogDebug(error, "Abyss Theme is waiting for File Transformation initialization.");
                    }
                }
                if (!waitingReported)
                {
                    logger.LogWarning("Abyss Theme needs File Transformation 3.x. Waiting and retrying; Jellyfin web files remain unchanged.");
                    waitingReported = true;
                }
            }
            await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
        }
    }

    internal static void Unregister()
    {
        lock (Gate)
        {
            if (Plugin.Instance is { } plugin) plugin.IntegrationReady = false;
            try { _api?.GetMethod("RemoveTransformation", [typeof(Guid)])?.Invoke(null, [Guid.Parse(Plugin.PluginId)]); }
            catch (Exception error) when (error is TargetInvocationException or ObjectDisposedException) { /* Reload after restart clears the response cache. */ }
            _api = null;
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        lock (Gate)
        {
            if (Plugin.Instance is { } plugin) plugin.Active = false;
            Plugin.Instance?.Lifetime.Cancel();
            Unregister();
        }
        await base.StopAsync(cancellationToken);
    }
}
