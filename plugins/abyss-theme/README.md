# Abyss Theme (preview)

Loads the [Abyss theme](https://github.com/AumGupta/abyss-jellyfin) automatically in
compatible server-hosted Jellyfin Web. The theme is by **Om Gupta (AumGupta)**;
this independent integration is maintained by MrBoneCrash and is not an official
Abyss or Jellyfin plugin.

## Installation

Add the [MrBoneCrash plugin repository](https://github.com/MrBoneCrash/JellyfinPlugins#installation) to Jellyfin,
then install **Abyss Theme 0.2.0.0** from the plugin catalog. This is a preview;
check the requirements and verification limits below before installing.
For manual installation, extract the release ZIP to a dedicated
`plugins/AbyssTheme_0.2.0.0` folder in your Jellyfin data directory. Do not extract
it over a different plugin's directory.

1. Install **File Transformation 3.x** (verified integration API: 3.0.2.0).
2. Install Abyss Theme and restart Jellyfin.
3. Reload the server-hosted Web client, then select **Dark** in its display
   settings. The plugin does not change or lock users' theme preferences.
4. Check the server log for `Abyss Theme registered`. A missing/incompatible
   dependency produces a warning and is retried every five seconds.

No API keys, web-directory write access, external startup scripts, or Custom CSS
entries are needed. Open the plugin's configuration page to manage updates and
optional adaptations. Existing Custom CSS remains intact and can override the
theme. Remove an existing Abyss import yourself to avoid loading two copies.
Other CSS themes can conflict visually; disable their CSS before using Abyss.

## Persistence and removal

The plugin includes a bundled fallback at a pinned upstream revision. Optional
theme updates are saved separately from the DLL. Each server start registers an additive
in-memory transformation for the Web index response. Replaced Web files after a
server/container update therefore receive the theme again, provided the plugin
data directory is preserved, the plugin and File Transformation remain enabled
and ABI-compatible, and the new Web shell matches the checked integration points.
Unknown Web shells pass through unchanged. Future Jellyfin versions can require
a plugin update; restoring CSS cannot guarantee visual compatibility.

Disable/uninstall the plugin, **restart Jellyfin**, and reload all open clients
(hard refresh if needed). Uninstall unregisters only this plugin's transformation.
Restart also clears File Transformation/browser response caches. No branding
settings, user settings, installed Web assets, or external jobs are written.
Only this plugin's settings and current/previous CSS bundles are saved, together
in an atomically replaced `plugins/configurations/MrBoneCrash.AbyssTheme/state.json`.
Downloaded bundles retain their upstream license. Uninstall removes this file;
unknown files in the directory are preserved.
Manual deletion while stopped requires removing only this plugin's dedicated
folder and the owned `state.json` file above (plus `state.json.tmp` if a write was
interrupted). Already open pages keep their CSS
until reloaded.

## Theme updates and recovery

Automatic updates are **off by default**. Enable **Automatically update Abyss CSS**
to check upstream `main` on startup and every 24 hours. Enabling the setting takes
effect within 30 seconds. This follows the latest commit on `main`, not only tagged
releases. You can also choose **Check and apply latest Abyss** while automatic
updates are off. No plugin update is needed for ordinary upstream CSS changes.
Changes to Jellyfin integration, supported file paths or licensing can still
require a new plugin release.

The updater resolves one commit SHA via `api.github.com`, then retrieves the main
CSS, both adaptation CSS files and the license from `raw.githubusercontent.com`
at that same immutable SHA. It limits response sizes and duration, rejects changed
license terms, HTML/script injection and structurally incomplete CSS, and activates
the bundle only after every file passes. The active revision and last successful
check appear on the settings page. Internet access is needed only for checks and
the upstream font requests; saved CSS remains available offline after restart.

Network errors, rate limiting, missing files, invalid CSS or persistence errors
retain the active theme. A corrupt saved file falls back to bundled defaults and
shows a warning. These checks do **not** prove that new CSS looks correct in every
view. **Restore previous theme** restores the preceding accepted bundle (or the
bundled fallback) and disables automatic updates. **Reset to bundled defaults**
also turns off both adaptations. Rollback/reset/settings changes prevent an
already pending download from replacing that choice.

Reload open Web clients after changes. If a response is cached, restart Jellyfin
and hard refresh. Updating CSS does not install JavaScript, Spotlight or other plugins.

## Optional plugin adaptations

The settings page has independent, initially disabled switches for upstream
`styles/abyss-je.css` and `styles/abyss-mbe.css`. They load after the main theme
and update as part of the same CSS bundle. Enable only those you need.
The bundled versions target **Jellyfin Enhanced 11.3.0.0** and **Media Bar Enhanced
1.9.0.0** according to the [upstream plugin-support guide](https://github.com/AumGupta/abyss-jellyfin/blob/main/SETUP.md#plugin-support).
Upstream updates may change those targets. They are CSS adaptations, not verified
support for arbitrary versions: actual installations of those two plugins have
not been tested here. Other plugin settings and assets are untouched.

## Scope and client limits

- Built against Jellyfin **12.3.0**, .NET **10**. Uses File Transformation **3.x**.
- Intended for compatible **server-hosted Jellyfin Web** (including a server base
  URL). The injected style contains no absolute server route.
- Requires the **Dark** base theme; selecting another theme remains possible but
  is visually unsupported by Abyss.
- Includes the upstream CSS only. The upstream installer's Spotlight JavaScript,
  home-section rearrangement, and preference locking are not included.
- The separate React administration dashboard is not a supported styling target. Native Android,
  iOS, TV, casting, and bundled/remote Web clients are not supported by this
  integration solely because they connect to the same server. Jellyfin Media
  Player/Desktop is unverified for this plugin.
- Fonts still request Google Fonts and jsDelivr as specified by upstream CSS.
  Offline use retains the CSS with fallback fonts; external fonts may also be
  blocked by your CSP. A restrictive `style-src` CSP may block the inline theme.
- A small same-origin script enables this plugin's styles on normal Web views
  and disables them on dashboard/configuration routes, where Abyss can overlap
  Jellyfin's navigation. Styles start inactive; if that script is blocked or
  unavailable, the theme stays inactive. No network APIs or global prototypes
  are replaced. Its route listeners and observer are cleaned up with the page.
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
and accompanies every package. Downloaded updates retain the upstream license
inside the saved bundle. MIT permits reuse,
modification and redistribution, provided its copyright and permission notice
are included with copies or substantial portions. Font dependencies have their
own licenses; font binaries are not redistributed in this package.

The plugin integration is MIT licensed; see [LICENSE](LICENSE). Credit also
appears in the plugin catalog metadata, server log, and injected CSS comment.
