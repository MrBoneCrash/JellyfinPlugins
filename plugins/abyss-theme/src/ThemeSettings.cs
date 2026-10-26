using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace Jellyfin.Plugin.AbyssTheme;

public sealed record ThemeSettings(
    [property: JsonPropertyName("automaticUpdates")] bool AutomaticUpdates = false,
    [property: JsonPropertyName("jellyfinEnhanced")] bool JellyfinEnhanced = false,
    [property: JsonPropertyName("mediaBarEnhanced")] bool MediaBarEnhanced = false)
{
    [JsonPropertyName("enabled")] public bool Enabled { get; init; } = true;
    [JsonPropertyName("liteMode")] public bool LiteMode { get; init; } = false;
    [JsonPropertyName("externalFonts")] public bool ExternalFonts { get; init; } = true;
    [JsonPropertyName("shadows")] public bool Shadows { get; init; } = true;
    [JsonPropertyName("hoverEffects")] public bool HoverEffects { get; init; } = true;
    [JsonPropertyName("entranceAnimations")] public bool EntranceAnimations { get; init; } = true;
    [JsonPropertyName("heartAnimation")] public bool HeartAnimation { get; init; } = true;
    [JsonPropertyName("lockThemeSelectors")] public bool LockThemeSelectors { get; init; } = false;
    [JsonPropertyName("forceDark")] public bool ForceDark { get; init; } = true;
    [JsonPropertyName("showBackdrops")] public bool ShowBackdrops { get; init; } = true;
    [JsonPropertyName("reorderHome")] public bool ReorderHome { get; init; } = false;
    [JsonPropertyName("spotlight")] public bool Spotlight { get; init; } = true;
    [JsonPropertyName("spotlightAutoRotate")] public bool SpotlightAutoRotate { get; init; } = true;
    [JsonPropertyName("spotlightPauseOnHover")] public bool SpotlightPauseOnHover { get; init; } = true;
    [JsonPropertyName("spotlightResume")] public bool SpotlightResume { get; init; } = true;
    [JsonPropertyName("spotlightNextUp")] public bool SpotlightNextUp { get; init; } = true;
    [JsonPropertyName("spotlightMovies")] public bool SpotlightMovies { get; init; } = true;
    [JsonPropertyName("spotlightSeries")] public bool SpotlightSeries { get; init; } = true;
    [JsonPropertyName("spotlightPreferBackdrop")] public bool SpotlightPreferBackdrop { get; init; } = true;
    [JsonPropertyName("spotlightLogo")] public bool SpotlightLogo { get; init; } = true;
    [JsonPropertyName("spotlightOverview")] public bool SpotlightOverview { get; init; } = true;
    [JsonPropertyName("spotlightMetadata")] public bool SpotlightMetadata { get; init; } = true;
    [JsonPropertyName("spotlightProgress")] public bool SpotlightProgress { get; init; } = true;
    [JsonPropertyName("spotlightDots")] public bool SpotlightDots { get; init; } = true;
    [JsonPropertyName("spotlightPlayButton")] public bool SpotlightPlayButton { get; init; } = true;
    [JsonPropertyName("spotlightInfoButton")] public bool SpotlightInfoButton { get; init; } = true;
    [JsonPropertyName("spotlightZoom")] public bool SpotlightZoom { get; init; } = true;
    [JsonPropertyName("spotlightPageBackdrop")] public bool SpotlightPageBackdrop { get; init; } = true;
    [JsonPropertyName("spotlightYieldToOtherBanners")] public bool SpotlightYieldToOtherBanners { get; init; } = true;
    [JsonPropertyName("updateSpotlightCode")] public bool UpdateSpotlightCode { get; init; } = false;
    [JsonPropertyName("radius")] public int Radius { get; init; } = 12;
    [JsonPropertyName("backdropBlur")] public int BackdropBlur { get; init; } = 23;
    [JsonPropertyName("glassBlur")] public int GlassBlur { get; init; } = 15;
    [JsonPropertyName("fontScale")] public int FontScale { get; init; } = 100;
    [JsonPropertyName("updateIntervalHours")] public int UpdateIntervalHours { get; init; } = 24;
    [JsonPropertyName("spotlightHeight")] public int SpotlightHeight { get; init; } = 65;
    [JsonPropertyName("spotlightMobileHeight")] public int SpotlightMobileHeight { get; init; } = 80;
    [JsonPropertyName("spotlightInterval")] public int SpotlightInterval { get; init; } = 8;
    [JsonPropertyName("spotlightRefresh")] public int SpotlightRefresh { get; init; } = 60;
    [JsonPropertyName("spotlightLimit")] public int SpotlightLimit { get; init; } = 7;
    [JsonPropertyName("spotlightImageQuality")] public int SpotlightImageQuality { get; init; } = 88;
    [JsonPropertyName("accent")] public string Accent { get; init; } = "#f5f5f7";
    [JsonPropertyName("indicatorColor")] public string IndicatorColor { get; init; } = "#373737";
    [JsonPropertyName("glassTint")] public string GlassTint { get; init; } = "#2a2a2a";
    [JsonPropertyName("font")] public string Font { get; init; } = "google";
    [JsonPropertyName("motion")] public string Motion { get; init; } = "system";
    [JsonPropertyName("dashboardStyle")] public string DashboardStyle { get; init; } = "safe";
    [JsonPropertyName("spotlightEmpty")] public string SpotlightEmpty { get; init; } = "hide";
    [JsonPropertyName("homeOrder")] public string[] HomeOrder { get; init; } = ["resume", "nextup", "smalllibrarytiles", "latestmedia"];

    public ThemeSettings Validated()
    {
        if (Radius is < 0 or > 40) throw new ArgumentException("Radius must be between 0 and 40.");
        if (BackdropBlur is < 0 or > 40) throw new ArgumentException("BackdropBlur must be between 0 and 40.");
        if (GlassBlur is < 0 or > 40) throw new ArgumentException("GlassBlur must be between 0 and 40.");
        if (FontScale is < 85 or > 125) throw new ArgumentException("FontScale must be between 85 and 125.");
        if (UpdateIntervalHours is < 1 or > 168) throw new ArgumentException("UpdateIntervalHours must be between 1 and 168.");
        if (SpotlightHeight is < 35 or > 90) throw new ArgumentException("SpotlightHeight must be between 35 and 90.");
        if (SpotlightMobileHeight is < 40 or > 100) throw new ArgumentException("SpotlightMobileHeight must be between 40 and 100.");
        if (SpotlightInterval is < 3 or > 60) throw new ArgumentException("SpotlightInterval must be between 3 and 60.");
        if (SpotlightRefresh is < 30 or > 600) throw new ArgumentException("SpotlightRefresh must be between 30 and 600.");
        if (SpotlightLimit is < 1 or > 12) throw new ArgumentException("SpotlightLimit must be between 1 and 12.");
        if (SpotlightImageQuality is < 50 or > 100) throw new ArgumentException("SpotlightImageQuality must be between 50 and 100.");
        if (Accent is null || !Regex.IsMatch(Accent, "^#[a-fA-F0-9]{6}$")) throw new ArgumentException("Accent must be a six-digit hex color.");
        if (IndicatorColor is null || !Regex.IsMatch(IndicatorColor, "^#[a-fA-F0-9]{6}$")) throw new ArgumentException("IndicatorColor must be a six-digit hex color.");
        if (GlassTint is null || !Regex.IsMatch(GlassTint, "^#[a-fA-F0-9]{6}$")) throw new ArgumentException("GlassTint must be a six-digit hex color.");
        if (Font is not ("google" or "system" or "inter" or "serif")) throw new ArgumentException("Invalid Font option.");
        if (Motion is not ("system" or "reduced" or "full")) throw new ArgumentException("Invalid Motion option.");
        if (DashboardStyle is not ("off" or "safe" or "full")) throw new ArgumentException("Invalid DashboardStyle option.");
        if (SpotlightEmpty is not ("hide" or "message")) throw new ArgumentException("Invalid SpotlightEmpty option.");
        string[] sections = ["resume", "nextup", "smalllibrarytiles", "latestmedia"];
        if (HomeOrder is null || HomeOrder.Length != 4 || HomeOrder.Distinct().Count() != 4 || HomeOrder.Except(sections).Any())
            throw new ArgumentException("Home order must contain the four supported sections exactly once.");
        if (Spotlight && !(SpotlightResume || SpotlightNextUp || SpotlightMovies || SpotlightSeries))
            throw new ArgumentException("Select at least one Spotlight content source.");
        return this with { HomeOrder = (string[])HomeOrder.Clone() };
    }
}
