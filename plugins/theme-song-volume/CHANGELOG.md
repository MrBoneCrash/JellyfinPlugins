# Changelog

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
