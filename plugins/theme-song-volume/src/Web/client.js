/* Theme Song Volume: no browser storage, global prototype changes, or network interception. */
(function (root) {
    'use strict';

    const key = '__MrBoneCrashThemeVolumeV1';
    const normalizeId = value => String(value || '').replace(/-/g, '').toLowerCase();
    const defaults = () => ({ volume: 25, overrides: {} });
    const clone = value => JSON.parse(JSON.stringify(value));

    // Kept independent of Jellyfin and the DOM so playback isolation can be tested.
    function createPlayback(schedule = setTimeout) {
        const states = new Map();
        let profile = defaults();
        let disposed = false;
        const factor = id => (profile.overrides[id] ?? profile.volume) / 100;

        function release(element) {
            const state = states.get(element);
            if (!state) return;
            state.active = false;
            // Cooperate with user controls, fades, and other volume plugins.
            if (Math.abs(element.volume - state.applied) < 0.000001) element.volume = state.base;
            // Native volumechange events are queued; keep their persistence guard alive.
            schedule(() => { if (states.get(element) === state) states.delete(element); }, 100);
        }

        return {
            prepare(element, song, masterVolume) {
                release(element);
                if (disposed || !song) return;
                const id = normalizeId(song.Id);
                const base = Number.isFinite(masterVolume) && masterVolume >= 0 && masterVolume <= 1
                    ? masterVolume : element.volume;
                const state = { base, applied: base * factor(id), id, active: true };
                states.set(element, state);
                element.volume = state.applied;
            },
            setProfile(value) {
                profile = clone(value);
                for (const [element, state] of states) {
                    if (!state.active) continue;
                    if (Math.abs(element.volume - state.applied) >= 0.000001) state.base = element.volume;
                    state.applied = state.base * factor(state.id);
                    element.volume = state.applied;
                }
            },
            shouldPersist: element => !states.has(element),
            diagnostics: () => [...states].map(([element, state]) => ({
                masterVolume: state.base, appliedVolume: state.applied, currentVolume: element.volume, active: state.active
            })),
            release,
            reset() { for (const element of states.keys()) release(element); },
            dispose() {
                disposed = true;
                for (const element of states.keys()) release(element);
            }
        };
    }

    // MPV's second setVolume argument explicitly suppresses preference writes.
    // Only automatic themes marked by the theme hook may enter this adapter.
    function createMpvPlayback(isTheme, ready, schedule = setTimeout, cancel = clearTimeout) {
        const states = new Set();
        const current = new WeakMap();
        let profile = defaults();
        let disposed = false;
        const factor = item => (profile.overrides[normalizeId(item.Id)] ?? profile.volume) / 100;
        const owns = state => current.get(state.player) === state && state.player._currentPlayOptions?.item === state.item;
        const sameVolume = (a, b) => Math.abs(a - b) < .0001;
        function restore(state) {
            if (state.started && owns(state) && sameVolume(state.player.getVolume(), state.applied))
                state.player.setVolume(state.base, false);
        }
        function detach(state) {
            for (const [name, handler] of state.handlers) state.player.events.off(state.player, name, handler);
            if (state.timer !== undefined) cancel(state.timer);
            if (current.get(state.player) === state) current.delete(state.player);
            states.delete(state);
        }
        function finish(state) {
            try { restore(state); } catch { /* The native player may already be closing. */ } finally { detach(state); }
        }
        function release(state) {
            state.ending = true;
            // MPV stop() restores the pre-fade volume before emitting stopped.
            // Wait for that event so a late fade cannot undo our restoration.
            if (state.player._isFadingOut) {
                if (state.timer === undefined) state.timer = schedule(() => {
                    try { if (!state.player._isFadingOut) restore(state); } catch { /* Player closed. */ } finally { detach(state); }
                }, 2000);
            } else finish(state);
        }
        function apply(state) {
            if (!state.started || state.ending || !owns(state) || state.player._isFadingOut) return;
            const current = state.player.getVolume();
            if (!sameVolume(current, state.applied)) state.base = current;
            state.applied = state.base * factor(state.item);
            state.player.setVolume(state.applied, false);
        }
        return {
            beforePlay(player, options) {
                for (const state of [...states]) release(state);
                if (disposed || !isTheme(options?.item) || player?.id !== 'mpvaudioplayer' ||
                    player.name !== 'MPV Audio Player' || typeof player.getSavedVolume !== 'function' ||
                    typeof player.getVolume !== 'function' || typeof player.setVolume !== 'function' ||
                    typeof player.events?.on !== 'function' || typeof player.events?.off !== 'function') return;
                const state = { player, item: options.item, started: false, ending: false, handlers: [] };
                const safe = handler => () => {
                    try { handler(); } catch { finish(state); }
                };
                const playing = safe(() => {
                    if (state.ending || disposed || !owns(state) || !isTheme(state.item)) return;
                    state.base = player.getSavedVolume() * 100;
                    if (!Number.isFinite(state.base) || state.base < 0 || state.base > 100) return;
                    state.applied = player.getVolume(); state.started = true;
                    // The player's own playing handler has just restored its master.
                    state.applied = state.base * factor(state.item);
                    player.setVolume(state.applied, false);
                    ready();
                });
                state.handlers = [['playing', playing], ['stopped', safe(() => finish(state))], ['error', safe(() => release(state))]];
                states.add(state);
                current.set(player, state);
                for (const [name, handler] of state.handlers) player.events.on(player, name, handler);
            },
            setProfile(value) { profile = clone(value); for (const state of states) apply(state); },
            reset() { for (const state of [...states]) release(state); },
            dispose() { disposed = true; this.reset(); },
            diagnostics: () => [...states].map(state => ({ backend: 'mpv', active: state.started && !state.ending,
                masterVolume: state.base / 100, appliedVolume: state.applied / 100, currentVolume: state.player.getVolume() / 100 }))
        };
    }

    if (typeof module === 'object' && module.exports) {
        module.exports = { createPlayback, createMpvPlayback, normalizeId };
        return;
    }
    if (root[key]) return; // Repeated injection is harmless.

    const document = root.document;
    const scriptUrl = new URL(document.currentScript.src);
    const endpoint = new URL('./settings', scriptUrl).href;
    const abort = new AbortController();
    const listeners = [];
    function listen(target, name, handler, capture = false) {
        // Qt WebEngine 5.15.2 does not support the addEventListener signal option.
        target.addEventListener(name, handler, capture);
        listeners.push(() => target.removeEventListener(name, handler, capture));
    }
    const playback = createPlayback();
    let knownThemes = new WeakSet();
    let songs = [];
    let activeThemeId = null;
    let profile = defaults();
    let saved = clone(profile);
    let userId = null;
    let generation = 0;
    let loaded = false;
    let playerReady = false;
    let playbackBackend = 'unavailable';
    let stopped = false;
    let saving = false;
    let pendingSave = false;
    let panel = null;
    let settingsPanel = null;
    let editingInput = null;
    let resetting = false;
    let editRevision = 0;
    let observer = null;
    let refreshing = false;
    let statusText = '';
    let pendingPlayback = null;
    const mpv = createMpvPlayback(item => knownThemes.has(item), () => {
        playerReady = true; playbackBackend = 'jmp-mpv'; mount(); render();
    });
    mpv.setProfile({ volume: 100, overrides: {} }); // Wait for authenticated settings.
    function applyProfile(value) { playback.setProfile(value); mpv.setProfile(value); }

    function api() {
        const client = root.ApiClient;
        if (!client?.getCurrentUserId?.() || !client.accessToken?.()) return null;
        // A cached page must never send a token to a different server.
        const server = new URL(client.serverAddress());
        if (server.origin !== scriptUrl.origin ||
            new URL('ThemeSongVolume/settings', server.href.replace(/\/?$/, '/')).href !== endpoint) return null;
        return client;
    }

    async function request(method = 'GET', value) {
        const client = api();
        if (!client) throw new Error('Sign in to this server to change theme volume.');
        const response = await fetch(endpoint, {
            method, cache: 'no-store', credentials: 'same-origin', signal: abort.signal,
            headers: {
                'Authorization': `MediaBrowser Token="${client.accessToken()}"`,
                ...(value ? { 'Content-Type': 'application/json' } : {})
            },
            body: value ? JSON.stringify(value) : undefined
        });
        if (response.status === 404 || response.status === 410) { dispose(); throw new Error('Plugin removed.'); }
        if (!response.ok) throw new Error('Could not save theme volume. Check your connection and try again.');
        return response.status === 204 ? null : response.json();
    }

    function removePanel() { panel?.remove(); panel = null; }

    function clearSession() {
        generation++;
        loaded = false;
        pendingSave = false;
        pendingPlayback = null;
        editingInput = null;
        settingsPanel?.remove(); settingsPanel = null;
        knownThemes = new WeakSet();
        songs = [];
        activeThemeId = null;
        playback.reset();
        mpv.reset();
        mpv.setProfile({ volume: 100, overrides: {} });
        profile = defaults();
        saved = clone(profile);
        statusText = '';
        removePanel();
    }

    async function refresh() {
        if (stopped || refreshing) return;
        const nextUser = api()?.getCurrentUserId() || null;
        if (nextUser !== userId) {
            clearSession();
            userId = nextUser;
        }
        if (saving || resetting || editingInput) return;
        if (!userId) return;
        refreshing = true;
        const epoch = generation;
        const revision = editRevision;
        try {
            const result = await request();
            if (stopped || epoch !== generation || api()?.getCurrentUserId() !== userId) return;
            if (revision !== editRevision || editingInput || saving || resetting) return;
            if (!result.integrationReady) { dispose(); return; }
            profile = result.profile;
            saved = clone(profile);
            loaded = true;
            applyProfile(profile);
            if (pendingPlayback && knownThemes.has(pendingPlayback.item)) {
                playback.prepare(pendingPlayback.audio, pendingPlayback.item, pendingPlayback.masterVolume);
                pendingPlayback = null;
            }
            mount();
            render();
        } catch (error) {
            if (error.name !== 'AbortError') {
                // Failed health checks release attenuation; playback itself continues normally.
                loaded = false;
                applyProfile({ volume: 100, overrides: {} });
                statusText = 'Theme volume is unavailable. Check your connection.';
                render();
            }
        } finally { refreshing = false; }
    }

    async function save() {
        if (stopped) return;
        if (api()?.getCurrentUserId() !== userId) { void refresh(); return; }
        pendingSave = true;
        if (saving || resetting || !loaded) return;
        saving = true; statusText = 'Saving…'; render();
        const epoch = generation;
        try {
            while (pendingSave && !stopped && epoch === generation) {
                pendingSave = false;
                const next = clone(profile);
                await request('PUT', next);
                if (epoch !== generation || api()?.getCurrentUserId() !== userId) return;
                saved = next;
            }
            statusText = 'Saved';
        } catch (error) {
            if (epoch !== generation) return;
            profile = clone(saved);
            applyProfile(profile);
            statusText = error.message;
        } finally {
            saving = false;
            if (!stopped && epoch === generation) render();
        }
    }

    function element(tag, text, className) {
        const node = document.createElement(tag);
        if (text) node.textContent = text;
        if (className) node.className = className;
        return node;
    }

    function localIds() { return [...new Set(songs.map(song => normalizeId(song.Id)))]; }
    function localValue() {
        return profile.overrides[activeThemeId || localIds()[0]] ?? profile.volume;
    }
    function status(container) {
        const node = element('p', '', 'mbc-volume-status');
        node.setAttribute('role', 'status'); node.setAttribute('aria-live', 'polite');
        container.append(node); return node;
    }
    function checkbox(container, text, handler) {
        const label = element('label', null, 'mbc-volume-check');
        const input = element('input'); input.type = 'checkbox'; input.className = 'mbc-volume-checkbox';
        label.append(input, element('span', text)); container.append(label);
        input.addEventListener('change', handler);
        return input;
    }
    function slider(container, label, onInput) {
        const wrapper = element('label', null, 'mbc-volume-field');
        const text = element('span');
        const input = element('input'); input.type = 'range'; input.className = 'mbc-volume-slider';
        input.min = '0'; input.max = '100'; input.step = '1'; input.setAttribute('aria-label', label);
        const preview = () => { editRevision++; onInput(Number(input.value)); applyProfile(profile); render(); };
        input.addEventListener('input', () => { editingInput = input; preview(); });
        input.addEventListener('change', () => { preview(); editingInput = null; void save(); });
        input.addEventListener('blur', () => {
            if (editingInput === input) { editingInput = null; void save(); }
        });
        wrapper.append(text, input); container.append(wrapper);
        return { input, text, label };
    }
    function updateSlider(control, value) {
        control.text.textContent = `${control.label}: ${value}%`;
        if (editingInput !== control.input) control.input.value = value;
        control.input.disabled = !loaded || resetting;
        control.input.style.setProperty('--mbc-volume-fill', `${value}%`);
        control.input.setAttribute('aria-valuetext', `${value}%`);
    }
    function mountSettings() {
        const settingsUser = new URLSearchParams((root.location.hash.split('?')[1] || '')).get('userId');
        if (settingsUser && normalizeId(settingsUser) !== normalizeId(userId)) {
            settingsPanel?.remove(); settingsPanel = null; return;
        }
        const view = document.querySelector('#displayPreferencesPage:not(.hide)');
        const description = view?.querySelector('#display-settings-lib-theme-songs-description');
        const anchor = description?.closest('.MuiFormControl-root');
        if (!anchor) {
            if (settingsPanel?._mbc?.confirm.checked) {
                settingsPanel._mbc.confirm.checked = false;
                settingsPanel._mbc.reset.disabled = true;
            }
            return;
        }
        if (settingsPanel?.isConnected && settingsPanel.parentElement === anchor.parentElement) return;
        settingsPanel?.remove();
        settingsPanel = element('section', null, 'mbc-theme-volume-ui mbc-volume-settings');
        settingsPanel.id = 'mbc-theme-volume-settings';
        const heading = element('h3', 'Theme song volume'); heading.id = 'mbc-volume-settings-heading';
        settingsPanel.setAttribute('aria-labelledby', heading.id); settingsPanel.append(heading);
        settingsPanel.append(element('p', 'Global volume for your account, shared by compatible clients. Library titles can override it. Changes save automatically.'));
        const global = slider(settingsPanel, 'Global volume', value => { profile.volume = value; });
        settingsPanel.append(element('p', 'Reset restores 25% globally and removes all of your title overrides.'));
        const confirm = checkbox(settingsPanel, 'Confirm reset of all theme volumes', () => render());
        const reset = element('button', 'Reset all theme volumes', 'raised button-cancel emby-button');
        reset.type = 'button';
        reset.addEventListener('click', async () => {
            if (!confirm.checked || !loaded || saving || resetting) return;
            const epoch = generation; editRevision++; resetting = true; confirm.checked = false; render();
            try {
                await request('DELETE');
                if (stopped || epoch !== generation || api()?.getCurrentUserId() !== userId) return;
                profile = defaults(); saved = clone(profile); pendingSave = false;
                applyProfile(profile); statusText = 'Theme volumes reset';
            } catch (error) { if (epoch === generation) statusText = error.message; }
            finally { resetting = false; if (!stopped && epoch === generation) render(); }
        });
        settingsPanel.append(reset);
        settingsPanel._mbc = { global, confirm, reset, status: status(settingsPanel) };
        // Add beside the existing theme option without replacing React-owned nodes.
        anchor.insertAdjacentElement('afterend', settingsPanel);
        render();
    }
    function mount() {
        if (stopped || !loaded) return;
        mountSettings();
        if (!songs.length) { removePanel(); return; }
        const view = document.querySelector('.itemDetailPage:not(.hide), .detailPage:not(.hide)');
        const anchor = view?.querySelector('.mainDetailButtons, .detailButtons');
        if (!anchor) return;
        if (panel?.isConnected && panel.closest('.itemDetailPage, .detailPage') === view) return;
        removePanel();
        panel = element('details', null, 'mbc-theme-volume-ui'); panel.id = 'mbc-theme-volume';
        panel.append(element('summary', 'Theme volume'));
        const body = element('div'); body.dataset.body = 'true'; panel.append(body);
        const useGlobal = checkbox(body, 'Use global', () => {
            if (!loaded || resetting) return;
            editRevision++;
            for (const id of localIds()) {
                if (useGlobal.checked) delete profile.overrides[id];
                else profile.overrides[id] = profile.volume;
            }
            applyProfile(profile); render(); void save();
        });
        const volume = slider(body, 'Theme volume', value => {
            for (const id of localIds()) profile.overrides[id] = value;
        });
        const capability = element('p', 'Playback control is unavailable on this player. Changes are saved to your account and apply on supported players.');
        capability.dataset.capability = 'true'; body.append(capability);
        panel._mbc = { useGlobal, volume, capability, status: status(body) };
        const content = view.querySelector('.detailPagePrimaryContent');
        if (content) content.prepend(panel);
        else anchor.insertAdjacentElement('afterend', panel);
        render();
    }
    function render() {
        if (panel?._mbc) {
            const controls = panel._mbc;
            controls.useGlobal.checked = localIds().every(id => profile.overrides[id] === undefined);
            controls.useGlobal.disabled = !loaded || resetting;
            updateSlider(controls.volume, localValue());
            controls.capability.hidden = playerReady;
            controls.status.textContent = statusText;
        }
        if (settingsPanel?._mbc) {
            const controls = settingsPanel._mbc;
            updateSlider(controls.global, profile.volume);
            controls.confirm.disabled = !loaded || saving || resetting;
            controls.reset.disabled = !loaded || saving || resetting || !controls.confirm.checked;
            controls.status.textContent = statusText;
        }
    }

    const style = element('style');
    style.textContent = `
      .mbc-theme-volume-ui { --mbc-volume-accent: var(--jf-palette-primary-main, rgb(var(--accent, 0, 164, 220))); box-sizing: border-box; min-width: 0; max-width: 30em; margin: 1em 0; text-align: start; font: inherit; color: inherit; }
      .mbc-volume-settings { width: 100%; max-width: none; }
      .mbc-theme-volume-ui h3 { font-size: 1.15em; font-weight: 500; margin: .5em 0; }
      .mbc-theme-volume-ui summary { cursor: pointer; width: fit-content; min-height: 44px; display: list-item; padding: .6em 0; box-sizing: border-box; }
      .mbc-theme-volume-ui [data-body] { padding: .25em 0; }
      .mbc-theme-volume-ui p { font-size: .9em; opacity: .8; margin: .6em 0; }
      .mbc-theme-volume-ui [hidden] { display: none; }
      .mbc-theme-volume-ui .mbc-volume-field { display: block; margin: .5em 0 1em; }
      .mbc-theme-volume-ui .mbc-volume-slider { -webkit-appearance: none; appearance: none; display: block; width: 100%; height: 44px; margin: 0; padding: 0; border: 0; background: transparent; color: var(--mbc-volume-accent); cursor: pointer; touch-action: pan-y; box-sizing: border-box; }
      .mbc-theme-volume-ui .mbc-volume-slider::-webkit-slider-runnable-track { height: 4px; border-radius: 2px; background: linear-gradient(to right, currentColor var(--mbc-volume-fill), rgba(128,128,128,.5) var(--mbc-volume-fill)); }
      .mbc-theme-volume-ui .mbc-volume-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; margin-top: -8px; border: 0; border-radius: 50%; background: currentColor; }
      .mbc-theme-volume-ui .mbc-volume-slider::-moz-range-track { height: 4px; border-radius: 2px; background: rgba(128,128,128,.5); }
      .mbc-theme-volume-ui .mbc-volume-slider::-moz-range-progress { height: 4px; background: currentColor; }
      .mbc-theme-volume-ui .mbc-volume-slider::-moz-range-thumb { width: 20px; height: 20px; border: 0; border-radius: 50%; background: currentColor; }
      .mbc-theme-volume-ui .mbc-volume-check { display: flex; align-items: center; min-height: 44px; cursor: pointer; margin: .5em 0; }
      .mbc-theme-volume-ui .mbc-volume-check > span { margin-inline-start: .75em; }
      .mbc-theme-volume-ui .mbc-volume-checkbox { -webkit-appearance: none; appearance: none; display: inline-block; position: relative; flex: 0 0 20px; width: 20px; height: 20px; margin: 0; padding: 0; border: 2px solid currentColor; border-radius: 3px; background: transparent; color: inherit; cursor: pointer; box-sizing: border-box; }
      .mbc-theme-volume-ui .mbc-volume-checkbox:checked { background: var(--mbc-volume-accent); border-color: var(--mbc-volume-accent); }
      .mbc-theme-volume-ui .mbc-volume-checkbox:checked::after { content: ''; position: absolute; left: 5px; top: 1px; width: 5px; height: 9px; border: solid var(--jf-palette-primary-contrastText, #fff); border-width: 0 2px 2px 0; transform: rotate(45deg); }
      .mbc-theme-volume-ui input:focus, .mbc-theme-volume-ui summary:focus, .mbc-theme-volume-ui button:focus { outline: 2px solid var(--mbc-volume-accent); outline-offset: 3px; }
      .mbc-theme-volume-ui input:disabled { opacity: .5; cursor: default; }
      .mbc-theme-volume-ui button { min-height: 44px; max-width: 100%; white-space: normal; }
      .mbc-theme-volume-ui button:disabled { opacity: .45; cursor: default; }
    `;
    style.id = 'mbc-theme-volume-style'; document.head.append(style);

    function dispose() {
        if (stopped) return;
        stopped = true;
        generation++;
        abort.abort();
        listeners.splice(0).forEach(remove => remove());
        clearInterval(heartbeat);
        observer?.disconnect();
        removePanel(); settingsPanel?.remove(); settingsPanel = null; style.remove(); playback.dispose(); mpv.dispose();
        // Let queued restoration volumechange events pass through the persistence guard.
        setTimeout(() => { if (root[key] === bridge) delete root[key]; }, 150);
    }

    const bridge = {
        diagnostics() {
            return Object.freeze({ settingsLoaded: loaded, playerReady, themeSongCount: songs.length,
                controlsCreated: !!panel?.isConnected, connectedToServer: !!api(), playbackBackend,
                playback: [...playback.diagnostics(), ...mpv.diagnostics()] });
        },
        play(player, options) {
            try {
                if (knownThemes.has(options?.item)) { activeThemeId = normalizeId(options.item.Id); render(); }
                if (knownThemes.has(options?.item) && player?.id !== 'htmlaudioplayer') {
                    playerReady = false; playbackBackend = 'unavailable'; render();
                }
                if (!api() || api().getCurrentUserId() !== userId) { mpv.reset(); void refresh(); }
                else mpv.beforePlay(player, options);
            } catch { /* Leave ordinary client playback intact. */ }
            return player.play(options);
        },
        audioReady() { playbackBackend = 'html-audio'; if (!playerReady) { playerReady = true; mount(); render(); } },
        themes(items) {
            if (stopped) return items;
            const previousIds = localIds().sort().join(',');
            knownThemes = new WeakSet();
            songs = items.filter(item => item.MediaType === 'Audio');
            activeThemeId = normalizeId(songs[0]?.Id);
            songs.forEach(song => knownThemes.add(song));
            if (previousIds !== localIds().sort().join(',')) removePanel();
            mount(); render();
            return items; // Preserve the original array and its item identities.
        },
        prepare(audio, item, masterVolume) {
            if (api()?.getCurrentUserId() !== userId) { pendingPlayback = null; void refresh(); playback.release(audio); return; }
            const theme = knownThemes.has(item);
            if (theme) { activeThemeId = normalizeId(item.Id); render(); }
            pendingPlayback = theme && !loaded ? { audio, item, masterVolume } : null;
            playback.prepare(audio, loaded && theme ? item : null, masterVolume);
        },
        shouldPersist: playback.shouldPersist,
        dispose
    };
    root[key] = bridge;
    listen(document, 'viewshow', () => { void refresh(); mount(); });
    listen(document, 'emptied', event => {
        if (pendingPlayback?.audio === event.target) pendingPlayback = null;
        playback.release(event.target);
    }, true);
    listen(root, 'pagehide', event => {
        // Legacy Jellyfin views emit bubbling pagehide events during SPA navigation.
        // Only a real window departure should tear down the integration.
        if (event.target === root) dispose();
    });
    observer = new MutationObserver(mount);
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
    const heartbeat = setInterval(() => { void refresh(); }, 15000);
    void refresh();
})(typeof window === 'object' ? window : globalThis);
