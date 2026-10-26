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
}
