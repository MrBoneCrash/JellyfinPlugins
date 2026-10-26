/* Browser integration fixture: no real Jellyfin credentials or media required. */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
    const browser = await chromium.launch({ headless: true,
        ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    try {
        const page = await browser.newPage();
        if (process.env.THEME_VOLUME_LEGACY_DOM === '1') {
            await page.addInitScript(() => {
                // Match the missing API and ignored signal option in JMP's
                // Qt WebEngine 5.15.2 / Chromium 83 without a global polyfill.
                delete Element.prototype.replaceChildren;
                window.ownedListeners = [];
                const add = EventTarget.prototype.addEventListener;
                const remove = EventTarget.prototype.removeEventListener;
                EventTarget.prototype.addEventListener = function (name, handler, options) {
                    if (this === document || this === window) {
                        if (['viewshow', 'emptied', 'pagehide'].includes(name))
                            window.ownedListeners.push({ target: this, name, handler });
                    }
                    return add.call(this, name, handler, typeof options === 'object'
                        ? { capture: !!options.capture, once: !!options.once, passive: !!options.passive } : options);
                };
                EventTarget.prototype.removeEventListener = function (name, handler, options) {
                    window.ownedListeners = window.ownedListeners.filter(listener =>
                        listener.target !== this || listener.name !== name || listener.handler !== handler);
                    return remove.call(this, name, handler, options);
                };
            });
        }
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        let profile = process.env.THEME_VOLUME_SETTINGS_RESPONSE
            ? JSON.parse(fs.readFileSync(process.env.THEME_VOLUME_SETTINGS_RESPONSE, 'utf8')).profile
            : { volume: 25, overrides: {} };
        const cssModules = ['fixes.css', 'jf_font.css', 'base.css', 'accentlist.css', 'rounding.css',
            'smallercast.css', 'episodelist_episodes_compactlist.css', 'header_header_transparent.css',
            'login_login_frame.css', 'fields_fields_border.css', 'cornerindicator_indicator_floating.css',
            'type_colorful.css', 'titlepage_title_banner-logo.css', 'progress_floating.css', 'effects_hoverglow.css'];
        const customCss = process.env.THEME_VOLUME_CSS_DIR
            ? cssModules.map(name => fs.readFileSync(path.join(process.env.THEME_VOLUME_CSS_DIR, name), 'utf8')).join('\n') +
                '\n.backdropImage{filter:blur(4px) saturate(110%) contrast(110%) brightness(65%)}:root{--rounding:12px;--accent:52,227,5}.backgroundContainer{background-color:rgba(var(--accent),0)!important}'
            : '';
        let removed = false;
        let writes = 0;
        let firstRead = true;
        await page.route('http://theme-volume.test/**', async route => {
            const url = new URL(route.request().url());
            if (url.pathname.endsWith('client.js')) return route.fulfill({ contentType: 'application/javascript',
                body: fs.readFileSync(path.join(__dirname, '../src/Web/client.js'), 'utf8') });
            if (url.pathname.endsWith('/settings')) {
                assert.equal(route.request().headers()['authorization'], 'MediaBrowser Token="fixture-only-token"');
                if (firstRead && route.request().method() === 'GET') {
                    firstRead = false;
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
                if (removed) return route.fulfill({ status: 410 });
                if (route.request().method() === 'PUT') { profile = route.request().postDataJSON(); writes++; }
                if (route.request().method() === 'DELETE') {
                    profile = { volume: 25, overrides: {} };
                    return route.fulfill({ status: 204 });
                }
                return route.fulfill({ json: route.request().method() === 'GET'
                    ? { profile, integrationReady: true } : profile });
            }
            return route.fulfill({ contentType: 'text/html', body: `<!DOCTYPE html><html class="layout-desktop"><head>
                <style>body{background:#181818;color:#eee;font:16px system-ui;margin:24px}button{padding:8px}</style>
                <style>${customCss}</style>
                <script>window.ApiClient={getCurrentUserId:()=> 'fixture-user',accessToken:()=> 'fixture-only-token',serverAddress:()=> 'http://theme-volume.test'};</script>
                <script defer src="/ThemeSongVolume/client.js"></script></head><body>
                <main id="itemDetailPage" class="page libraryPage itemDetailPage"><h1>Example Series</h1><div class="detailRibbon"><div class="mainDetailButtons focuscontainer-x"><button>Play</button></div></div></main>
                </body></html>` });
        });
        await page.goto('http://theme-volume.test/web/index.html');
        await page.waitForFunction(() => window.__MrBoneCrashThemeVolumeV1);
        // Reading account settings must not falsely promise playback support.
        // Editing remains possible even before a supported player has appeared.
        await page.evaluate(() => {
            window.__unsupportedTheme = { Id: 'bc7977c8ec094da4803097c7e5a21491', MediaType: 'Audio', Name: 'Theme' };
            window.__MrBoneCrashThemeVolumeV1.themes([window.__unsupportedTheme]);
        });
        await page.waitForSelector('#mbc-theme-volume');
        if (await page.locator('#mbc-theme-volume').getAttribute('open') === null)
            await page.locator('#mbc-theme-volume summary').click();
        assert.equal(await page.getByRole('slider', { name: 'Default volume', exact: true }).isEnabled(), true);
        assert.equal(await page.locator('[data-capability]').isVisible(), true);
        await page.getByRole('slider', { name: 'Default volume', exact: true }).fill('35');
        await page.getByRole('slider', { name: 'Default volume', exact: true }).dispatchEvent('change');
        await page.waitForFunction(() => document.querySelector('[role=status]').textContent === 'Saved');
        assert.equal(profile.volume, 35);
        // Restore the starting profile through the UI before playback assertions.
        await page.getByRole('slider', { name: 'Default volume', exact: true }).fill('25');
        await page.getByRole('slider', { name: 'Default volume', exact: true }).dispatchEvent('change');
        await page.waitForFunction(() => document.querySelector('[role=status]').textContent === 'Saved');
        await page.evaluate(() => {
            window.originalFetch = window.fetch;
            window.originalPlay = HTMLMediaElement.prototype.play;
            window.song = { Id: 'bc7977c8ec094da4803097c7e5a21491', MediaType: 'Audio', Name: 'Example theme' };
            window.__MrBoneCrashThemeVolumeV1.audioReady();
            window.__MrBoneCrashThemeVolumeV1.themes([window.song]);
            window.audio = document.createElement('audio');
            document.body.append(window.audio);
            window.audio.volume = 0.8;
            // Theme playback may begin before its initial settings request completes.
            window.__MrBoneCrashThemeVolumeV1.prepare(window.audio, window.song);
        });
        await page.waitForSelector('#mbc-theme-volume', { timeout: 5000 });
        assert.equal(await page.locator('.detailButtons').count(), 0);
        assert.equal(await page.locator('.mainDetailButtons + #mbc-theme-volume').count(), 1);
        await page.waitForFunction(() => window.audio.volume === 0.2);
        // Jellyfin dispatches a bubbling pagehide from legacy views during SPA navigation.
        await page.evaluate(() => document.querySelector('#itemDetailPage').dispatchEvent(
            new CustomEvent('pagehide', { bubbles: true })));
        await page.waitForTimeout(200);
        assert.equal(await page.evaluate(() => !!window.__MrBoneCrashThemeVolumeV1), true,
            'Navigating between Jellyfin views must not dispose the plugin runtime');
        assert.equal(await page.locator('#mbc-theme-volume').getAttribute('open'), null);
        await page.locator('summary').click();
        await page.evaluate(() => window.__MrBoneCrashThemeVolumeV1.prepare(window.audio, window.song));
        assert.equal(await page.evaluate(() => window.audio.volume), 0.2);
        await page.getByRole('slider', { name: 'Default volume', exact: true }).fill('50');
        await page.getByRole('slider', { name: 'Default volume', exact: true }).dispatchEvent('change');
        await page.waitForFunction(() => document.querySelector('[role=status]').textContent === 'Saved');
        assert.equal(await page.evaluate(() => window.audio.volume), 0.4);
        assert.equal(profile.volume, 50);
        await page.getByRole('checkbox').check();
        await page.getByRole('slider', { name: 'Song volume', exact: true }).fill('0');
        await page.getByRole('slider', { name: 'Song volume', exact: true }).dispatchEvent('change');
        await page.waitForFunction(() => window.audio.volume === 0);
        await page.waitForTimeout(200);
        assert.equal(profile.overrides['bc7977c8ec094da4803097c7e5a21491'], 0);
        await page.getByRole('checkbox').uncheck();
        assert.equal(await page.evaluate(() => window.audio.volume), 0.4);
        await page.getByRole('slider', { name: 'Default volume', exact: true }).focus();
        await page.keyboard.press('ArrowLeft');
        await page.keyboard.press('Tab');
        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(() => { document.documentElement.className = 'layout-mobile'; });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        if (process.env.THEME_VOLUME_SCREENSHOT)
            await page.screenshot({ path: process.env.THEME_VOLUME_SCREENSHOT });
        await page.getByRole('button', { name: 'Reset all theme volumes' }).click();
        await page.waitForFunction(() => document.querySelector('[role=status]').textContent === 'Theme volumes reset');
        assert.equal(profile.volume, 25);
        assert.deepEqual(profile.overrides, {});
        // Reinjecting the script neither adds UI nor resets the live runtime.
        await page.addScriptTag({ url: 'http://theme-volume.test/ThemeSongVolume/client.js' });
        assert.equal(await page.locator('#mbc-theme-volume').count(), 1);
        // Normal playback of another item, including a theme played manually, is untouched.
        await page.evaluate(() => window.__MrBoneCrashThemeVolumeV1.prepare(window.audio, { ...window.song }));
        assert.equal(await page.evaluate(() => window.audio.volume), 0.8);
        await page.evaluate(() => window.__MrBoneCrashThemeVolumeV1.prepare(window.audio, window.song));
        assert.equal(await page.evaluate(() => window.audio.volume), 0.2);
        // Exercise account-backed UI edits through the MPV bridge, not just its
        // isolated adapter. The native command is a spy; no system volume changes.
        await page.evaluate(() => {
            const handlers = {};
            window.mpvCommands = [];
            window.mpvPlayer = {
                id: 'mpvaudioplayer', name: 'MPV Audio Player', volume: 80,
                getSavedVolume: () => .8, getVolume() { return this.volume; },
                setVolume(value, save) { this.volume = value; window.mpvCommands.push({ value, save }); },
                events: {
                    on(player, name, handler) { (handlers[name] ||= []).push(handler); },
                    off(player, name, handler) { handlers[name] = (handlers[name] || []).filter(fn => fn !== handler); }
                },
                play(options) {
                    this._currentPlayOptions = options;
                    for (const fn of [...handlers.playing || []]) fn();
                    return Promise.resolve();
                }
            };
            return window.__MrBoneCrashThemeVolumeV1.play(window.mpvPlayer, { item: window.song });
        });
        assert.equal(await page.evaluate(() => window.mpvPlayer.volume), 20);
        assert.equal(await page.evaluate(() => window.__MrBoneCrashThemeVolumeV1.diagnostics().playbackBackend), 'jmp-mpv');
        if (await page.locator('#mbc-theme-volume').getAttribute('open') === null)
            await page.locator('#mbc-theme-volume summary').click();
        await page.getByRole('slider', { name: 'Default volume', exact: true }).fill('50');
        await page.getByRole('slider', { name: 'Default volume', exact: true }).dispatchEvent('change');
        await page.waitForFunction(() => document.querySelector('[role=status]').textContent === 'Saved');
        assert.equal(await page.evaluate(() => window.mpvPlayer.volume), 40);
        assert.equal(await page.evaluate(() => window.mpvCommands.every(command => command.save === false)), true);
        removed = true;
        await page.evaluate(() => document.dispatchEvent(new CustomEvent('viewshow')));
        await page.waitForFunction(() => !window.__MrBoneCrashThemeVolumeV1);
        assert.equal(await page.evaluate(() => window.audio.volume), 0.8);
        assert.equal(await page.evaluate(() => window.mpvPlayer.volume), 80);
        assert.equal(await page.locator('#mbc-theme-volume').count(), 0);
        assert.equal(await page.locator('#mbc-theme-volume-style').count(), 0);
        assert.equal(await page.evaluate(() => window.fetch === window.originalFetch && HTMLMediaElement.prototype.play === window.originalPlay), true);
        assert.equal(await page.evaluate(() => localStorage.length), 0);
        if (process.env.THEME_VOLUME_LEGACY_DOM === '1')
            assert.equal(await page.evaluate(() => window.ownedListeners.length), 0,
                'Uninstall must remove global listeners even without signal-option support');
        assert.ok(writes > 0);
        assert.deepEqual(errors, []);
        // Native window navigation still performs cleanup.
        removed = false;
        await page.reload();
        await page.waitForFunction(() => window.__MrBoneCrashThemeVolumeV1);
        await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
        await page.waitForFunction(() => !window.__MrBoneCrashThemeVolumeV1);
        assert.equal(await page.locator('#mbc-theme-volume-style').count(), 0);
        console.log('Browser checks passed: sliders, zero override, inheritance, keyboard, narrow layout, reset, duplicate injection, playback scope, and removal.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
