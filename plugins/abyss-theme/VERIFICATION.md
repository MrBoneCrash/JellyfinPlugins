# Verification

This is an unpublished preview targeting Jellyfin 12.3.0 and File Transformation
3.x. Verified locally on Windows on 2026-10-26:

- Six .NET tests passed, along with 13 repository tooling tests and catalog validation.
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

The isolated live test used its own random loopback port, configuration, data,
cache, profile and copied Web directory. No existing server was reconfigured or
stopped, and no Theme Song Volume development files were changed. Reproduce with
`python scripts/test_abyss_theme_live.py` after configuring the distribution paths
described in that script. Install Playwright 1.62.1 and its Chromium browser, or
set `ABYSS_BROWSER_CHANNEL=chrome` for an installed Google Chrome. Optionally set
`ABYSS_THEME_VOLUME_DLL` to an immutable published DLL to repeat the shared
pipeline check. Results are written to `dist/abyss-theme-live.json`; screenshots
and server logs stay under the isolated `.tools/abyss-live-*` directory.

Automated server tests cover embedded CSS, repeat application, unknown shells,
preservation of other markup, plugin discovery metadata, startup registration,
repeat startup, concurrent requests during uninstall, stop, and restart. The
reflection API unit test uses a fake File Transformation 3.x API; it is not proof
of real server or client compatibility.

No end-to-end check was performed for authenticated home/library/playback views,
the full range of keyboard interactions, native clients, Spotlight, reverse proxy
base URLs, future server versions, or visual compatibility with other CSS themes.
The shared pipeline check does not verify every Theme Song Volume playback
behavior. Updates that change the Web shell or plugin ABI require renewed
verification. Index replacement and restart simulate an update's file replacement;
they are not an actual upgrade between two Jellyfin releases.

NuGet's vulnerability feed was unreachable locally, so restore used
`-p:NuGetAudit=false` with the existing package cache. The build and tests passed;
an online package vulnerability audit was not completed.
