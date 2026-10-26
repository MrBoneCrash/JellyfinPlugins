using System.Text.RegularExpressions;
using Newtonsoft.Json.Linq;

namespace Jellyfin.Plugin.ThemeSongVolume;

public static class WebTransformation
{
    public const string Runtime = "__MrBoneCrashThemeVolumeV1";
    private const string Marker = "/* MrBoneCrash.ThemeSongVolume.v1 */";
    private static readonly TimeSpan Timeout = TimeSpan.FromMilliseconds(200);
    private static readonly Regex ThemeCall = new(
        @"(?<prefix>\.play\(\{\s*items\s*:\s*)(?<items>[\w$]+)(?<suffix>\s*,\s*aspectRatio\s*:\s*['""]cover['""]\s*,\s*fullscreen\s*:\s*(?:!1|false)\s*,\s*enableRemotePlayers\s*:\s*(?:!1|false)\s*\})",
        RegexOptions.CultureInvariant, Timeout);
    private static readonly Regex SaveVolume = new(
        @"(?:\(0,\s*[\w$]+\.saveVolume\)|[\w$]+(?:\.[\w$]+)*\.saveVolume)\(this\.volume\)",
        RegexOptions.CultureInvariant, Timeout);
    private static readonly Regex BundledSaveVolume = new(
        @"(?<prefix>[\w$]+\._isFadingOut\s*\|\|\s*\()(?<call>(?:\(0,\s*[\w$]+\.[\w$]+\)|[\w$]+(?:\.[\w$]+)+)\(this\.volume\))",
        RegexOptions.CultureInvariant, Timeout);
    private static readonly Regex Prepare = new(
        @"(?<prefix>function(?:\s+[\w$]+)?\s*\(\s*(?<element>[\w$]+)\s*,\s*(?<options>[\w$]+)\s*\)\s*\{\s*)(?=[\w$]+\(\s*\k<element>\s*\))(?=[\s\S]{0,900}?(?:let|const|var)\s+[\w$]+\s*=\s*\k<options>\.url\s*;\s*console\.debug\(['""]playing url: )",
        RegexOptions.CultureInvariant, Timeout);
    private static readonly Regex SavedVolume = new(
        @"[\w$]+\.volume\s*=\s*(?<getter>(?:\(0,\s*[\w$]+\.[\w$]+\)|[\w$]+(?:\.[\w$]+)+)\(\))",
        RegexOptions.CultureInvariant, Timeout);
    private static readonly Regex PlayerPlay = new(
        @"(?<player>[\w$]+)\.play\((?<options>[\w$]+)\)(?=\.then\()",
        RegexOptions.CultureInvariant, Timeout);
    private static readonly Regex Bootstrap = new(
        @"(?<prefix><script\b[^>]*\bsrc=['""])(?<url>(?:\./)?(?:runtime\.bundle|main\.jellyfin\.bundle)\.js(?:\?[^'""]*)?)(?<quote>['""])",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, Timeout);
    private static readonly Regex ChunkFactory = new(
        @"(?<prefix>(?<loader>[\w$]+)\.u=function\([\w$]+\)\{return\s*)(?<expression>[\s\S]+?)(?<suffix>\},\k<loader>\.miniCssF=)",
        RegexOptions.CultureInvariant, Timeout);

    public static string Transform(JObject payload)
    {
        var contents = payload.Value<string>("contents") ?? "";
        return Plugin.Instance is { Active: true } ? Apply(contents) : contents;
    }

    public static string Apply(string contents)
    {
        if (contents.Contains(Marker, StringComparison.Ordinal)) return contents;
        var start = contents.TrimStart();
        if ((start.StartsWith("<!doctype html", StringComparison.OrdinalIgnoreCase) ||
            start.StartsWith("<html", StringComparison.OrdinalIgnoreCase)) &&
            contents.Contains("</head>", StringComparison.OrdinalIgnoreCase))
        {
            var index = contents.IndexOf('>', contents.IndexOf("<head", StringComparison.OrdinalIgnoreCase)) + 1;
            if (index == 0) return contents;
            contents = Bootstrap.Replace(contents, match => {
                var url = match.Groups["url"].Value;
                return match.Groups["prefix"].Value + url + (url.Contains('?') ? "&amp;" : "?") +
                    $"mbcThemeVolume={typeof(WebTransformation).Assembly.GetName().Version}" + match.Groups["quote"].Value;
            });
            return contents.Insert(index,
                $"<!-- {Marker} --><script defer src=\"../ThemeSongVolume/client.js?v={typeof(WebTransformation).Assembly.GetName().Version}\" data-mbc-theme-volume=\"1\"></script>");
        }
        try
        {
            var changed = false;
            // Keep transformed bundles out of older, untransformed client caches.
            if (contents.Contains(".chunk.js", StringComparison.Ordinal) && ChunkFactory.Matches(contents).Count == 1)
            {
                contents = ChunkFactory.Replace(contents, match => match.Groups["prefix"].Value +
                    "(" + match.Groups["expression"].Value.TrimEnd(';') + ")+\"?mbcThemeVolume=" +
                    typeof(WebTransformation).Assembly.GetName().Version + "\"" + match.Groups["suffix"].Value);
                changed = true;
            }
            // The core dispatches both HTML audio and JMP MPV playback here.
            // Native support is capability-checked per marked theme at runtime.
            if (contents.Contains("getPlaybackMediaSources", StringComparison.Ordinal) &&
                contents.Contains("No player found for the requested media", StringComparison.Ordinal) &&
                PlayerPlay.Matches(contents).Count == 3)
            {
                contents = PlayerPlay.Replace(contents, match =>
                    $"(globalThis.{Runtime}?.play({match.Groups["player"].Value},{match.Groups["options"].Value})??{match.Value})");
                changed = true;
            }
            // Require both module-specific signatures and a single known call site.
            if (contents.Contains("[ThemeMediaPlayer]", StringComparison.Ordinal) && ThemeCall.Matches(contents).Count == 1)
            {
                contents = ThemeCall.Replace(contents, match =>
                    match.Groups["prefix"].Value + $"(globalThis.{Runtime}?.themes({match.Groups["items"].Value})??{match.Groups["items"].Value})" + match.Groups["suffix"].Value);
                changed = true;
            }
            if (contents.Contains("htmlaudioplayer", StringComparison.Ordinal) &&
                contents.Contains("Html Audio Player", StringComparison.Ordinal) && Prepare.Matches(contents).Count == 1)
            {
                var namedMatches = SaveVolume.Matches(contents).Count;
                var patchedAudio = false;
                if (namedMatches == 1)
                {
                    contents = SaveVolume.Replace(contents, match =>
                        $"((globalThis.{Runtime}?.shouldPersist(this)??true)&&{match.Value})");
                    patchedAudio = true;
                }
                else if (namedMatches == 0 && BundledSaveVolume.Matches(contents).Count == 1)
                {
                    // Webpack renames exports such as saveVolume to short aliases.
                    // The fade guard identifies the original volume-change handler.
                    contents = BundledSaveVolume.Replace(contents, match => match.Groups["prefix"].Value +
                        $"((globalThis.{Runtime}?.shouldPersist(this)??true)&&{match.Groups["call"].Value})");
                    patchedAudio = true;
                }
                if (patchedAudio)
                {
                    // The core reuses audio elements and restores their previous
                    // (attenuated) volume after fades. Read its saved master volume
                    // through the same helper used to initialize new elements.
                    var savedVolume = SavedVolume.Matches(contents);
                    var master = savedVolume.Count == 1 ? "," + savedVolume[0].Groups["getter"].Value : "";
                    contents = Prepare.Replace(contents, match => match.Groups["prefix"].Value +
                        $"globalThis.{Runtime}?.audioReady();globalThis.{Runtime}?.prepare({match.Groups["element"].Value},{match.Groups["options"].Value}.item{master});");
                    changed = true;
                }
            }
            return changed ? Marker + "\n" + contents : contents;
        }
        catch (RegexMatchTimeoutException) { return contents; }
    }
}
