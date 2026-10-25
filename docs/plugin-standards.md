# Plugin standards

These requirements apply to every plugin in this repository, including future plugins.

## User experience

- Make controls intuitive, accessible by keyboard, and consistent with Jellyfin's UI.
- Keep the interface unobtrusive. Prefer contextual, collapsible controls over
  persistent overlays, unsolicited popups, or changes to existing navigation.
- Provide useful defaults, clearly show inherited values and individual overrides,
  and offer a straightforward way to reset settings.
- Explain what each setting affects and where it applies. Surface actionable errors
  without interrupting unrelated playback or navigation.

## Compatibility and isolation

- Prefer public APIs and additive extension mechanisms. Never overwrite another
  plugin's settings, assets, UI elements, event handlers, or registrations.
- Namespace routes, DOM identifiers, runtime state, registrations, and stored data.
- Do not modify Jellyfin's installed web files, patch global browser prototypes, or
  replace global fetch/network handlers. Use reversible response transformations
  only when no supported client extension API exists.
- Validate integration points before enabling behavior. If a client or bundle is
  incompatible, leave normal Jellyfin behavior intact and report the limitation.
- Document supported server versions, frontend dependencies, client restrictions,
  and known interactions. Test compatibility with relevant settings and plugins.
- Do not promise compatibility with every plugin or client without verification.

## Source media and playback

- Never alter, normalize, overwrite, or delete original media as a side effect of
  playback controls. Volume changes must affect playback only.
- Restrict changes to the intended media and playback context. A theme-song volume
  setting must not change film, episode, regular music, remote-session, or system volume.
- Preserve the user's ordinary playback preferences and other plugins' behavior.
- Respect user authentication and authorization. Scope personal settings to the
  authenticated user and never expose tokens or private media paths in logs.

## Installation, removal, and data lifecycle

- Installation, repeated initialization, disabling, upgrades, and removal must be
  idempotent and must not corrupt the server or break other plugins.
- Unregister only the plugin's own integrations. Remove its event listeners, UI,
  timers, temporary resources, and playback adjustments when it stops or is disabled.
- Store settings only in explicitly owned locations. Remove owned settings on
  uninstall without deleting unrelated files or other plugins' data.
- Do not leave permanent web-file edits, external jobs, browser storage, or modified
  source media behind. Document required server restarts and client reloads.
- If Jellyfin cannot call the uninstall hook (for example, manual deletion while
  stopped), explain how to remove any remaining owned settings safely.

## Verification and delivery

- Build against the declared Jellyfin API and provide reproducible packaging.
- Test the actual behaviors at risk: scope, persistence, validation, concurrency,
  repeated initialization, cleanup, authentication, and incompatible integrations.
- Verify UI behavior at desktop and narrow widths, keyboard interaction, mute and
  reset states, navigation, and transitions into regular playback.
- Record what was tested and what still requires a real client/server test.
- Publish only real, tested release assets with matching catalog checksums; never
  advertise a placeholder download as an installable release.
