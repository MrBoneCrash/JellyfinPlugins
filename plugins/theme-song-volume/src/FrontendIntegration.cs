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
    public static readonly Guid ScriptTransformationId = Guid.Parse("53c544da-d30d-4a36-98c1-624e0aa3a0b9");

    public static JObject[] CreateRegistrations() =>
    [
        Registration(Guid.Parse(Plugin.PluginId), "index.html"),
        Registration(ScriptTransformationId, @"(?:^|[/\\])[^/\\]+\.js$")
    ];

    private static JObject Registration(Guid id, string pattern) => new()
    {
        ["id"] = id.ToString(),
        ["fileNamePattern"] = pattern,
        ["callbackAssembly"] = typeof(WebTransformation).Assembly.FullName,
        ["callbackClass"] = typeof(WebTransformation).FullName,
        ["callbackMethod"] = nameof(WebTransformation.Transform)
    };

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
                        _interface = api;
                        // File Transformation 3.x gives exact keys priority over regexes.
                        // Share the literal index.html pipeline with other UI plugins.
                        foreach (var registration in CreateRegistrations())
                            api.GetMethod("RegisterTransformation")!.Invoke(null, [registration]);
                        plugin.IntegrationReady = true;
                    }
                    logger.LogInformation("Theme Song Volume registered its reversible web integration.");
                    return;
                }
                catch (Exception error) when (error is TargetInvocationException or InvalidOperationException)
                {
                    Unregister();
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
            foreach (var id in new[] { Guid.Parse(Plugin.PluginId), ScriptTransformationId })
            {
                try { _interface?.GetMethod("RemoveTransformation")?.Invoke(null, [id]); }
                catch (Exception error) when (error is TargetInvocationException or ObjectDisposedException) { /* Server is stopping. */ }
            }
            _interface = null;
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        await base.StopAsync(cancellationToken);
        Unregister();
    }
}
