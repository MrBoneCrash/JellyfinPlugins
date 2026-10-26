# Verification

Preview 0.3.0.0 targets Jellyfin 12.3.0 / .NET 10 and File Transformation 3.x.
Local verification on Windows on 2026-10-26 used File Transformation 3.0.2.0 and
headless Google Chrome through Playwright 1.62.1.

## Automated checks

- 16 .NET tests: plugin metadata, repeated transformation/registration, unrelated
  markup/registrations, concurrent uninstall, lifecycle/restart, cache persistence,
  rollback/reset, stale-download rejection, corrupt state, bounded/validated
  settings, appearance CSS, legacy-setting migration, configuration-control coverage,
  changed licensing, immutable update URLs and opt-in Spotlight code downloads.
- One Node.js runtime test: main/dashboard routing, active-server identity checks,
  reversible Dark presentation, settings refresh, repeated initialization,
  listener/observer/timer cleanup and page-cache reattachment.
- Syntax checks for the runtime, configuration script and adapted Spotlight script;
  the served Spotlight document contains no browser-storage or installer-update
  notification behavior.
- 13 repository tooling tests. Catalog generation/checksum checks run for releases.

The reflection boundary test uses a fake File Transformation 3.x API. This is
supplemented by the real-server check below, not treated as client compatibility proof.

## Isolated real Jellyfin test

The test uses a random loopback port and independent config, data, cache, profile
and copied Web directory. It creates two synthetic films, local metadata and local
backdrop images. No existing server is changed or stopped and no real media is used.

Verified behaviors include:

- Plugin discovery and shared index pipeline with an immutable published Theme
  Song Volume 0.1.0.5 DLL. Development files of that plugin remain untouched.
- Login styling and keyboard focus at 1440px and 390px. Font CDNs were blocked.
- Real authenticated dashboard configuration: save, rollback, full reset, keyboard
  form submission, appearance preview, persisted color choice and section navigation
  without changing the Jellyfin route. Screenshots were visually inspected.
- Spotlight renders accessible synthetic movie titles, metadata, local artwork and
  controls at desktop/mobile widths. Configured radius, Lite, source selection,
  hidden overview and banner sizes are applied.
- Recommended home-section order is applied in the recognized Web layout.
- Details navigation removes the home banner and uses an owned authenticated
  backdrop. Disabling Abyss removes the banner/styles and restores the prior root
  theme attribute. Standard Jellyfin preferences and media remain untouched.
- A separate account with no allowed libraries sees no other account's films.
- Missing helper leaves the main stylesheet inactive and ordinary Jellyfin usable.
- Anonymous/non-admin administration requests return 401/403; all mutations use the
  elevated policy. Read-only runtime/assets intentionally remain public.
- A real upstream download at revision 2f809171ed7f3a34b5e78297608b5f2b63dd3f0f
  passes validation. Code pinning / opt-in promotion are additionally fixture-tested.
- Restart with a replaced index reapplies the theme. Settings survive restart.
  Authenticated uninstall and restart remove owned state/Abyss while preserving
  branding CSS, the other plugin and all test Web-file hashes except the test's
  deliberate index replacement.

The complete live run also passed rotation/hover-pause checks, the restricted
account's optional empty-message mode and the experimental Full dashboard fallback
to a usable Safe palette. Screenshot capture waited for the banner entrance
animation to finish before visual inspection.

## Reproduction

Install extracted Jellyfin 12.3 and File Transformation 3.0.2.0 distributions and
set ABYSS_JELLYFIN_DIR / ABYSS_FILE_TRANSFORMATION_DIR if they differ from the
ignored .tools defaults. Build Release, install Playwright 1.62.1 and its Chromium,
then run:

```powershell
python scripts/test_abyss_theme_live.py
```

NODE_PATH can point to Playwright's node_modules. ABYSS_BROWSER_CHANNEL=chrome uses
an installed Chrome. ABYSS_THEME_VOLUME_DLL optionally selects a published immutable
DLL for the shared-pipeline check; ABYSS_TEST_NETWORK_UPDATE=1 includes live GitHub
access. Results are written to dist/abyss-theme-live.json; screenshots/logs remain
under each isolated .tools/abyss-live-* directory. The dedicated CI workflow also
runs the portable-server/browser suite on Windows.

## Limits

Native Android/iOS/TV, casting, Jellyfin Media Player/Desktop, separately hosted
clients, actual Jellyfin Enhanced / Media Bar Enhanced installations, real reverse
proxies and future Jellyfin versions are unverified. Those clients are not supported
merely because their server ABI matches. The adaptation targets are upstream's
documented versions, not a blanket compatibility guarantee.

The live test covers synthetic movie sources. Continue Watching/Next Up requests
and episode rendering use adapted upstream behavior but have not been exhaustively
tested with real series/resume libraries. Play/Resume delegates to existing Web
actions or opens details; native players and all playback paths are not guaranteed.
All keyboard/TV navigation combinations, the full refresh/update interval and a
complete upgrade between different Jellyfin releases have not been observed.
Index replacement/restart simulates the file-replacement aspect of an upgrade.

CSS validation and recognized code markers do not guarantee future visual or
security compatibility. Spotlight code updates execute trusted upstream code only
when explicitly enabled. Unknown layouts/integration points are skipped or rejected.
A cached package restore was used locally because the online NuGet vulnerability
feed was unavailable; an online vulnerability audit was not completed.
