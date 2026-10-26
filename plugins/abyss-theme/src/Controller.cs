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
        return Ok(new { settings = state.Settings, revision = (state.Current ?? ThemeStore.Bundled).Revision,
            bundledRevision = ThemeStore.BundledRevision, previousRevision = state.Previous?.Revision,
            lastChecked = Plugin.Updater?.LastChecked, checking = Plugin.Updater?.Checking ?? false,
            error = Plugin.Updater?.LastError ?? plugin.Themes.LoadWarning });
    }
    [HttpPut("settings")]
    [RequestSizeLimit(4096)]
    public IActionResult Settings([FromBody] ThemeSettings settings)
    {
        if (Plugin.Instance is not { Active: true } plugin) return StatusCode(410);
        plugin.Themes.Settings(settings);
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
}
