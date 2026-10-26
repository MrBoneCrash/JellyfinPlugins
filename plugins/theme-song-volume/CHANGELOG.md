# Changelog

## 0.1.0.6 — Preview

- Add an isolated JMP 1.12.0 MPV audio adapter using non-persisting volume commands
  for automatic theme songs. Restore master volume after fades and on removal.
- Version the main/runtime bootstrap and dynamic chunk URLs so app caches do not
  keep untransformed audio hooks across plugin upgrades.
- Allow account settings to be edited when local playback control is unavailable.
  Keep a separate, persistent capability notice instead of disabled synced sliders.
- Report the recognized playback backend in read-only diagnostics.
- Test native scope, mute, ordinary playback, fade/restoration and cleanup against
  the official JMP audio class with a simulated native bridge. Actual Windows
  sound output and Android app playback still require device verification.

## 0.1.0.5 — Preview

- Fix empty or intermittent theme-volume controls in Jellyfin Media Player with
  Qt WebEngine 5.15.2 / Chromium 83. Clear the panel with a supported DOM operation
  instead of `replaceChildren()`, which aborted rendering and the theme-play hook.
- Remove global listeners explicitly on disposal. Chromium 83 does not support
  the `addEventListener` signal option used for automatic cleanup.
- Add browser regression checks for the missing API and ignored signal option,
  plus an actual Qt WebEngine 5.15.2 test for controls, save, navigation and removal.
- Keep native playback support separate from verified UI compatibility.

## 0.1.0.4 — Preview

- Recognize the actual Webpack export alias used to save audio volume in the
  official Jellyfin Web 12.3 distribution. Preserve the guard against saving
  theme attenuation as the user's ordinary playback volume.
- Authenticate settings requests with the standard MediaBrowser Authorization
  header accepted by Jellyfin 12.3.
- Use the core player's saved master volume when reusing its audio element after
  a fade, preventing repeated theme attenuation during navigation.
- Place expandable controls in the detail content below the ribbon so they do
  not compete with metadata and playback buttons for horizontal space.
- Add real-server browser verification using synthetic media, including actual
  theme/movie playback, persistence, reset, uninstall, and source-file checksums.
- Run the disposable Windows server test in GitHub Actions before publication.
- Extend read-only diagnostics with active playback volume state.

## 0.1.0.3 — Preview

- Keep the integration alive when Jellyfin's legacy views emit a bubbling
  `pagehide` event during normal navigation. Clean up only when the window leaves.
- Pin the `volume` and `overrides` JSON property names so the API works with
  Jellyfin's PascalCase serializer as well as the browser's expected contract.
- Run browser checks with a response serialized using Jellyfin's actual JSON defaults.
- Test the reported Ultrachromic modules, preserve readable song selectors, and
  expose a read-only runtime diagnostic snapshot without tokens or user IDs.

## 0.1.0.2 — Preview

- Mount the controls below Jellyfin Web 12.3's actual `mainDetailButtons` element.
- Register the HTML loader under File Transformation's shared literal `index.html`
  key, preventing other UI plugins' exact-match registrations from shadowing it.
- Register and remove the JavaScript transformation separately with its own ID.
- Version the client-script URL and avoid treating HTML strings in JavaScript
  bundles as full HTML documents.
- Test the controls against the real 12.3 detail-page class names and add
  registration compatibility checks.

## 0.1.0.1 — Preview

- Initialize the plugin assembly path, data path, and assembly version before
  exposing the plugin instance to Jellyfin.
- Fix plugin discovery and the `GET /Plugins` failure in
  `BasePlugin.get_CanUninstall()` caused by missing assembly metadata.
- Add a regression test that serializes an installed plugin through
  `LocalPlugin.GetPluginInfo()`, reproducing the dashboard's plugin-list behavior.

## 0.1.0.0 — Preview

- Initial preview of default theme-song volume and individual song overrides.
