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
    private static readonly Regex Prepare = new(
        @"(?<prefix>function(?:\s+[\w$]+)?\s*\(\s*(?<element>[\w$]+)\s*,\s*(?<options>[\w$]+)\s*\)\s*\{\s*)(?=[\w$]+\(\s*\k<element>\s*\))(?=[\s\S]{0,900}?(?:let|const|var)\s+[\w$]+\s*=\s*\k<options>\.url\s*;\s*console\.debug\(['""]playing url: )",
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
            return contents.Insert(index,
                $"<!-- {Marker} --><script defer src=\"../ThemeSongVolume/client.js?v={typeof(WebTransformation).Assembly.GetName().Version}\" data-mbc-theme-volume=\"1\"></script>");
        }
        try
        {
            var changed = false;
            // Require both module-specific signatures and a single known call site.
            if (contents.Contains("[ThemeMediaPlayer]", StringComparison.Ordinal) && ThemeCall.Matches(contents).Count == 1)
            {
                contents = ThemeCall.Replace(contents, match =>
                    match.Groups["prefix"].Value + $"(globalThis.{Runtime}?.themes({match.Groups["items"].Value})??{match.Groups["items"].Value})" + match.Groups["suffix"].Value);
                changed = true;
            }
            if (contents.Contains("htmlaudioplayer", StringComparison.Ordinal) &&
                contents.Contains("Html Audio Player", StringComparison.Ordinal) && SaveVolume.Matches(contents).Count == 1 &&
                Prepare.Matches(contents).Count == 1)
            {
                contents = SaveVolume.Replace(contents, match =>
                    $"((globalThis.{Runtime}?.shouldPersist(this)??true)&&{match.Value})");
                contents = Prepare.Replace(contents, match => match.Groups["prefix"].Value +
                    $"globalThis.{Runtime}?.audioReady();globalThis.{Runtime}?.prepare({match.Groups["element"].Value},{match.Groups["options"].Value}.item);");
                changed = true;
            }
            return changed ? Marker + "\n" + contents : contents;
        }
        catch (RegexMatchTimeoutException) { return contents; }
    }
}
