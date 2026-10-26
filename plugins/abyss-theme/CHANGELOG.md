# Changelog

## 0.2.0.0 (unpublished preview)

- Add administrator-only configuration with opt-in upstream CSS updates and manual checks.
- Download all assets at one immutable revision; validate and persist complete bundles atomically.
- Retain active CSS on update failure and a previous bundle for rollback. Rollback/reset prevent pending update promotion.
- Add separate opt-in Jellyfin Enhanced and Media Bar Enhanced CSS adaptations with upstream credits and version limits.
- Remove owned settings and cached bundles on uninstall; preserve unknown files and other plugins.
- Keep Abyss styles inactive in dashboard/configuration routes to prevent navigation overlap. If the same-origin helper cannot load, styles remain inactive.

## 0.1.0.0 (unpublished preview)

- Bundle Abyss CSS by Om Gupta (AumGupta) with its MIT license and upstream credit.
- Register the theme automatically on every server start using the shared File Transformation 3.x index pipeline.
- Preserve installed Web files, branding settings, user preferences, and other plugin registrations.
- Unregister only this plugin on stop/uninstall; restart and reload clients to clear cached pages.
- Target Jellyfin 12.3; future server/Web compatibility and native clients are not guaranteed.
