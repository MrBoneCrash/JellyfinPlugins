# Abyss Theme 0.3.0.0 Preview

The complete configurable Abyss experience for compatible server-hosted Jellyfin
Web: Spotlight, Lite mode, appearance controls and reversible layout integration.
Requires Jellyfin 12.3.0 / .NET 10 and File Transformation 3.x (verified: 3.0.2.0).
Restart Jellyfin after updating, then reload the Web client.

- Redesigned responsive configuration with section navigation, local appearance
  preview, accessible native controls, section defaults and clear recovery actions.
- Configurable colors, fonts, scale, radius, blur, motion and performance settings.
- Spotlight content sources, rotation/hover pause, banner sizes, artwork,
  metadata, progress, buttons and empty states. Uses the active account/server.
- Temporary Dark, owned content backdrops, standard home-section order and safe
  dashboard palette. Experimental Full styling falls back on navigation overlap.
- Separate optional plugin CSS adaptations and visual/Spotlight code updates,
  with configurable check intervals and complete-bundle rollback.
- No permanent Web-file edits, browser storage, source-media changes or saved
  Jellyfin preference changes. Existing branding CSS and other plugins are preserved.

Theme, Lite, Spotlight and adaptations: **Om Gupta (AumGupta)**,
[AumGupta/abyss-jellyfin](https://github.com/AumGupta/abyss-jellyfin), MIT licensed.
Full original license and credits are included. Spotlight is adapted for active
authentication, configuration and lifecycle behavior.

Verified: 16 .NET tests, runtime lifecycle/syntax checks, 13 tooling tests and real
Jellyfin/Chrome tests with synthetic films at desktop/mobile widths, restricted-user
isolation, settings/recovery, backdrops, home order, rotation, dashboard fallback,
restart/index replacement and uninstall. See VERIFICATION.md for precise limits.

Native clients, real Jellyfin Enhanced/Media Bar Enhanced installations, real
reverse proxies and future Jellyfin versions are unverified. Play/Resume delegates
to existing Web actions or opens details. Upstream code updates are separately
opt-in and execute trusted upstream JavaScript; validation is not a security or
visual compatibility guarantee. An online NuGet vulnerability audit was unavailable.
