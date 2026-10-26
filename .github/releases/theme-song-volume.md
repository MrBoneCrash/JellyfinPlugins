# Theme Song Volume 0.1.0.7 Preview

Global volume and reset now live in **Account settings → Display**, beside
Jellyfin's theme-song option. Reset stays disabled until its confirmation
checkbox is checked, and clears the confirmation after use or when leaving.

Library pages now contain one **Theme volume** slider and a **Use global** checkbox.
Use global is checked by default. Moving the slider unchecks it automatically;
checking it removes the title override and moves the slider to the current
global level. There is no title/song selector, global slider, or reset button on
library pages. A local edit applies to that title's theme songs together.

Controls follow the client's theme palette and use consistent slider/checkbox
styling, 44-pixel touch targets, and keyboard focus indicators. The open panel is
preserved when the same title's themes refresh. Stale settings reads do not
replace an in-progress slider edit.

## Verification

- Real Jellyfin 12.3.0 Display preferences, including React re-renders, saving,
  inheritance, confirmed reset, playback, navigation, and uninstall.
- Desktop/mobile browser layouts, Ultrachromic modules, and bundled Abyss styling.
- Qt WebEngine 5.15.2 / Chromium 83 controls and touch sizing.
- Existing HTML/MPV playback isolation and account separation checks.

Android-style host fixtures remain simulations. Physical Android/iOS styling
and native Windows sound output are not newly device-verified by this release.
Playback support limits are unchanged.

## Updating

Update the plugin, restart Jellyfin, then reopen the apps. Existing account
preferences are retained; no source media or installed web files are changed.
The dashboard plugin page explains where the controls now live.

Requires Jellyfin 12.3 and compatible File Transformation 3.x. This remains a
GitHub pre-release and is installable through the repository manifest.
