# Theme Song Volume 0.1.0.4 Preview

Fixes missing theme-volume controls with the official Jellyfin Web 12.3 bundles.
The audio hook now recognizes Webpack's renamed volume-saving function, and
settings requests use the MediaBrowser Authorization header accepted by the server.
Also prevents repeated attenuation when Jellyfin reuses its audio player after a fade.

Verified on an isolated real Jellyfin 12.3.0 server with File Transformation 3.0.2.0
and Windows Chrome using synthetic media. Checks cover visible controls, default
volume, individual mute, persistence, navigation, normal movie volume, reset,
uninstall cleanup, and unchanged source media/web files. The reported Ultrachromic
stylesheet modules were also checked locally. GitHub Actions runs the real-server
test before publishing this release.

## Updating

Update Theme Song Volume from the catalog, restart Jellyfin, and reload the client.
Open a movie or series whose theme song is playing, then expand **Theme volume**
below the playback buttons. The administration page remains informational.

Requires Jellyfin Server 12.3 and File Transformation 3.x compatible with your
server. Native Windows and Android clients have not been device-tested; native
playback and separately bundled web interfaces are not supported automatically.

This GitHub release is a pre-release. Jellyfin catalogs have no separate
pre-release flag; the manifest identifies it as a preview in its text.
