using System.Text.Json;
using Jellyfin.Plugin.AbyssTheme;
using Xunit;

public sealed class ConfigurationTests
{
    [Fact]
    public void UnsafeAndOutOfRangeSettingsAreRejected()
    {
        var invalid = new ThemeSettings[] {
            new() { Accent = "red;}</style>" }, new() { GlassTint = "#123" }, new() { IndicatorColor = null! },
            new() { Radius = 41 }, new() { BackdropBlur = -1 }, new() { FontScale = 200 },
            new() { Font = "url(https://external.test)" }, new() { DashboardStyle = "unknown" },
            new() { SpotlightInterval = 1 }, new() { SpotlightLimit = 20 }, new() { SpotlightRefresh = 2 },
            new() { UpdateIntervalHours = 0 }, new() { SpotlightEmpty = "html" },
            new() { HomeOrder = ["resume", "resume", "nextup", "latestmedia"] },
            new() { SpotlightResume = false, SpotlightNextUp = false, SpotlightMovies = false, SpotlightSeries = false }
        };
        foreach (var settings in invalid) Assert.Throws<ArgumentException>(() => settings.Validated());
        new ThemeSettings() { Spotlight = false, SpotlightResume = false, SpotlightNextUp = false, SpotlightMovies = false, SpotlightSeries = false }.Validated();
    }

    [Fact]
    public void AppearanceControlsCreateValidatedCssWithoutUnwantedLocksOrFonts()
    {
        var settings = new ThemeSettings() { Accent = "#336699", Font = "system", ExternalFonts = false,
            LiteMode = true, Radius = 24, Motion = "reduced", Shadows = false }.Validated();
        var css = ThemeStyles.Base(ThemeStore.Bundled, settings) + ThemeStyles.Preferences(settings);
        Assert.Contains("--abyss-accent:51, 102, 153", css);
        Assert.Contains("--abyss-radius:24px", css);
        Assert.Contains("--abyss-backdrop-blur:12px", css);
        Assert.Contains("--abyss-glass-blur:8px", css);
        Assert.DoesNotContain("fonts.googleapis.com", css);
        Assert.DoesNotContain("cdn.jsdelivr.net", css);
        Assert.DoesNotContain("Disable theme selectors - managed by Abyss", css);
        Assert.Contains("Disable theme selectors - managed by Abyss", ThemeStyles.Base(ThemeStore.Bundled, settings with { LockThemeSelectors = true }));
        var dashboard = ThemeStyles.Dashboard(settings);
        Assert.DoesNotContain("width:", dashboard);
        Assert.DoesNotContain("position:", dashboard);
        Assert.Contains("data-mbc-abyss-dashboard=safe", dashboard);
    }

    [Fact]
    public void SpotlightUsesTheActiveParentContextAndHasNoPersistentStorageOrUpdateToast()
    {
        var html = SpotlightDocument.Adapt(ThemeStore.Bundled.SpotlightHtml!);
        Assert.Contains("bridge.getContext()", html);
        Assert.Contains("config.spotlightResume", html);
        Assert.Contains("config.spotlightImageQuality", html);
        Assert.DoesNotContain("localStorage", html);
        Assert.DoesNotContain("sessionStorage", html);
        Assert.DoesNotContain("update-toast", html);
        Assert.DoesNotContain("releases/latest", html);
        Assert.Throws<ArgumentException>(() => SpotlightDocument.Adapt("<html>Unknown integration</html>"));
        var output = Environment.GetEnvironmentVariable("ABYSS_SPOTLIGHT_ADAPTED");
        if (output is not null) File.WriteAllText(output, html);
        var css = SpotlightDocument.Css(ThemeStore.Bundled, new() { SpotlightOverview = false, SpotlightLogo = false, SpotlightDots = false, ExternalFonts = false });
        Assert.Contains("#plot{display:none", css);
        Assert.Contains("#carousel-dots{display:none", css);
        Assert.DoesNotContain("fonts.googleapis.com", css);
    }

    [Fact]
    public void LegacySavedSettingsKeepAllChoicesAndGainSafeNewDefaults()
    {
        var settings = JsonSerializer.Deserialize<ThemeSettings>("{\"automaticUpdates\":true,\"jellyfinEnhanced\":true,\"mediaBarEnhanced\":false}")!.Validated();
        Assert.True(settings.AutomaticUpdates);
        Assert.True(settings.JellyfinEnhanced);
        Assert.True(settings.Spotlight);
        Assert.False(settings.UpdateSpotlightCode);
        Assert.False(settings.LockThemeSelectors);
    }

    [Fact]
    public void EveryExposedSettingHasAConfigurationControl()
    {
        var script = ThemeStore.Resource("Jellyfin.Plugin.AbyssTheme.Web.config.js");
        foreach (var property in typeof(ThemeSettings).GetProperties())
        {
            var name = property.GetCustomAttributes(typeof(System.Text.Json.Serialization.JsonPropertyNameAttribute), false)
                .Cast<System.Text.Json.Serialization.JsonPropertyNameAttribute>().Single().Name;
            Assert.Contains(name, script);
        }
    }
}
