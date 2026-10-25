# Theme Song Volume 0.1.0.3 Preview

Fixes the integration disappearing during ordinary Jellyfin Web navigation.
Jellyfin's legacy pages emit bubbling `pagehide` events, which previously caused
the plugin to shut itself down. Cleanup now distinguishes these view changes
from a real browser-window departure.

Also fixes settings serialization: `volume` and `overrides` now keep their
expected names under Jellyfin's PascalCase JSON defaults. The browser checks use
an actual Jellyfin-serialized settings response. The reported 15 Ultrachromic CSS
modules were also tested locally at desktop and mobile widths.

The plugin's administration page remains informational. Open a movie or series
whose theme song is playing, then expand **Theme volume** below the play buttons.

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
extract this release ZIP into `Theme Song Volume_0.1.0.3` inside the plugins
directory. Start Jellyfin again. Keep the plugin configurations directory to
retain your saved theme-volume preferences.

## Preview status

Server-side tests, playback-isolation tests, and browser-fixture checks pass.
Real-server and Windows/Android device verification is still required.
Jellyfin catalogs do not have a separate pre-release flag; this version remains
installable through the manifest and is identified as a preview in its text.
