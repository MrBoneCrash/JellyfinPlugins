# Verification

This is a preview targeting Jellyfin 12.3.0 and File Transformation
3.x. Verified locally on Windows on 2026-10-26:

- Eleven .NET tests passed, along with 13 repository tooling tests and catalog validation.
- Real portable Jellyfin 12.3.0 with File Transformation 3.0.2.0 loaded and listed
  this plugin successfully. Both Abyss and the published Theme Song Volume
  0.1.0.5 integration appeared in the same Web response.
- Headless Google Chrome via Playwright 1.62.1 rendered the login page at 1440 x
  1000 and 390 x 844. Checked a single injected stylesheet, computed Abyss accent
  variable, keyboard focus entry, and visually inspected both screenshots.
  Font CDN requests were blocked deliberately; local CSS still applied.
- After stopping the server, replacing the Web index with a marked copy, and
  restarting, Abyss was reapplied exactly once. Existing branding CSS survived.
- Authenticated uninstall followed by restart removed Abyss while retaining
  Theme Song Volume in the Web response and preserving branding CSS.
- Hash comparison confirmed all test Web files remained unchanged by the plugins
  (apart from the test's deliberate index replacement).
- Administrator-only REST access was checked for all five endpoints: anonymous
  requests returned 401 and a non-administrator account returned 403.
- Both CSS adaptations were enabled and disabled through the real API; the Web
  response contained the selected styles only. Settings survived a server restart.
- The configuration page mounted in the real authenticated Jellyfin dashboard.
  Its switches, save, rollback, reset and keyboard form submission were tested
  there at both 1440px and 390px widths, with screenshots visually inspected.
  Abyss styles are suppressed on dashboard/configuration routes to prevent the
  upstream drawer styles from covering the configuration controls.
  Normal Web navigation re-enabled the theme; blocking the same-origin helper
  left the theme inactive and ordinary Jellyfin styling intact.
- A real manual upstream check downloaded and validated the complete bundle at
  revision `2f809171ed7f3a34b5e78297608b5f2b63dd3f0f`. This was already the bundled
  revision, so it did not promote a newer live theme. Promotion, prior-bundle
  persistence, rollback and invalid-bundle rejection were tested using fixtures.

The isolated live test used its own random loopback port, configuration, data,
cache, profile and copied Web directory. No existing server was reconfigured or
stopped, and no Theme Song Volume development files were changed. Reproduce with
`python scripts/test_abyss_theme_live.py` after configuring the distribution paths
described in that script. Install Playwright 1.62.1 and its Chromium browser, or
set `ABYSS_BROWSER_CHANNEL=chrome` for an installed Google Chrome. Optionally set
`ABYSS_THEME_VOLUME_DLL` to an immutable published DLL to repeat the shared
pipeline check. Set `ABYSS_TEST_NETWORK_UPDATE=1` to include a real upstream check.
Results are written to `dist/abyss-theme-live.json`; screenshots
and server logs stay under the isolated `.tools/abyss-live-*` directory.

Automated server tests cover embedded CSS, repeat application, unknown shells,
preservation of other markup, plugin discovery metadata, startup registration,
repeat startup, concurrent requests during uninstall, stop, and restart. The
reflection API unit test uses a fake File Transformation 3.x API; it is not proof
of real server or client compatibility.

Update tests cover independent adaptation switches, persisted settings, current
and previous bundles, rollback/reset, stale-download rejection after settings
changes, uninstall cleanup, corrupt saved state, invalid/incomplete CSS, changed
licensing, missing downloads, and immutable-revision URLs. Automatic scheduling
uses the same update path; a full 24-hour background cycle was not observed.
One Node.js lifecycle test covers route suppression, normal navigation, repeated
initialization, observer/listener cleanup and back-forward-cache reattachment.

No end-to-end check was performed for authenticated home/library/playback views,
the full range of keyboard interactions, native clients, Spotlight, reverse proxy
base URLs, future server versions, or visual compatibility with other CSS themes.
The shared pipeline check does not verify every Theme Song Volume playback
behavior. Updates that change the Web shell or plugin ABI require renewed
verification. Index replacement and restart simulate an update's file replacement;
they are not an actual upgrade between two Jellyfin releases.
Actual Jellyfin Enhanced and Media Bar Enhanced installations have not been
tested. Loading their upstream adaptation CSS is not a compatibility guarantee.

NuGet's vulnerability feed was unreachable locally, so restore used
`-p:NuGetAudit=false` with the existing package cache. The build and tests passed;
an online package vulnerability audit was not completed.
