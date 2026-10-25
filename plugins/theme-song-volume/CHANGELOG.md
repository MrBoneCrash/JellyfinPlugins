# Changelog

## 0.1.0.1 — Preview

- Initialize the plugin assembly path, data path, and assembly version before
  exposing the plugin instance to Jellyfin.
- Fix plugin discovery and the `GET /Plugins` failure in
  `BasePlugin.get_CanUninstall()` caused by missing assembly metadata.
- Add a regression test that serializes an installed plugin through
  `LocalPlugin.GetPluginInfo()`, reproducing the dashboard's plugin-list behavior.

## 0.1.0.0 — Preview

- Initial preview of default theme-song volume and individual song overrides.
