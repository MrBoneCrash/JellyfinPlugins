# Theme Song Volume 0.1.0.1 Preview

Fixes the plugin dashboard failing to load after installing version 0.1.0.0.
The plugin now initializes its assembly path, data path, and version before
Jellyfin reads its metadata. A regression test reproduces the original
`GET /Plugins` / `BasePlugin.get_CanUninstall()` failure and verifies the fix.

## Requirements

- Jellyfin Server 12.3.
- File Transformation 3.x compatible with your server.
- A compatible server-hosted Jellyfin Web interface. Native Windows and Android
  playback paths are not guaranteed to work.

## Updating

If the plugin dashboard opens, update Theme Song Volume from the catalog and
restart Jellyfin. Reload the client after the restart.

If the old plugin prevents the dashboard from loading, stop Jellyfin, move the
old Theme Song Volume installation folder out of the plugins directory, and
extract this release ZIP into `Theme Song Volume_0.1.0.1` inside the plugins
directory. Start Jellyfin again. Keep the plugin configurations directory to
retain your saved theme-volume preferences.

## Preview status

Server-side tests, playback-isolation tests, and browser-fixture checks pass.
Real-server and Windows/Android device verification is still required.
Jellyfin catalogs do not have a separate pre-release flag; this version remains
installable through the manifest and is identified as a preview in its text.
