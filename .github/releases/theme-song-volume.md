# Theme Song Volume 0.1.0.5 Preview

Fixes empty or intermittent theme-volume controls in Jellyfin Media Player with
Qt WebEngine 5.15.2 / Chromium 83. The installed client reproduced
`body.replaceChildren is not a function`, which aborted rendering and the theme
playback hook. The panel now clears its content using a compatible DOM operation.

Global listeners are also removed explicitly on disposal, so cleanup works on
engines that ignore the `addEventListener` signal option.

The previous release fails on the actual Qt 5.15.2 engine; the corrected script
passes controls, song dropdown, save, cached-view navigation, and removal checks.
Actions now gates publication on this exact-engine test, the existing browser
checks, and the real Jellyfin 12.3.0 / File Transformation 3.0.2.0 playback test.

## Updating

Update Theme Song Volume from the catalog, restart Jellyfin, and reload the client.
Open a movie or series whose theme song is playing, then expand **Theme volume**
below the playback buttons. The administration page remains informational.

Requires Jellyfin Server 12.3 and File Transformation 3.x compatible with your
server. This verifies the Windows UI fix; it does not establish native-player
volume support. Native playback and separately bundled web interfaces remain
unsupported. Android playback remains unverified.

This GitHub release is a pre-release. Jellyfin catalogs have no separate
pre-release flag; the manifest identifies it as a preview in its text.
