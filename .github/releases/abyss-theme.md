# Abyss Theme 0.2.0.0 Preview

Install from the MrBoneCrash Jellyfin plugin catalog. Requires Jellyfin 12.3.0,
File Transformation 3.x (verified with 3.0.2.0), and compatible server-hosted
Jellyfin Web with the Dark base theme selected. Restart Jellyfin after installation.

- Reapply Abyss automatically after server restarts and replaced Web files.
- Optional upstream CSS updates from `main`, manual update checks, and rollback/reset controls. Automatic updates are off by default.
- Separate opt-in CSS adaptations for Jellyfin Enhanced and Media Bar Enhanced.
- Preserve other plugin registrations, existing Custom CSS, and installed Web files.
- Disable Abyss styles on dashboard/configuration routes to avoid navigation overlap.

Theme: **Om Gupta (AumGupta)**, [AumGupta/abyss-jellyfin](https://github.com/AumGupta/abyss-jellyfin), MIT licensed.
Copyright and the complete upstream license are included in the ZIP.

Verified: 11 .NET tests, one JavaScript lifecycle test, 13 catalog/tooling tests,
and an isolated real Jellyfin 12.3.0 / Chrome test covering configuration controls
at desktop/narrow widths, authorization, upstream downloads, persistence,
index replacement, rollback/reset, uninstall, and the shared Theme Song Volume
0.1.0.5 registration pipeline.

Preview limits: native clients, Spotlight, future Jellyfin versions, and actual
Jellyfin Enhanced / Media Bar Enhanced installations are not verified. The bundled
adaptations target upstream's documented plugin versions (11.3.0.0 / 1.9.0.0).
CSS validation cannot guarantee visual compatibility. See the included
VERIFICATION.md for details. An online NuGet vulnerability audit was unavailable.
