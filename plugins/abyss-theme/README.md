# Abyss Theme (preview)

Loads the [Abyss theme](https://github.com/AumGupta/abyss-jellyfin) automatically in
compatible server-hosted Jellyfin Web. The theme is by **Om Gupta (AumGupta)**;
this independent integration is maintained by MrBoneCrash and is not an official
Abyss or Jellyfin plugin.

## Installation

This preview is not yet published in the plugin catalog. Build the plugin and
create its ZIP using the commands below, extract it to a dedicated
`plugins/AbyssTheme_0.1.0.0` folder in your Jellyfin data directory, then restart.
Do not install this development ZIP over a different plugin's directory.

1. Install **File Transformation 3.x** (verified integration API: 3.0.2.0).
2. Install Abyss Theme and restart Jellyfin.
3. Reload the server-hosted Web client, then select **Dark** in its display
   settings. The plugin does not change or lock users' theme preferences.
4. Check the server log for `Abyss Theme registered`. A missing/incompatible
   dependency produces a warning and is retried every five seconds.

No API keys, web-directory write access, external startup scripts, or Custom CSS
entries are needed. Existing Custom CSS remains intact and can override the
theme. Remove an existing Abyss import yourself to avoid loading two copies.
Other CSS themes can conflict visually; disable their CSS before using Abyss.

## Persistence and removal

The stylesheet is embedded in the plugin DLL at a pinned upstream revision; it is
not fetched from a moving branch. Each server start registers an additive
in-memory transformation for the Web index response. Replaced Web files after a
server/container update therefore receive the theme again, provided the plugin
data directory is preserved, the plugin and File Transformation remain enabled
and ABI-compatible, and the new Web shell matches the checked integration points.
Unknown Web shells pass through unchanged. Future Jellyfin versions can require
a plugin update; restoring CSS cannot guarantee visual compatibility.

Disable/uninstall the plugin, **restart Jellyfin**, and reload all open clients
(hard refresh if needed). Uninstall unregisters only this plugin's transformation.
Restart also clears File Transformation/browser response caches. No branding
settings, user settings, installed Web assets, or persistent jobs are written.
Manual deletion while stopped requires removing only this plugin's dedicated
folder; no owned settings remain elsewhere. Already open pages keep their CSS
until reloaded.

## Scope and client limits

- Built against Jellyfin **12.3.0**, .NET **10**. Uses File Transformation **3.x**.
- Intended for compatible **server-hosted Jellyfin Web** (including a server base
  URL). The injected style contains no absolute server route.
- Requires the **Dark** base theme; selecting another theme remains possible but
  is visually unsupported by Abyss.
- Includes the upstream CSS only. The upstream installer's Spotlight JavaScript,
  home-section rearrangement, and preference locking are not included.
- The separate React administration dashboard is not themed. Native Android,
  iOS, TV, casting, and bundled/remote Web clients are not supported by this
  integration solely because they connect to the same server. Jellyfin Media
  Player/Desktop is unverified for this plugin.
- Fonts still request Google Fonts and jsDelivr as specified by upstream CSS.
  Offline use retains the CSS with fallback fonts; external fonts may also be
  blocked by your CSP. A restrictive `style-src` CSP may block the inline theme.
- Upstream makes broader version/client statements; these are not verification
  claims for this plugin. See [verification](VERIFICATION.md).
- Theme Song Volume owns separate registrations and settings. This plugin
  shares only the additive `index.html` pipeline, never its IDs or files.

## Build and package

From the repository root with .NET SDK 10 and Python 3.11+:

```powershell
dotnet test plugins/abyss-theme/tests/AbyssTheme.Tests.csproj -c Release
python scripts/package_abyss_theme.py
```

The deterministic ZIP in `dist/` contains the plugin DLL, documentation, and both
license texts, without Jellyfin assemblies. No catalog download is advertised
until a real tested asset is published and its checksum registered.

## Credits and license

Abyss CSS: **Copyright (c) 2026 Om Gupta**, distributed under the **MIT License**.
Source: [AumGupta/abyss-jellyfin](https://github.com/AumGupta/abyss-jellyfin), pinned
at [2f809171ed7f3a34b5e78297608b5f2b63dd3f0f](https://github.com/AumGupta/abyss-jellyfin/tree/2f809171ed7f3a34b5e78297608b5f2b63dd3f0f).
The full upstream notice is in [third-party/Abyss-LICENSE.txt](third-party/Abyss-LICENSE.txt)
and accompanies every package. The CSS is bundled unchanged. MIT permits reuse,
modification and redistribution, provided its copyright and permission notice
are included with copies or substantial portions. Font dependencies have their
own licenses; font binaries are not redistributed in this package.

The plugin integration is MIT licensed; see [LICENSE](LICENSE). Credit also
appears in the plugin catalog metadata, server log, and injected CSS comment.
