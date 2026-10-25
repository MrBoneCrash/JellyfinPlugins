using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.ThemeSongVolume;

[ApiController]
[Route("ThemeSongVolume")]
public sealed class Controller : ControllerBase
{
    private Plugin? Current => Plugin.Instance is { Active: true } plugin ? plugin : null;
    private Guid UserId => Guid.TryParse(User.FindFirstValue("Jellyfin-UserId"), out var id) ? id : Guid.Empty;

    [HttpGet("client.js")]
    [AllowAnonymous]
    public IActionResult Script()
    {
        Response.Headers.CacheControl = "no-store";
        return Current is null ? NotFound() : Content(Plugin.Resource("client.js"), "application/javascript");
    }

    [HttpGet("settings")]
    [Authorize]
    public IActionResult Settings()
    {
        Response.Headers.CacheControl = "no-store";
        if (Current is not { } plugin) return StatusCode(410);
        if (UserId == Guid.Empty) return Unauthorized();
        return Ok(new { profile = plugin.Profiles.Get(UserId), integrationReady = plugin.IntegrationReady });
    }

    [HttpPut("settings")]
    [Authorize]
    [RequestSizeLimit(65536)]
    public IActionResult Save([FromBody] VolumeProfile profile)
    {
        if (Current is not { } plugin) return StatusCode(410);
        if (UserId == Guid.Empty) return Unauthorized();
        try { return Ok(plugin.Profiles.Save(UserId, profile)); }
        catch (ArgumentException error) { return BadRequest(new { message = error.Message }); }
    }

    [HttpDelete("settings")]
    [Authorize]
    public IActionResult Reset()
    {
        if (Current is not { } plugin) return StatusCode(410);
        if (UserId == Guid.Empty) return Unauthorized();
        plugin.Profiles.Reset(UserId);
        return NoContent();
    }
}
