using System.Text.RegularExpressions;

namespace Jellyfin.Plugin.AbyssTheme;

public static class SpotlightDocument
{
    private static string ReplaceOne(string value, string pattern, string replacement)
    {
        var regex = new Regex(pattern, RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(200));
        if (regex.Matches(value).Count != 1) throw new ArgumentException("Unknown Spotlight integration point. Keep the previous version and update the plugin.");
        return regex.Replace(value, _ => replacement);
    }
    public static string Adapt(string source)
    {
        if (string.IsNullOrEmpty(source) || source.Length > 512 * 1024) throw new ArgumentException("Invalid Spotlight document.");
        var html = ReplaceOne(source, @"<!-- Update notification -->[\s\S]*?(?=<script>)", "");
        html = ReplaceOne(html, @"const \$ = id => document\.getElementById\(id\);", """
            const bridge = window.parent.__MrBoneCrashAbyssThemeV1;
            const context = bridge && bridge.getContext();
            if (!context) return;
            const config = context.settings;
            const $ = id => document.getElementById(id);
            let interactionPaused = false;
            let periodicRefresh = null;
            """);
        html = ReplaceOne(html, @"const AUTO_INTERVAL = \d+;", "const AUTO_INTERVAL = config.spotlightInterval * 1000;");
        html = ReplaceOne(html, @"const REFRESH_INTERVAL = \d+;", "const REFRESH_INTERVAL = config.spotlightRefresh * 1000;");
        html = ReplaceOne(html, @"function normalizeAddress\(value\) \{[\s\S]*?(?=function authHeaders\(token\))", """
            function getBaseUrl() { return context.baseUrl; }
            function getAuth() { return context.auth; }
            """);
        html = ReplaceOne(html, @"function semverGt\(a, b\) \{[\s\S]*?(?=const base = getBaseUrl\(\);)", "");
        html = ReplaceOne(html, @"checkForUpdate\(base, token, userId\);", "");
        html = ReplaceOne(html, @"async function fetchItems\(signal\) \{[\s\S]*?(?=function stopAuto\(\))", """
            async function fetchItems(signal) {
                const limit = config.spotlightLimit;
                const urls = [];
                if (config.spotlightResume) urls.push(['resume', `${base}/Users/${userId}/Items/Resume?Limit=${limit}&Recursive=true&IncludeItemTypes=Movie,Episode&Fields=${FIELDS}`]);
                if (config.spotlightNextUp) urls.push(['nextup', `${base}/Shows/NextUp?Limit=${limit}&UserId=${userId}&Fields=${FIELDS}`]);
                if (config.spotlightMovies) urls.push(['recent-movie', `${base}/Users/${userId}/Items?Limit=${limit}&Recursive=true&SortBy=DateCreated&SortOrder=Descending&IncludeItemTypes=Movie&Fields=${FIELDS}`]);
                if (config.spotlightSeries) urls.push(['recent-show', `${base}/Users/${userId}/Items?Limit=${limit}&Recursive=true&SortBy=DateCreated&SortOrder=Descending&IncludeItemTypes=Series&Fields=${FIELDS}`]);
                const results = await Promise.allSettled(urls.map(entry => fetchJson(entry[1], signal)));
                if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
                const picked = new Map();
                results.forEach((result, index) => {
                    if (result.status !== 'fulfilled') return;
                    (result.value.Items || []).forEach(item => {
                        if (picked.size < limit && /^[a-f0-9-]{32,36}$/i.test(item.Id) && !picked.has(item.Id))
                            picked.set(item.Id, { ...item, _source: urls[index][0] });
                    });
                });
                return [...picked.values()];
            }
            """);
        html = ReplaceOne(html, @"const preferBackdrop = localStorage\.getItem\('abyss-prefer-backdrop'\) === 'true';", "const preferBackdrop = config.spotlightPreferBackdrop;");
        html = ReplaceOne(html, @"const logoPromise = fetchImage\(urls.logo, signal\);", "const logoPromise = config.spotlightLogo ? fetchImage(urls.logo, signal) : Promise.resolve(null);");
        html = ReplaceOne(html, @"if \(paused \|\| reducedMotion\.matches\) return;", "if (paused || reducedMotion.matches || !config.spotlightZoom || config.liteMode || config.motion === 'reduced') return;");
        html = ReplaceOne(html, @"if \(paused \|\| disposed \|\| items\.length <= 1 \|\| reducedMotion\.matches\) return;", "if (paused || disposed || interactionPaused || document.activeElement?.closest('button,a,input') || !config.spotlightAutoRotate || items.length <= 1 || reducedMotion.matches || config.motion === 'reduced') return;");
        html = ReplaceOne(html, @"if \(artwork\.logo\) \{", "if (config.spotlightLogo && artwork.logo) {");
        html = ReplaceOne(html, @"const syncUrl = artwork\.backdrop[\s\S]*?: null;", "const syncUrl = artwork.backdrop || null;");
        html = ReplaceOne(html, @"quality=88", "quality=${config.spotlightImageQuality}");
        html = ReplaceOne(html, @"const playRoute = `/video\?id=\$\{item.Id\}`;", "const playRoute = `/details?id=${encodeURIComponent(item.Id)}`;");
        html = ReplaceOne(html, @"if \(action === 'pause'\) pause\(\);", "if (action === 'dispose') dispose(); if (action === 'pause') pause();");
        html = ReplaceOne(html, @"\$\('empty'\)\.style\.display = items\.length \? 'none' : 'flex';", """
            $('empty').style.display = items.length ? 'none' : 'flex';
            if (!items.length) { $('content').classList.remove('visible'); $('backdrop').classList.remove('loaded'); clearImageCache(); }
            window.parent.postMessage({ type: 'mbc-abyss-spotlight', action: 'empty', empty: items.length === 0 }, location.origin);
            """);
        html = ReplaceOne(html, @"document.addEventListener\('visibilitychange', \(\) => \{ document.hidden \? pause\(\) : resume\(\); \}\);", """
            document.addEventListener('visibilitychange', () => { document.hidden ? pause() : resume(); });
            if (config.spotlightPauseOnHover) {
                document.addEventListener('mouseenter', () => { interactionPaused = true; stopAuto(); });
                document.addEventListener('mouseleave', () => { interactionPaused = false; startAuto(); });
            }
            document.addEventListener('focusin', () => { interactionPaused = true; stopAuto(); });
            document.addEventListener('focusout', event => { if (!event.relatedTarget) { interactionPaused = false; startAuto(); } });
            """);
        html = ReplaceOne(html, @"function pause\(\) \{", "function pause() { clearTimeout(periodicRefresh); periodicRefresh = null;");
        html = ReplaceOne(html, @"function dispose\(\) \{", "function dispose() { clearTimeout(periodicRefresh); periodicRefresh = null;");
        html = ReplaceOne(html, @"async function resume\(\) \{[\s\S]*?(?=function dispose\(\))", """
            function scheduleRefresh() {
                clearTimeout(periodicRefresh);
                if (disposed || paused) return;
                periodicRefresh = setTimeout(async () => { await refreshItems(); scheduleRefresh(); }, REFRESH_INTERVAL);
            }
            async function resume() {
                if (disposed) return;
                const wasPaused = paused;
                paused = false;
                if (!items.length || Date.now() - lastRefresh > REFRESH_INTERVAL) await refreshItems();
                else if (wasPaused) await renderItem(currentIndex);
                startAuto(); scheduleRefresh();
            }
            """);
        html = Regex.Replace(html, @"<link\b[^>]*href=""https://fonts\.googleapis\.com[^>]*>", "", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));
        if (html.Contains("localStorage", StringComparison.Ordinal) || html.Contains("sessionStorage", StringComparison.Ordinal))
            throw new ArgumentException("Spotlight storage behavior changed; a reviewed plugin update is required.");
        return html;
    }

    public static string Css(ThemeBundle bundle, ThemeSettings settings)
    {
        var css = bundle.SpotlightCss ?? ThemeStore.Bundled.SpotlightCss!;
        if (settings.ExternalFonts && settings.Font is "google" or "inter")
            css = settings.Font == "inter"
                ? "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');\n" + css
                : "@import url('https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&display=swap');\n" + css;
        css += ThemeStyles.Preferences(settings);
        css += $".btn-play{{background:{settings.Accent};color:#101010;}}";
        if (!settings.SpotlightOverview) css += "#plot{display:none!important;}";
        if (!settings.SpotlightMetadata) css += "#meta{display:none!important;}";
        if (!settings.SpotlightProgress) css += "#progress-wrap{display:none!important;}";
        if (!settings.SpotlightDots) css += "#carousel-dots{display:none!important;}";
        if (!settings.SpotlightPlayButton) css += "#buttons .btn-play{display:none!important;}";
        if (!settings.SpotlightInfoButton) css += "#buttons .btn-info{display:none!important;}";
        if (settings.LiteMode) css += "*{backdrop-filter:none!important;box-shadow:none!important;}";
        return css;
    }
}
