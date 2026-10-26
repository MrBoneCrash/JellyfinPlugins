# Abyss Theme (preview)

Abyss by **Om Gupta (AumGupta)** for compatible server-hosted Jellyfin Web, including
the main theme, Lite mode and Spotlight home banner. This independent integration
is maintained by MrBoneCrash. [Original project](https://github.com/AumGupta/abyss-jellyfin).

## Installation

Add the [MrBoneCrash repository](https://github.com/MrBoneCrash/JellyfinPlugins#installation),
install Abyss Theme from the catalog, and restart Jellyfin. Version 0.3.0.0 targets
**Jellyfin 12.3.0 / .NET 10** and requires **File Transformation 3.x** (verified with 3.0.2.0).
For manual installation, extract the release ZIP into a dedicated
`plugins/AbyssTheme_0.3.0.0` folder in the Jellyfin data directory.

Open the plugin's configuration page. It includes an illustrative local preview,
section navigation, section defaults, saved/unsaved feedback and recovery controls.
Remove an existing manual Abyss import or Spotlight loader yourself to avoid
duplicate installations. Do not install this ZIP into another plugin's directory.

## Configuration

| Area | Available controls |
| --- | --- |
| Master | Enable/pause Abyss without losing settings. |
| Appearance | Accent, indicator and glass colors; corner radius; typography and text scale; external font loading. |
| Performance | Lite mode, backdrop/glass blur, motion, shadows, hover transitions, entrance and favorite animations. |
| Jellyfin layout | Temporary Dark presentation, content backdrops, theme-selector lock, dashboard styling and the order of the four standard home sections. |
| Spotlight | Enable, desktop/mobile height, rotation and interval, refresh interval, item limit, hover pause, empty state and duplicate-banner avoidance. |
| Spotlight content | Continue Watching, Next Up, recent movies and recent series; artwork preference/quality, logos, overview, metadata, progress, carousel controls, Play/Resume, details button, zoom and page backdrop. |
| Plugin adaptations | Separate Jellyfin Enhanced and Media Bar Enhanced overrides. |
| Updates | Automatic checks, 1–168 hour interval, manual check and independently opt-in Spotlight code updates. |
| Recovery | Previous bundle, bundled defaults and per-section defaults. |

All controls have server-side validation. Defaults enable the main theme and
Spotlight, use the safe dashboard palette, and leave automatic updates, Spotlight
code updates, home reordering and theme-selector locking off. Lite caps blur at
12px/8px. System reduced-motion preferences remain respected.

Saving applies changes to the current compatible Web page immediately and to other
open pages within a minute or on reload. The preview does not use personal media
and does not change the server until Save. Section resets are also previews until
saved; the Recovery actions apply immediately.

## Reversible Jellyfin layout

Layout options act while Abyss is active; they do not overwrite saved Jellyfin
display preferences or write browser storage. Temporary Dark presentation restores
the previous root theme attribute on stop or when the theme becomes inactive.
Content backdrops use a separately owned layer with authenticated, accessible
artwork; existing Jellyfin images and settings are not replaced.

Home reordering reads the current account's display preferences and reorders only
recognized standard section containers. Extra sections keep their relative order.
If the integration points do not match, the layout is left unchanged. Previous
inline orders and container layout properties are restored, including priorities,
when leaving home or disabling the integration.

Dashboard choices are Off, Safe (palette only) and experimental Full. Full falls
back to Safe if the upstream drawer becomes too wide. The configuration page always
uses the safe presentation so settings remain reachable.

## Spotlight

Includes upstream Spotlight HTML/JavaScript and CSS, adapted to the plugin's
authentication, lifecycle and configuration model. It does not depend on Media Bar
Enhanced. Sources use the **currently signed-in account on the current server**;
there is no fallback to credentials for another server or user.

The banner loads only on the recognized Web home view. It yields to an existing
Spotlight/Media Bar banner by default. It removes its frame, backdrop and resources
when leaving the view or signing out. Artwork requests use authorization headers,
not tokens in URLs; no credentials or notification preferences are stored by this
plugin in browser storage. The upstream installer update toast is replaced by the
plugin's admin update controls.

Play/Resume delegates to an existing matching Jellyfin play/resume action or card.
If one is unavailable, it opens item details. Direct/native playback APIs are not
patched. The four content sources are separately configurable and at least one
must remain enabled while Spotlight is enabled. Hover or keyboard interaction
pauses rotation; reduced motion disables automatic rotation and artwork zoom.

Missing or inaccessible artwork falls back to titles/available images. With no
accessible media, the banner hides by default or shows an optional empty state.
A restrictive CSP that blocks the same-origin helper, iframe or inline styles/scripts
can prevent the integration; unknown clients stay usable without the banner.

## Theme updates

Automatic updates are **off by default**. When enabled, checks run on startup and
at the configured interval. Enabling the setting takes effect within 30 seconds.
The source is upstream **main**, including commits without a tagged release.

Each visual update resolves one immutable SHA and fetches main CSS, Lite CSS,
both plugin adaptations, Spotlight CSS and the MIT license at that revision.
Spotlight HTML/JavaScript stays at the bundled/previous code revision unless
**Include Spotlight code updates** is enabled. That option downloads trusted
upstream JavaScript at the new SHA and checks the expected integration points
before activation. It is not a security audit of future upstream code.
The configuration displays CSS and Spotlight code revisions separately.

Downloads are size/time limited. Changed license text, missing files, invalid CSS,
unknown Spotlight integration points or persistence errors retain the active bundle.
The complete accepted bundle is saved atomically with its previous version.
Validation cannot guarantee visual compatibility. **Restore previous theme**
disables automatic updates; **Reset to bundled defaults** restores all default
settings, including enabled Spotlight. Pending downloads cannot override a
subsequent settings change, rollback, reset or uninstall.

Ordinary accepted upstream updates do not require a plugin update. Changes to the
Jellyfin integration or unrecognized upstream code still require a new plugin release.

## Plugin adaptations and clients

The bundled upstream overrides target **Jellyfin Enhanced 11.3.0.0** and **Media Bar
Enhanced 1.9.0.0**. They add CSS only and do not install/configure another plugin.
Actual installations of these plugins have not been verified. Newer plugin versions
may require updated overrides. Other CSS themes can conflict visually.

Supported verification scope is server-hosted Jellyfin Web in the tested Chrome
environment. Native Android/iOS/TV clients, casting, bundled/remote Web clients
and Jellyfin Media Player/Desktop are not verified merely because they connect
to the same server. A server base URL is handled by relative routes; reverse proxy
deployment still needs a real environment test. See [VERIFICATION.md](VERIFICATION.md).

External fonts use Google Fonts and jsDelivr when enabled; disabling them uses
local fallback fonts. No font binaries are redistributed. Unknown Web shells pass
through unchanged. Restoring assets after restart does not guarantee compatibility
with future Jellyfin releases.

## Persistence and removal

No installed Web files, source media, branding CSS, other plugin registrations,
external jobs or saved Jellyfin user preferences are modified. File Transformation
registers only an additive index response callback on each server start. Preserve
the Jellyfin plugin data directory across container/server upgrades.

Owned settings and the current/previous bundle (with license) are stored in
`plugins/configurations/MrBoneCrash.AbyssTheme/state.json`.
Uninstall removes only owned state and registrations, preserving unknown files.
Disable/uninstall, restart Jellyfin and reload clients. The runtime also cleans up
owned observers, events, timers, frame and temporary presentation changes.
After manual deletion while stopped, remove only this plugin's folder and owned
`state.json` / `state.json.tmp` files. Previously loaded pages need a reload.

## Build and verification

From the repository root with .NET SDK 10, Node.js and Python 3.11+:

```powershell
dotnet test plugins/abyss-theme/tests/AbyssTheme.Tests.csproj -c Release
node --test plugins/abyss-theme/tests/runtime.test.cjs
python scripts/package_abyss_theme.py
```

The ZIP contains one plugin DLL, documentation and both license notices, without
Jellyfin assemblies. The isolated live test uses a separate portable Jellyfin
instance and synthetic media; setup and limits are in VERIFICATION.md.

## Credits and license

Abyss theme, Lite, Spotlight and adaptation assets:
**Copyright (c) 2026 Om Gupta**, [AumGupta/abyss-jellyfin](https://github.com/AumGupta/abyss-jellyfin),
MIT licensed. Bundled source revision:
[2f809171ed7f3a34b5e78297608b5f2b63dd3f0f](https://github.com/AumGupta/abyss-jellyfin/tree/2f809171ed7f3a34b5e78297608b5f2b63dd3f0f).
The original [license](third-party/Abyss-LICENSE.txt) accompanies every package.
Spotlight is adapted for active-server credentials, configurable content, refresh,
cleanup and admin-managed updates. The upstream loader is replaced by an owned,
reversible host integration. Downloaded bundles retain their license.
The plugin integration is MIT licensed; see [LICENSE](LICENSE).
