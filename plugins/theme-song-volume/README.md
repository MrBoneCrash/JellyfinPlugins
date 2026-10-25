# Theme Song Volume

Keep library theme songs at a comfortable volume. Choose a default level, then
override individual songs that are louder or quieter than the rest.

- One default volume for all theme songs, initially 25%.
- Optional overrides per song, including 0% to mute a particular theme.
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
| Jellyfin Web served by this server | Implementation targets the 12.3 theme and HTML audio players. Browser fixture tested; a live-server test is still required. |
| Windows clients | Can work when they load this server's web interface and use its HTML audio player. Native playback paths and bundled web interfaces are not supported. Not device-tested. |
| Android app | Can work for theme songs played by the server-hosted web interface using its HTML audio player. Native/external players are not supported. Not device-tested. |
| Android TV, native clients, casting, separately hosted Web | No automatic support. Their own players/UI do not load these extensions. |

A server plugin cannot guarantee volume control in every client without client
support. No session-wide volume commands are sent as a fallback, since they could
change normal playback or another device's volume. Unsupported web integration
points are left unchanged. If the theme hook loads but the audio hook is unavailable,
the controls remain disabled and explain the limitation.

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
   `Theme Song Volume_0.1.0.1` folder inside your Jellyfin plugins directory.
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

1. Open a movie or series that has a theme song and let it start playing.
2. Expand **Theme volume** below its playback buttons.
3. Adjust **Default volume** to set the level for all theme songs on your account.
4. Select a song and enable **Use a custom volume for this song** to override it.
5. Disable that checkbox to inherit the default again, or choose
   **Reset all theme volumes** to remove every override and restore the 25% default.

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

The package is written to `dist/ThemeSongVolume-0.1.0.1.zip`. It contains the plugin
assembly and this guide; Jellyfin's assemblies are not bundled.
The package filename is derived from the version declared in the C# project.
For this preview, use `0.1.0.1` in the catalog and
`theme-song-volume-v0.1.0.1` as the GitHub release tag. Mark the GitHub release as a
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
guards, duplicate initialization, responsive controls, and browser cleanup. Browser
tests use a simulated server and real HTML media elements; they do not establish
compatibility with a real Jellyfin installation or native clients.

The web hooks are based on the
[Jellyfin Web 12.3 theme player](https://github.com/jellyfin/jellyfin-web/blob/v12.3/src/components/themeMediaPlayer.js)
and [HTML audio player](https://github.com/jellyfin/jellyfin-web/blob/v12.3/src/plugins/htmlAudioPlayer/plugin.js).
Before publishing a catalog release, verify playback and uninstall on a real server,
including your installed plugins and the intended Windows/Android clients.
