using System.Reflection;
using Jellyfin.Plugin.AbyssTheme;
using MediaBrowser.Common.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Newtonsoft.Json.Linq;
using Xunit;
using Api = Jellyfin.Plugin.FileTransformation.PluginInterface;

[assembly: CollectionBehavior(DisableTestParallelization = true)]

public sealed class PluginTests
{
    private const string Shell = "<!doctype html><html><head><link href='other.css'><script src='runtime.bundle.js'></script><script src='main.jellyfin.bundle.js'></script></head><body></body></html>";
    private static Plugin NewPlugin() => new(DispatchProxy.Create<IApplicationPaths, TestPaths>());

    [Fact]
    public void ThemeIsBundledIdempotentAndPreservesOtherPlugins()
    {
        var other = "<script id='other-plugin'>unchanged()</script>";
        var html = Shell.Replace("</head>", other + "</head>");
        var themed = WebTransformation.Apply(html);
        Assert.Contains("--abyss-accent", themed);
        Assert.Contains("AumGupta/abyss-jellyfin", themed);
        Assert.Contains(other, themed);
        Assert.Contains("<link href='other.css'>", themed);
        Assert.Equal(themed, WebTransformation.Apply(themed));
        Assert.StartsWith("<!doctype html><html><head>\n<style", themed);
    }

    [Theory]
    [InlineData("<html><head></head><body>Dashboard</body></html>")]
    [InlineData("<script>main.jellyfin.bundle.js runtime.bundle.js</script>")]
    [InlineData("<html><header></header><script src='main.jellyfin.bundle.js'></script><script src='runtime.bundle.js'></script></head></html>")]
    [InlineData("main.jellyfin.bundle.js runtime.bundle.js <head><head></head>")]
    public void UnknownShellsRemainUntouched(string html) => Assert.Equal(html, WebTransformation.Apply(html));

    [Fact]
    public async Task StartupUninstallAndRestartOwnOnlyOneRegistration()
    {
        Api.Registrations.Clear();
        var otherId = Guid.Parse("bc7977c8-ec09-4da4-8030-97c7e5a21491");
        Api.Registrations[otherId] = new JObject { ["fileNamePattern"] = "index.html" };
        var plugin = NewPlugin();
        Assert.NotNull(plugin.GetPluginInfo());
        Assert.Equal("0.2.0.0", plugin.Version.ToString());
        using var integration = new ThemeIntegration(NullLogger<ThemeIntegration>.Instance);
        await integration.StartAsync(default);
        await integration.ExecuteTask!.WaitAsync(TimeSpan.FromSeconds(5));
        Assert.Equal(2, Api.Registrations.Count);
        Assert.Equal("index.html", Api.Registrations[plugin.Id].Value<string>("fileNamePattern"));
        var payload = new JObject { ["contents"] = Shell };
        Assert.Contains(WebTransformation.Marker, WebTransformation.Transform(payload));
        // Repeated registration must remain additive, including concurrently
        // requested pages during uninstall.
        using var second = new ThemeIntegration(NullLogger<ThemeIntegration>.Instance);
        await second.StartAsync(default);
        await second.ExecuteTask!.WaitAsync(TimeSpan.FromSeconds(5));
        Assert.Equal(2, Api.Registrations.Count);
        await Task.WhenAll(Enumerable.Range(0, 20).Select(_ => Task.Run(() => { WebTransformation.Transform(payload); })).Append(Task.Run(plugin.OnUninstalling)));
        plugin.OnUninstalling();
        Assert.Equal(Shell, WebTransformation.Transform(payload));
        Assert.Single(Api.Registrations);
        Assert.True(Api.Registrations.ContainsKey(otherId));
        await second.StopAsync(default);
        await integration.StopAsync(default);
        var restarted = NewPlugin();
        using var afterUpdate = new ThemeIntegration(NullLogger<ThemeIntegration>.Instance);
        await afterUpdate.StartAsync(default);
        await afterUpdate.ExecuteTask!.WaitAsync(TimeSpan.FromSeconds(5));
        Assert.Contains(WebTransformation.Marker, WebTransformation.Transform(payload));
        await afterUpdate.StopAsync(default);
        Assert.Equal(Shell, WebTransformation.Transform(payload));
        Assert.Single(Api.Registrations);
    }
}

public class TestPaths : DispatchProxy
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "abyss-plugin-tests-" + Guid.NewGuid().ToString("N"));
    protected override object? Invoke(MethodInfo? targetMethod, object?[]? args) =>
        targetMethod?.ReturnType == typeof(string) ? _root : null;
}
