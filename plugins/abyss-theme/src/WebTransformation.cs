using System.Text.RegularExpressions;
using Newtonsoft.Json.Linq;

namespace Jellyfin.Plugin.AbyssTheme;

public static class WebTransformation
{
    public const string Marker = "id=\"MrBoneCrash-AbyssTheme-v1\"";
    private static readonly Lazy<string> Css = new(() =>
    {
        using var stream = typeof(Plugin).Assembly.GetManifestResourceStream("Jellyfin.Plugin.AbyssTheme.Web.abyss.css")
            ?? throw new InvalidOperationException("Missing embedded Abyss stylesheet.");
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    });
    private static readonly Regex Head = new(@"<head(?:\s[^>]*)?>", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));

    public static string Transform(JObject payload)
    {
        var contents = payload.Value<string>("contents") ?? "";
        lock (ThemeIntegration.Gate)
            return Plugin.Instance is { Active: true } ? Apply(contents) : contents;
    }

    public static string Apply(string contents)
    {
        if (contents.Contains(Marker, StringComparison.Ordinal)) return contents;
        // Limit this integration to the known server-hosted Web shell. An
        // unfamiliar shell is passed through, including the separate dashboard.
        if (!contents.Contains("main.jellyfin.bundle.js", StringComparison.Ordinal) ||
            !contents.Contains("runtime.bundle.js", StringComparison.Ordinal) ||
            !contents.Contains("</head>", StringComparison.OrdinalIgnoreCase)) return contents;
        var heads = Head.Matches(contents);
        if (heads.Count != 1) return contents;
        var index = heads[0].Index + heads[0].Length;
        return contents.Insert(index, "\n<style " + Marker + ">\n/* Abyss by Om Gupta (AumGupta), MIT. https://github.com/AumGupta/abyss-jellyfin */\n" + Css.Value + "\n</style>\n");
    }
}
