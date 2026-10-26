# Theme Song Volume

Keep library theme songs at a comfortable volume. Choose a global level for your
account, then override individual library titles that are louder or quieter.

- Global volume in **Account settings → Display**, initially 25%.
- One title override slider, including 0% to mute, with a **Use global** checkbox.
- Personal settings saved on the server for your Jellyfin account.
- A compact, collapsed **Theme volume** section below the detail-page playback buttons.
- Playback-only changes: no edits to audio files, metadata, or your regular saved volume.

The selected percentage is a multiplier of your regular playback volume. For
example, a master volume of 80% and a theme setting of 25% produce a volume factor
of 20%. An override replaces the default multiplier; it is not multiplied twice.

## Requirements and client support

- Jellyfin Server **12.3** (.NET 10).
- [File Transformation 3.x](https://github.com/IAmParadox27/jellyfin-plugin-file-transformation),
  used to extend web responses without editing the installed web files.
- Theme songs enabled in the user's Jellyfin display settings, with existing
  theme songs available for a movie or series. This plugin does not download songs.

| Client | Scope |
| --- | --- |
| Jellyfin Web served by this server | Verified with official Jellyfin 12.3.0, File Transformation 3.0.2.0, and Chrome on Windows using real playback. Other browser engines remain unverified. |
| Windows clients | Adds an MPV audio adapter for Jellyfin Media Player 1.12.0 using the server-hosted web interface. Volume commands, master-volume preservation, fades and cleanup are tested with the official JMP audio class and a simulated native bridge. Actual device audio still needs verification. UI compatibility is tested on Qt WebEngine 5.15.2 / Chromium 83. |
| Android app | Targets theme songs played through server-hosted HTML audio. Upgrades version the injected bundles so older cached hooks are not reused. Android device playback remains unverified; ExoPlayer/native/external playback paths have no volume adapter. |
| Android TV, native clients, casting, separately hosted Web | No automatic support. Their own players/UI do not load these extensions. |

A server plugin cannot guarantee volume control in every client without client
support. No session-wide volume commands are sent as a fallback, since they could
change normal playback or another device's volume. Unsupported web integration
points are left unchanged. Saved account settings can be edited even when playback
control is unavailable. A persistent notice explains that these changes apply only
on supported players; synced settings alone do not establish playback support.

## Install the preview

Published previews can be installed from the repository catalog. For a local fix
that has not yet been released, build it using the commands below or download the
ZIP artifact from the corresponding successful GitHub Actions run.

1. Add the File Transformation repository to Jellyfin:

   ```text
   https://www.iamparadox.dev/jellyfin/plugins/manifest.json
   ```

2. Install a File Transformation 3.x release compatible with Jellyfin 12.3.
3. Extract `Jellyfin.Plugin.ThemeSongVolume.dll` from the preview ZIP into a new
   `Theme Song Volume_0.1.0.7` folder inside your Jellyfin plugins directory.
4. Restart Jellyfin and reload the client. The Jellyfin plugin dashboard also
   contains a **Theme Song Volume** information page.

### Recover from the 0.1.0.0 plugin-list error

Version 0.1.0.0 did not initialize the assembly metadata required by Jellyfin.
This can prevent the entire plugin list from loading, with a
`BasePlugin.get_CanUninstall()` error for `GET /Plugins`. Version 0.1.0.1 fixes it.

If the dashboard cannot load plugins, stop Jellyfin before replacing the plugin:

1. Move the old **Theme Song Volume** installation directory out of Jellyfin's
   plugins directory to a backup location. Do not leave duplicate copies in plugins.
2. Extract the fixed ZIP into `Theme Song Volume_0.1.0.1` under the plugins directory.
3. Start Jellyfin and reload the plugin dashboard.

Keep the plugin configurations directory in place to retain your saved settings.
No changes to File Transformation or any other plugin are needed for this fix.

## Use

The administration plugin page is informational. Global controls are beside the
theme-song option in **Account settings → Display**, and local controls are on
movie or series detail pages.

1. Set **Global volume** in **Account settings → Display**. It saves automatically.
2. Open a movie or series and expand **Theme volume** below its playback buttons.
3. **Use global** is checked by default. The slider displays the inherited level.
4. Move the slider to set a local override; **Use global** unchecks automatically.
5. Check **Use global** to remove the title's overrides and move the slider back
   to the current global level. The slider remains usable while inheriting.
6. To reset everything for your account, return to **Display**, check
   **Confirm reset of all theme volumes**, then select **Reset all theme volumes**.
   This restores 25% globally and removes all your overrides.

There is no song/title selector. A local edit applies to all theme songs supplied
for the current title, including inherited series themes. Existing individual
song overrides are preserved until edited; the slider shows the active theme's
value. The reset confirmation is cleared after use and when leaving settings.

Slider changes preview immediately and save when you release the slider or finish
a keyboard adjustment. Other open clients refresh settings within approximately
15 seconds. A failed save is reported in the panel and restores the last saved
profile. Concurrent edits from different clients use the last saved profile.

Only automatic library theme playback is marked for adjustment. A regular song,
a film, a theme video, a remote player, or a theme file manually played as music
does not receive the theme multiplier. The plugin cooperates with existing audio
normalization because it does not create or replace Web Audio nodes. Other volume
changes are not continuously overridden; they remain in effect until a new theme
starts or you adjust this plugin's settings.

## Remove or disable

Uninstall **Theme Song Volume** through Jellyfin's plugin dashboard. Its uninstall
hook unregisters only its own web integration and removes its owned account settings.
Restart Jellyfin and reload open clients to clear their cached web bundles.
Open web clients also release their volume adjustment and remove the controls when
the next settings check detects removal, normally within 15 seconds.

Disabling the plugin requires a server restart and client reload. Settings are
retained when disabling and deleted when uninstalling. File Transformation is a
separate plugin and is left installed because other plugins may use it.

No browser storage, web-file edits, media changes, or external tasks are created.
If you manually delete the DLL while the server is stopped, Jellyfin cannot invoke
the uninstall hook. To remove the remaining settings in that case, delete only
the `MrBoneCrash.ThemeSongVolume` folder under Jellyfin's plugin configurations
directory. Files owned by other plugins must be preserved.

## Build and verify

From the repository root, with the .NET 10 SDK, Python 3.11+, and Node.js installed:

```powershell
dotnet test plugins/theme-song-volume/tests/ThemeSongVolume.Tests.csproj -c Release
node --test plugins/theme-song-volume/tests/playback.test.cjs
python scripts/package_theme_volume.py
```

The package is written to `dist/ThemeSongVolume-0.1.0.7.zip`. It contains the plugin
assembly and this guide; Jellyfin's assemblies are not bundled.
The package filename is derived from the version declared in the C# project.
For this preview, use `0.1.0.7` in the catalog and
`theme-song-volume-v0.1.0.7` as the GitHub release tag. Mark the GitHub release as a
pre-release; Jellyfin itself does not support a separate pre-release flag.

For browser checks:

```powershell
cd plugins/theme-song-volume
npm ci
npx playwright install chromium
npm run test:browser
```

Tests cover volume inheritance, zero-volume overrides, regular playback isolation,
settings validation and account separation, owned-data cleanup, response-transform
guards, duplicate initialization, responsive controls, and browser cleanup. The
fast browser tests use a simulated server and real HTML media elements.

For a real server test on Windows, after building Release and installing Playwright:

```powershell
$env:NODE_PATH = Join-Path (Get-Location) 'plugins/theme-song-volume/node_modules'
python scripts/test_theme_volume_live.py
```

This downloads the official portable Jellyfin 12.3.0 server and File Transformation
3.0.2.0, creates a loopback-only server with a disposable account and synthetic
movie/theme, and tests actual playback, settings persistence, navigation, normal
movie volume, reset, and uninstall. It verifies that the source theme and installed
web files remain unchanged, then stops its own server process. Test data and
credentials remain under ignored `.tools`; reports and a screenshot are in `dist`.
GitHub Actions runs this test before publishing. No production server is used.

The browser checks include Jellyfin's bubbling legacy `pagehide` events and a
settings response generated with `JsonDefaults.PascalCaseOptions`. Version 0.1.0.3
was also checked locally with the reported 15 Ultrachromic CSS modules, including
`title_banner-logo.css`, at desktop and mobile widths. This does not establish
compatibility with every Ultrachromic configuration or future stylesheet changes.
The real-server test for 0.1.0.4 also verified the reported stylesheet modules on
Windows Chrome at desktop width. Native Windows and Android playback remains unverified.

Version 0.1.0.5 was also tested on the exact Qt WebEngine 5.15.2 / Chromium 83
engine used by the inspected Windows client. The previous release reproduces
`body.replaceChildren is not a function`; the corrected build passes rendering,
song selection, saving, cached-view navigation, and cleanup. This verifies the UI
compatibility fix, not native-player volume control or an installed-client update.
To repeat this separate DOM test with Python 3.9:

```powershell
python -m pip install --only-binary=:all: PyQt5==5.15.2 PyQtWebEngine==5.15.2
python plugins/theme-song-volume/tests/qt-webengine.py
```

It creates a hidden, disposable web page using a loopback fixture. It does not
read or modify the installed client's profile, credentials, or settings. Actions
runs it before publishing, alongside the real-server playback test.

The 0.1.0.6 MPV adapter is checked against the official JMP 1.12.0
[`mpvAudioPlayer.js`](https://github.com/jellyfin/jellyfin-desktop/blob/v1.12.0/native/mpvAudioPlayer.js).
It uses the player's non-persisting volume command, applies it only to marked
automatic theme items, and restores the master after the native fade ends.
Tests exercise the official JavaScript class with a simulated C++ bridge; they do
not measure sound output on Windows. No Android/system-wide volume commands are
used as a fallback. The Android integrated-player selection does not by itself
identify the player used for background theme audio.

The read-only diagnostic snapshot includes `playbackBackend`: `html-audio`,
`jmp-mpv`, or `unavailable`. Versioned main/runtime and dynamic chunk URLs prevent
old transformed bundles from surviving a plugin upgrade in app caches. Other
plugins' script URLs and installed web files are left unchanged.
The real-server browser suite also exercises an Android-style physical-volume
host fixture. It is not an Android WebView/device test and does not verify
ExoPlayer playback.

The 0.1.0.7 controls use scoped, theme-aware slider and checkbox styling with
44-pixel touch targets, keyboard focus indicators, and palette-aware contrast.
Checks cover desktop/mobile layouts, the reported Ultrachromic modules, bundled
Abyss styling, and Qt WebEngine 5.15.2. The Display section is also tested against
Jellyfin's real React preferences page, including re-renders, confirmed reset,
navigation, account isolation, and stale-response protection during slider edits.
These checks do not establish styling compatibility with every third-party theme
or verification on physical Android/iOS devices.

For troubleshooting, this read-only console command reports runtime readiness
without disclosing authentication tokens or user identifiers:

```javascript
window.__MrBoneCrashThemeVolumeV1?.diagnostics()
```

The web hooks are based on the
[Jellyfin Web 12.3 theme player](https://github.com/jellyfin/jellyfin-web/blob/v12.3/src/components/themeMediaPlayer.js)
and [HTML audio player](https://github.com/jellyfin/jellyfin-web/blob/v12.3/src/plugins/htmlAudioPlayer/plugin.js).
Additional installed plugins and the intended Windows/Android clients require
their own verification; the isolated test does not establish support for them.
