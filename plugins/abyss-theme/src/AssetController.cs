using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.AbyssTheme;

[ApiController]
[Route("AbyssTheme")]
public sealed class AssetController : ControllerBase
{
    [HttpGet("client.js")]
    [AllowAnonymous]
    public IActionResult Script()
    {
        Response.Headers.CacheControl = "no-store";
        return Plugin.Instance is { Active: true }
            ? Content(ThemeStore.Resource("Jellyfin.Plugin.AbyssTheme.Web.client.js"), "application/javascript")
            : NotFound();
    }

    [HttpGet("config.js")]
    [AllowAnonymous]
    public IActionResult ConfigScript() => Resource("config.js", "application/javascript");

    [HttpGet("config.css")]
    [AllowAnonymous]
    public IActionResult ConfigStyle() => Resource("config.css", "text/css");

    private IActionResult Resource(string name, string type)
    {
        Response.Headers.CacheControl = "no-store";
        return Plugin.Instance is { Active: true } ? Content(ThemeStore.Resource("Jellyfin.Plugin.AbyssTheme.Web." + name), type) : NotFound();
    }

    [HttpGet("runtime")]
    [AllowAnonymous]
    public IActionResult Runtime()
    {
        Response.Headers.CacheControl = "no-store";
        if (Plugin.Instance is not { Active: true } plugin) return StatusCode(410);
        var snapshot = plugin.Themes.Snapshot().State;
        var bundle = snapshot.Current ?? ThemeStore.Bundled;
        var fingerprint = System.Text.Json.JsonSerializer.Serialize(snapshot.Settings) + bundle.Revision + bundle.SpotlightRevision + plugin.Version;
        var token = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(fingerprint)))[..16];
        return Ok(new { settings = snapshot.Settings, css = ThemeStyles.Sheet(bundle, snapshot.Settings), dashboardCss = ThemeStyles.Dashboard(snapshot.Settings),
            token, spotlightRevision = bundle.SpotlightRevision ?? ThemeStore.BundledRevision });
    }

    [HttpGet("spotlight.html")]
    [AllowAnonymous]
    public IActionResult Spotlight()
    {
        Response.Headers.CacheControl = "no-store";
        Response.Headers["Content-Security-Policy"] = "frame-ancestors 'self'; base-uri 'none'";
        Response.Headers["X-Frame-Options"] = "SAMEORIGIN";
        if (Plugin.Instance is not { Active: true } plugin) return NotFound();
        var state = plugin.Themes.Snapshot().State;
        if (!state.Settings.Enabled || !state.Settings.Spotlight) return NotFound();
        return Content(SpotlightDocument.Adapt((state.Current ?? ThemeStore.Bundled).SpotlightHtml ?? ThemeStore.Bundled.SpotlightHtml!), "text/html");
    }

    [HttpGet("spotlight.css")]
    [AllowAnonymous]
    public IActionResult SpotlightStyle()
    {
        Response.Headers.CacheControl = "no-store";
        if (Plugin.Instance is not { Active: true } plugin) return NotFound();
        var state = plugin.Themes.Snapshot().State;
        return Content(SpotlightDocument.Css(state.Current ?? ThemeStore.Bundled, state.Settings), "text/css");
    }
}
