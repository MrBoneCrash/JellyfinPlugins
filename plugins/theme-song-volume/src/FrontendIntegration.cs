using System.Reflection;
using System.Runtime.Loader;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;

namespace Jellyfin.Plugin.ThemeSongVolume;

public sealed class ServiceRegistrator : IPluginServiceRegistrator
{
    public void RegisterServices(IServiceCollection services, IServerApplicationHost host) =>
        services.AddHostedService<FrontendIntegration>();
}

public sealed class FrontendIntegration(ILogger<FrontendIntegration> logger) : BackgroundService
{
    private static Type? _interface;
    private static readonly object Gate = new();

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Helper plugins may finish initializing after this hosted service starts.
        for (var attempt = 0; attempt < 30 && !stoppingToken.IsCancellationRequested; attempt++)
        {
            if (Plugin.Instance is not { Active: true } plugin) return;
            var api = AssemblyLoadContext.All.SelectMany(context => context.Assemblies)
                .Select(assembly => assembly.GetType("Jellyfin.Plugin.FileTransformation.PluginInterface"))
                .FirstOrDefault(type => type is not null);
            if (api?.GetMethod("RemoveTransformation") is not null && api.GetMethod("RegisterTransformation") is not null)
            {
                try
                {
                    lock (Gate)
                    {
                        if (!plugin.Active || stoppingToken.IsCancellationRequested) return;
                        api.GetMethod("RegisterTransformation")!.Invoke(null,
                        [new JObject
                        {
                            ["id"] = Plugin.PluginId,
                            ["fileNamePattern"] = @"(?:^|[/\\])(?:index\.html|[^/\\]+\.js)$",
                            ["callbackAssembly"] = typeof(WebTransformation).Assembly.FullName,
                            ["callbackClass"] = typeof(WebTransformation).FullName,
                            ["callbackMethod"] = nameof(WebTransformation.Transform)
                        }]);
                        _interface = api;
                        plugin.IntegrationReady = true;
                    }
                    logger.LogInformation("Theme Song Volume registered its reversible web integration.");
                    return;
                }
                catch (Exception error) when (error is TargetInvocationException or InvalidOperationException)
                {
                    logger.LogDebug(error, "Theme Song Volume is waiting for File Transformation.");
                }
            }
            await Task.Delay(TimeSpan.FromSeconds(1), stoppingToken);
        }
        logger.LogWarning("Theme Song Volume needs File Transformation 3.x. Web files were left unchanged.");
    }

    public static void Unregister()
    {
        lock (Gate)
        {
            if (Plugin.Instance is { } plugin) plugin.IntegrationReady = false;
            try { _interface?.GetMethod("RemoveTransformation")?.Invoke(null, [Guid.Parse(Plugin.PluginId)]); }
            catch (Exception error) when (error is TargetInvocationException or ObjectDisposedException) { /* Server is stopping. */ }
            _interface = null;
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        await base.StopAsync(cancellationToken);
        Unregister();
    }
}
