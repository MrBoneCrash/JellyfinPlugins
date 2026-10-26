using System.Globalization;
using System.Text.RegularExpressions;

namespace Jellyfin.Plugin.AbyssTheme;

public static class ThemeStyles
{
    public static string Sheet(ThemeBundle bundle, ThemeSettings settings) => Base(bundle, settings) +
        (settings.JellyfinEnhanced ? "\n/* Mbc.Abyss:je */\n" + bundle.JellyfinEnhancedCss : "") +
        (settings.MediaBarEnhanced ? "\n/* Mbc.Abyss:mbe */\n" + bundle.MediaBarEnhancedCss : "") +
        (settings.LiteMode ? "\n" + (bundle.LiteCss ?? ThemeStore.Bundled.LiteCss) : "") + Preferences(settings);
    private static string Rgb(string hex, string separator = ", ") => string.Join(separator,
        Enumerable.Range(0, 3).Select(i => int.Parse(hex.AsSpan(1 + i * 2, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture)));
    public static string Base(ThemeBundle bundle, ThemeSettings settings)
    {
        var css = bundle.Css;
        if (!settings.LockThemeSelectors)
            css = Regex.Replace(css, @"/\* Disable theme selectors - managed by Abyss \*/[\s\S]*?(?=/\* 6\. COMPONENTS \*/)", "", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(200));
        if (!settings.ExternalFonts || settings.Font != "google")
            css = Regex.Replace(css, @"@import\s+url\(['"" ]*https://fonts\.googleapis\.com/[^)]*\)\s*;", "", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(200));
        if (!settings.ExternalFonts)
            css = Regex.Replace(css, @"@font-face\s*\{[^}]*\}", "", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(200));
        if (settings.ExternalFonts && settings.Font == "inter")
            css = "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');\n" + css;
        return css;
    }
    public static string Preferences(ThemeSettings settings)
    {
        var font = settings.Font switch
        {
            "google" when settings.ExternalFonts => "'Google Sans',system-ui,sans-serif",
            "inter" when settings.ExternalFonts => "Inter,system-ui,sans-serif",
            "serif" => "Georgia,serif",
            _ => "system-ui,-apple-system,'Segoe UI',sans-serif"
        };
        var blur = settings.LiteMode ? Math.Min(settings.BackdropBlur, 12) : settings.BackdropBlur;
        var glass = settings.LiteMode ? Math.Min(settings.GlassBlur, 8) : settings.GlassBlur;
        var css = $"\n:root{{--abyss-accent:{Rgb(settings.Accent)};--abyss-accent-channel:{Rgb(settings.Accent, " ")};--abyss-indicator:{Rgb(settings.IndicatorColor)};--abyss-glass-tint:{Rgb(settings.GlassTint)};--abyss-radius:{settings.Radius}px;--abyss-backdrop-blur:{blur}px;--abyss-glass-blur:{glass}px;}}\n" +
            $"html{{font-size:{settings.FontScale}%;}}body,input,button,select,textarea{{font-family:{font}!important;}}\n";
        if (!settings.ExternalFonts) css += ".material-icons-round,.material-symbols-rounded,[class*=material-icons]{font-family:'Material Icons'!important;}\n";
        if (!settings.Shadows) css += ".mainDrawer,.dialog,.toast,.appfooter,.cardBox,.MuiPaper-root{box-shadow:none!important;}\n";
        if (!settings.EntranceAnimations) css += ".verticalSection{animation:none!important;}\n";
        if (!settings.HeartAnimation) css += ".ratingbutton-withrating .material-icons.favorite{animation:none!important;}\n";
        if (!settings.HoverEffects) css += ".cardOverlayContainer,.cardOverlayButtonIcon,.paper-icon-button-light,.emby-tab-button,.button-flat,.navMenuOption,.listItem{transition:none!important;}\n";
        const string reduce = "*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important;}";
        css += settings.Motion == "reduced" ? reduce : "@media(prefers-reduced-motion:reduce){" + reduce + "}";
        return css;
    }
    public static string Dashboard(ThemeSettings settings) =>
        $"html[data-mbc-abyss-dashboard=safe]{{--jf-palette-primary-main:{settings.Accent}!important;--jf-palette-primary-mainChannel:{Rgb(settings.Accent, " ")}!important;--jf-palette-background-default:#101010!important;--jf-palette-background-paper:#202020!important;}}" +
        "html[data-mbc-abyss-dashboard=safe] .MuiPaper-root{background-color:#202020;color:#f5f5f7;}html[data-mbc-abyss-dashboard=safe] .MuiListItemButton-root.Mui-selected{background-color:rgba(255,255,255,.08);}";
}
