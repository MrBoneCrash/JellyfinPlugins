using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.AbyssTheme;

[ApiController]
[Route("AbyssTheme")]
[Authorize(Policy = "RequiresElevation")]
public sealed class Controller : ControllerBase
{
    [HttpGet("status")]
    public IActionResult Status()
    {
        Response.Headers.CacheControl = "no-store";
        if (Plugin.Instance is not { Active: true } plugin) return StatusCode(410);
        var state = plugin.Themes.Snapshot().State;
        return Ok(new { settings = state.Settings, defaults = new ThemeSettings(), revision = (state.Current ?? ThemeStore.Bundled).Revision,
            integrationReady = plugin.IntegrationReady,
            bundledRevision = ThemeStore.BundledRevision, previousRevision = state.Previous?.Revision,
            spotlightRevision = (state.Current ?? ThemeStore.Bundled).SpotlightRevision ?? ThemeStore.BundledRevision,
            lastChecked = Plugin.Updater?.LastChecked, checking = Plugin.Updater?.Checking ?? false,
            error = Plugin.Updater?.LastError ?? plugin.Themes.LoadWarning });
    }
    [HttpPut("settings")]
    [RequestSizeLimit(4096)]
    public IActionResult Settings([FromBody] ThemeSettings settings)
    {
        if (Plugin.Instance is not { Active: true } plugin) return StatusCode(410);
        try { plugin.Themes.Settings(settings); }
        catch (ArgumentException error) { return BadRequest(new { message = error.Message }); }
        return NoContent();
    }
    [HttpPost("check")]
    public async Task<IActionResult> Check(CancellationToken token)
    {
        if (Plugin.Instance is not { Active: true }) return StatusCode(410);
        if (Plugin.Updater is not { } updater) return StatusCode(503);
        await updater.CheckAsync(token);
        return Status();
    }
    [HttpPost("rollback")]
    public IActionResult Rollback()
    {
        if (Plugin.Instance is not { Active: true } plugin) return StatusCode(410);
        plugin.Themes.Rollback();
        return NoContent();
    }
    [HttpPost("reset")]
    public IActionResult Reset()
    {
        if (Plugin.Instance is not { Active: true } plugin) return StatusCode(410);
        plugin.Themes.Reset();
        return NoContent();
    }

    [HttpPost("reset-section/{section}")]
    public IActionResult ResetSection(string section)
    {
        if (Plugin.Instance is not { Active: true } plugin) return StatusCode(410);
        var settings = plugin.Themes.Snapshot().State.Settings;
        var defaults = new ThemeSettings();
        var json = System.Text.Json.Nodes.JsonNode.Parse(System.Text.Json.JsonSerializer.Serialize(settings))!.AsObject();
        var baseline = System.Text.Json.Nodes.JsonNode.Parse(System.Text.Json.JsonSerializer.Serialize(defaults))!.AsObject();
        bool Included(string key) => section switch
        {
            "spotlight" => key.StartsWith("spotlight", StringComparison.Ordinal),
            "updates" => key is "automaticUpdates" or "updateIntervalHours" or "updateSpotlightCode",
            "integrations" => key is "jellyfinEnhanced" or "mediaBarEnhanced",
            "layout" => key is "forceDark" or "showBackdrops" or "reorderHome" or "homeOrder" or "dashboardStyle" or "lockThemeSelectors",
            "appearance" => key is "liteMode" or "externalFonts" or "shadows" or "hoverEffects" or "entranceAnimations" or "heartAnimation" or "radius" or "backdropBlur" or "glassBlur" or "fontScale" or "accent" or "indicatorColor" or "glassTint" or "font" or "motion",
            _ => false
        };
        if (section is not ("spotlight" or "updates" or "integrations" or "layout" or "appearance")) return BadRequest(new { message = "Unknown settings section." });
        foreach (var pair in baseline.Where(pair => Included(pair.Key))) json[pair.Key] = pair.Value?.DeepClone();
        plugin.Themes.Settings(System.Text.Json.JsonSerializer.Deserialize<ThemeSettings>(json.ToJsonString())!);
        return NoContent();
    }
}
