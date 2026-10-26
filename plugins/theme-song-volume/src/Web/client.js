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
        knownThemes = new WeakSet();
        songs = [];
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
        if (saving) return;
        if (!userId) return;
        refreshing = true;
        const epoch = generation;
        try {
            const result = await request();
            if (stopped || epoch !== generation || api()?.getCurrentUserId() !== userId) return;
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
            if (!panel?.contains(document.activeElement)) render();
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
        if (api()?.getCurrentUserId() !== userId) { void refresh(); return; }
        pendingSave = true;
        if (saving || !loaded) return;
        saving = true;
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

    function mount() {
        if (stopped || !loaded || !songs.length || panel?.isConnected) return;
        const view = document.querySelector('.itemDetailPage:not(.hide), .detailPage:not(.hide)');
        const anchor = view?.querySelector('.mainDetailButtons, .detailButtons');
        if (!anchor) return;
        removePanel();
        panel = element('details', null, 'mbc-theme-volume');
        panel.id = 'mbc-theme-volume';
        panel.append(element('summary', 'Theme volume'));
        const body = element('div');
        body.dataset.body = 'true';
        panel.append(body);
        // The ribbon lays metadata and buttons out horizontally. Keep our
        // expandable controls in the content below it, rather than adding a column.
        const content = view.querySelector('.detailPagePrimaryContent');
        if (content) content.prepend(panel);
        else anchor.insertAdjacentElement('afterend', panel);
        render();
    }

    function slider(body, label, value, disabled, onInput, onChange) {
        const wrapper = element('label');
        const text = element('span', `${label}: ${value}%`);
        const input = element('input');
        input.type = 'range';
        input.min = '0'; input.max = '100'; input.step = '1'; input.value = value;
        input.disabled = disabled || !loaded;
        input.setAttribute('aria-label', label);
        input.addEventListener('input', () => {
            if (!loaded) return;
            text.textContent = `${label}: ${input.value}%`;
            onInput(Number(input.value));
            applyProfile(profile);
        });
        input.addEventListener('change', onChange);
        wrapper.append(text, input); body.append(wrapper);
    }

    function render() {
        const body = panel?.querySelector('[data-body]');
        if (!body) return;
        const selected = body.querySelector('select')?.value || normalizeId(songs[0]?.Id);
        // Save completion must not take focus away from keyboard controls.
        if (body.contains(document.activeElement)) {
            const inactive = !loaded;
            const defaultInput = body.querySelector('input[aria-label="Default volume"]');
            const songInput = body.querySelector('input[aria-label="Song volume"]');
            const toggle = body.querySelector('input[type=checkbox]');
            if (defaultInput) {
                defaultInput.value = profile.volume;
                defaultInput.disabled = inactive;
                defaultInput.previousSibling.textContent = `Default volume: ${profile.volume}%`;
            }
            if (toggle && songInput) {
                toggle.checked = profile.overrides[selected] !== undefined;
                toggle.disabled = inactive;
                songInput.disabled = inactive || !toggle.checked;
                songInput.value = profile.overrides[selected] ?? profile.volume;
                songInput.previousSibling.textContent = `Song volume: ${songInput.value}%`;
            }
            const reset = body.querySelector('button');
            if (reset) reset.disabled = inactive || saving;
            const status = body.querySelector('[role=status]');
            if (status) status.textContent = statusText;
            const capability = body.querySelector('[data-capability]');
            if (capability) capability.hidden = playerReady;
            return;
        }
        // Jellyfin Media Player's Chromium 83 predates replaceChildren().
        body.textContent = '';
        body.append(element('p', 'Theme songs only. Your regular playback volume remains the master volume.'));
        const capability = element('p', 'Playback control is unavailable on this player. Changes are saved to your account and apply on supported players.');
        capability.dataset.capability = 'true'; capability.hidden = playerReady; body.append(capability);
        slider(body, 'Default volume', profile.volume, false,
            value => {
                profile.volume = value;
                const inherited = body.querySelector('input[aria-label="Song volume"]');
                if (inherited?.disabled) {
                    inherited.value = value;
                    inherited.previousSibling.textContent = `Song volume: ${value}%`;
                }
            }, save);
        const songLabel = element('label', 'Song');
        const select = element('select', null, 'emby-select emby-select-withcolor');
        select.setAttribute('aria-label', 'Theme song');
        for (const [index, song] of songs.entries()) {
            const option = element('option', song.Name || `Theme song ${index + 1}`);
            option.value = normalizeId(song.Id);
            select.append(option);
        }
        select.value = songs.some(song => normalizeId(song.Id) === selected) ? selected : normalizeId(songs[0].Id);
        songLabel.append(select); body.append(songLabel);
        const id = select.value;
        const override = profile.overrides[id] !== undefined;
        const toggleLabel = element('label', null, 'mbc-theme-volume-toggle');
        const toggle = element('input'); toggle.type = 'checkbox'; toggle.checked = override;
        toggle.disabled = !loaded;
        toggleLabel.append(toggle, document.createTextNode('Use a custom volume for this song'));
        body.append(toggleLabel);
        const customValue = profile.overrides[id] ?? profile.volume;
        slider(body, 'Song volume', customValue, !override,
            value => { profile.overrides[id] = value; }, save);
        const custom = body.querySelector('input[aria-label="Song volume"]');
        toggle.addEventListener('change', () => {
            if (toggle.checked) profile.overrides[id] = profile.volume;
            else delete profile.overrides[id];
            custom.disabled = !toggle.checked;
            custom.value = profile.overrides[id] ?? profile.volume;
            custom.previousSibling.textContent = `Song volume: ${custom.value}%`;
            applyProfile(profile);
            void save();
        });
        select.addEventListener('change', () => {
            // Explicit selection changes rebuild the panel, then restore focus.
            select.blur(); render(); body.querySelector('select')?.focus();
        });
        const status = element('p', statusText); status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite'); body.append(status);
        const reset = element('button', 'Reset all theme volumes', 'raised button-submit block emby-button');
        reset.type = 'button'; reset.disabled = !loaded || saving;
        reset.addEventListener('click', async () => {
            reset.disabled = true;
            try {
                await request('DELETE');
                profile = defaults(); saved = clone(profile);
                applyProfile(profile); statusText = 'Theme volumes reset';
            } catch (error) { statusText = error.message; }
            if (!stopped) { panel.querySelector('summary').focus(); render(); }
        });
        body.append(reset);
    }

    const style = element('style');
    style.textContent = `
      #mbc-theme-volume { max-width: 30em; margin: 1em 0; text-align: start; }
      #mbc-theme-volume summary { cursor: pointer; opacity: .85; width: fit-content; padding: .4em 0; }
      #mbc-theme-volume summary:focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }
      #mbc-theme-volume [data-body] { padding: .5em 1em; border-inline-start: 2px solid currentColor; }
      #mbc-theme-volume label { display: block; margin-block: 1em; }
      #mbc-theme-volume input[type=range], #mbc-theme-volume select { display: block; width: 100%; margin-top: .6em; box-sizing: border-box; }
      #mbc-theme-volume select { padding: .5em; color: inherit; background-color: rgba(0,0,0,.18); }
      #mbc-theme-volume option { color: CanvasText; background-color: Canvas; }
      #mbc-theme-volume p { font-size: .9em; opacity: .8; }
      #mbc-theme-volume .mbc-theme-volume-toggle { display: flex; align-items: center; gap: .6em; }
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
        removePanel(); style.remove(); playback.dispose(); mpv.dispose();
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
            knownThemes = new WeakSet();
            songs = items.filter(item => item.MediaType === 'Audio');
            songs.forEach(song => knownThemes.add(song));
            removePanel(); mount();
            return items; // Preserve the original array and its item identities.
        },
        prepare(audio, item, masterVolume) {
            if (api()?.getCurrentUserId() !== userId) { pendingPlayback = null; void refresh(); playback.release(audio); return; }
            const theme = knownThemes.has(item);
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
