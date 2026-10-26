# Theme Song Volume 0.1.0.6 Preview

Adds a theme-volume adapter for Jellyfin Media Player 1.12.0's MPV audio player.
It uses the native player's non-persisting volume command only for automatically
played theme songs, then restores the normal volume after fades or removal.

Main/runtime and dynamic chunk URLs now include the plugin version. Apps should
fetch the updated integration instead of retaining older transformed bundles.
Account settings remain editable when local playback control is unavailable;
a persistent notice explains that the settings apply only on supported players.

## Verification

- Real Jellyfin 12.3.0 / File Transformation 3.0.2.0 HTML playback and uninstall.
- Desktop and Android-style physical-volume host fixtures in Chromium.
- Qt WebEngine 5.15.2 / Chromium 83 UI compatibility.
- MPV commands, preference preservation, mute, fades and cleanup against the
  official JMP 1.12.0 audio class with a simulated native bridge.

Actual Windows sound output and Android app playback still require device testing.
There is no Android ExoPlayer/external-player volume adapter. No system-wide volume
commands are used as a fallback. Source media and installed web files remain unchanged.

## Updating

Update from the catalog, restart Jellyfin, then fully close and reopen the apps.
The versioned bundle URLs are intended to avoid requiring manual cache clearing.
Open a movie or series with a theme song and expand **Theme volume**.

Read-only diagnostics report `playbackBackend` as `html-audio`, `jmp-mpv`, or
`unavailable`. Synced account values alone do not establish playback support.

Requires Jellyfin Server 12.3 and File Transformation 3.x compatible with the
server. This is a GitHub pre-release; Jellyfin catalogs have no separate preview flag.
