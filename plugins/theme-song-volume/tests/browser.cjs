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
        const extraCss = process.env.THEME_VOLUME_CSS_FILE ? fs.readFileSync(process.env.THEME_VOLUME_CSS_FILE, 'utf8') : '';
        let removed = false;
        let writes = 0;
        let firstRead = true;
        let staleRead = null;
        await page.route('http://theme-volume.test/**', async route => {
            const url = new URL(route.request().url());
            if (url.pathname.endsWith('client.js')) return route.fulfill({ contentType: 'application/javascript',
                body: fs.readFileSync(path.join(__dirname, '../src/Web/client.js'), 'utf8') });
            if (url.pathname.endsWith('/settings')) {
                assert.equal(route.request().headers()['authorization'], 'MediaBrowser Token="fixture-only-token"');
                if (staleRead && route.request().method() === 'GET') {
                    const read = staleRead; staleRead = null;
                    const snapshot = JSON.parse(JSON.stringify(profile)); read.started(); await read.gate;
                    return route.fulfill({ json: { profile: snapshot, integrationReady: true } });
                }
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
            return route.fulfill({ contentType: 'text/html', body: `<!DOCTYPE html><html class="layout-desktop" data-theme="dark"><head>
                <style>.hide{display:none!important}body{background:#181818;color:#eee;font:16px system-ui;margin:24px}button{padding:8px}.emby-button{font:inherit;color:inherit}</style>
                <style>${customCss}${extraCss}</style>
                <script>window.ApiClient={getCurrentUserId:()=> 'fixture-user',accessToken:()=> 'fixture-only-token',serverAddress:()=> 'http://theme-volume.test'};</script>
                <script defer src="/ThemeSongVolume/client.js"></script></head><body>
                <main id="itemDetailPage" class="page libraryPage itemDetailPage"><h1>Example Series</h1><div class="detailRibbon"><div class="mainDetailButtons focuscontainer-x"><button>Play</button></div></div></main>
                <section id="displayPreferencesPage" class="page userPreferencesPage hide"><div class="settingsContainer"><form>
                  <div class="MuiFormControl-root"><label><input type="checkbox" name="enableLibraryThemeSongs">Theme songs</label><p id="display-settings-lib-theme-songs-description">Play themes</p></div>
                  <button type="submit">Save display preferences</button>
                </form></div></section>
                </body></html>` });
        });
        await page.goto('http://theme-volume.test/web/index.html');
        await page.waitForFunction(() => window.__MrBoneCrashThemeVolumeV1?.diagnostics().settingsLoaded);
        const panel = page.locator('#mbc-theme-volume');
        const settings = page.locator('#mbc-theme-volume-settings');
        const waitSaved = id => page.waitForFunction(id => document.querySelector(`#${id} [role=status]`)?.textContent === 'Saved', id);
        const display = async () => {
            await page.evaluate(() => {
                document.querySelector('#itemDetailPage').classList.add('hide');
                document.querySelector('#displayPreferencesPage').classList.remove('hide');
                document.dispatchEvent(new CustomEvent('viewshow'));
            });
            await settings.waitFor({ state: 'visible' });
        };
        const library = async () => {
            await page.evaluate(() => {
                document.querySelector('#itemDetailPage').classList.remove('hide');
                document.querySelector('#displayPreferencesPage').classList.add('hide');
                document.dispatchEvent(new CustomEvent('viewshow'));
            });
            await panel.waitFor({ state: 'visible' });
            if (await panel.getAttribute('open') === null) await panel.locator('summary').click();
        };
        await page.evaluate(() => {
            window.originalFetch = window.fetch; window.originalPlay = HTMLMediaElement.prototype.play;
            window.song = { Id: 'bc7977c8ec094da4803097c7e5a21491', MediaType: 'Audio', Name: 'Theme one' };
            window.secondSong = { Id: '11111111111111111111111111111111', MediaType: 'Audio', Name: 'Theme two' };
            window.__MrBoneCrashThemeVolumeV1.themes([window.song, window.secondSong]);
        });
        await library();
        await page.evaluate(() => { window.originalThemePanel = document.getElementById('mbc-theme-volume'); window.__MrBoneCrashThemeVolumeV1.themes([window.song, window.secondSong]); });
        assert.equal(await page.evaluate(() => window.originalThemePanel === document.getElementById('mbc-theme-volume') && window.originalThemePanel.open), true,
            'Refreshing the same title must preserve the open panel');
        assert.equal(await panel.getByRole('slider').count(), 1);
        assert.equal(await panel.locator('select,button').count(), 0, 'No title selector or reset button on library pages');
        assert.equal(await panel.getByRole('checkbox', { name: 'Use global', exact: true }).isChecked(), true);
        assert.equal(await panel.getByRole('slider').inputValue(), '25');
        assert.equal(await panel.locator('[data-capability]').isVisible(), true);
        const local = panel.getByRole('slider', { name: 'Theme volume', exact: true });
        await local.fill('35'); await local.dispatchEvent('change'); await waitSaved('mbc-theme-volume');
        assert.equal(await panel.getByRole('checkbox').isChecked(), false, 'Slider movement automatically opts out of global');
        assert.equal(profile.volume, 25);
        assert.deepEqual(Object.values(profile.overrides), [35,35], 'No selector: this title override covers its theme songs');
        await panel.getByRole('checkbox').check(); await waitSaved('mbc-theme-volume');
        assert.equal(await local.inputValue(), '25'); assert.deepEqual(profile.overrides, {});

        await display();
        assert.equal(await settings.getByRole('slider').count(), 1);
        assert.equal(await settings.getByRole('button', { name: 'Reset all theme volumes' }).isDisabled(), true);
        const global = settings.getByRole('slider', { name: 'Global volume', exact: true });
        await global.fill('50'); await global.dispatchEvent('change'); await waitSaved('mbc-theme-volume-settings');
        assert.equal(profile.volume, 50);
        await page.evaluate(() => { location.hash = '#/mypreferencesdisplay?userId=other-user'; document.dispatchEvent(new CustomEvent('viewshow')); });
        await settings.waitFor({ state: 'detached' });
        await page.evaluate(() => { location.hash = '#/mypreferencesdisplay?userId=fixture-user'; document.dispatchEvent(new CustomEvent('viewshow')); });
        await settings.waitFor({ state: 'visible' });
        await library(); assert.equal(await local.inputValue(), '50');
        await page.evaluate(() => {
            window.__MrBoneCrashThemeVolumeV1.audioReady();
            window.audio = document.createElement('audio'); document.body.append(window.audio); window.audio.volume = .8;
            window.__MrBoneCrashThemeVolumeV1.prepare(window.audio, window.song);
        });
        assert.equal(await page.evaluate(() => window.audio.volume), .4);
        let releaseRead, readStarted;
        const started = new Promise(resolve => { readStarted = resolve; });
        staleRead = { started: readStarted, gate: new Promise(resolve => { releaseRead = resolve; }) };
        await page.evaluate(() => document.dispatchEvent(new CustomEvent('viewshow'))); await started;
        await local.fill('0'); await local.dispatchEvent('change'); await waitSaved('mbc-theme-volume');
        const staleResponse = page.waitForResponse(response => response.request().method() === 'GET' && response.url().endsWith('/settings'));
        releaseRead(); await staleResponse;
        assert.equal(await page.evaluate(() => window.audio.volume), 0);
        assert.equal(await panel.getByRole('checkbox').isChecked(), false);
        await display(); await global.fill('60'); await global.dispatchEvent('change'); await waitSaved('mbc-theme-volume-settings');
        assert.equal(await page.evaluate(() => window.audio.volume), 0, 'Global changes preserve local overrides');
        await library(); await panel.getByRole('checkbox').check(); await waitSaved('mbc-theme-volume');
        assert.equal(await local.inputValue(), '60');
        assert.ok(Math.abs(await page.evaluate(() => window.audio.volume) - .48) < .001);
        // Keyboard and mobile sizing use the same custom controls as desktop.
        await local.focus(); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Tab');
        assert.equal(await panel.getByRole('checkbox').isChecked(), false);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(() => { document.documentElement.className = 'layout-mobile'; });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.ok((await local.boundingBox()).height >= 44);
        assert.equal(await local.evaluate(input => getComputedStyle(input).webkitAppearance), 'none');
        if (process.env.THEME_VOLUME_SCREENSHOT) await page.screenshot({ path: process.env.THEME_VOLUME_SCREENSHOT });
        await display();
        const reset = settings.getByRole('button', { name: 'Reset all theme volumes' });
        const confirm = settings.getByRole('checkbox', { name: 'Confirm reset of all theme volumes' });
        assert.equal(await reset.isDisabled(), true);
        await confirm.check(); assert.equal(await reset.isEnabled(), true);
        await confirm.uncheck(); assert.equal(await reset.isDisabled(), true);
        await confirm.check(); await library(); await display();
        assert.equal(await confirm.isChecked(), false, 'Leaving settings clears a prior reset confirmation');
        await confirm.check(); await reset.click();
        await page.waitForFunction(() => document.querySelector('#mbc-theme-volume-settings [role=status]').textContent === 'Theme volumes reset');
        assert.equal(profile.volume, 25); assert.deepEqual(profile.overrides, {});
        assert.equal(await confirm.isChecked(), false); assert.equal(await reset.isDisabled(), true);
        await library(); assert.equal(await panel.getByRole('checkbox').isChecked(), true);
        assert.equal(await local.inputValue(), '25'); assert.equal(await page.evaluate(() => window.audio.volume), .2);
        await page.addScriptTag({ url: 'http://theme-volume.test/ThemeSongVolume/client.js' });
        assert.equal(await panel.count(), 1); assert.equal(await settings.count(), 1);
        await page.evaluate(() => window.__MrBoneCrashThemeVolumeV1.prepare(window.audio, { ...window.song }));
        assert.equal(await page.evaluate(() => window.audio.volume), .8);
        await page.evaluate(() => window.__MrBoneCrashThemeVolumeV1.prepare(window.audio, window.song));
        assert.equal(await page.evaluate(() => window.audio.volume), .2);
        await page.evaluate(() => {
            const handlers = {}; window.mpvCommands = [];
            window.mpvPlayer = { id: 'mpvaudioplayer', name: 'MPV Audio Player', volume: 80,
                getSavedVolume: () => .8, getVolume() { return this.volume; },
                setVolume(value, save) { this.volume = value; window.mpvCommands.push({ value, save }); },
                events: { on(p,n,h) { (handlers[n] ||= []).push(h); }, off(p,n,h) { handlers[n]=(handlers[n]||[]).filter(f=>f!==h); } },
                play(options) { this._currentPlayOptions=options; for(const fn of [...handlers.playing||[]]) fn(); return Promise.resolve(); } };
            return window.__MrBoneCrashThemeVolumeV1.play(window.mpvPlayer, { item: window.song });
        });
        assert.equal(await page.evaluate(() => window.mpvPlayer.volume), 20);
        await local.fill('50'); await local.dispatchEvent('change'); await waitSaved('mbc-theme-volume');
        assert.equal(await page.evaluate(() => window.mpvPlayer.volume), 40);
        assert.equal(await page.evaluate(() => window.mpvCommands.every(command => command.save === false)), true);
        removed = true; await page.evaluate(() => document.dispatchEvent(new CustomEvent('viewshow')));
        await page.waitForFunction(() => !window.__MrBoneCrashThemeVolumeV1);
        assert.equal(await page.evaluate(() => window.audio.volume), .8);
        assert.equal(await page.evaluate(() => window.mpvPlayer.volume), 80);
        assert.equal(await panel.count(), 0); assert.equal(await settings.count(), 0);
        assert.equal(await page.locator('#mbc-theme-volume-style').count(), 0);
        assert.equal(await page.evaluate(() => window.fetch === window.originalFetch && HTMLMediaElement.prototype.play === window.originalPlay), true);
        assert.equal(await page.evaluate(() => localStorage.length), 0);
        if (process.env.THEME_VOLUME_LEGACY_DOM === '1') assert.equal(await page.evaluate(() => window.ownedListeners.length), 0);
        assert.ok(writes > 0); assert.deepEqual(errors, []);
        removed = false; await page.reload(); await page.waitForFunction(() => window.__MrBoneCrashThemeVolumeV1);
        await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
        await page.waitForFunction(() => !window.__MrBoneCrashThemeVolumeV1);
        console.log('Browser checks passed: Display settings, confirmed reset, one title slider, automatic override, inheritance, keyboard, mobile styling, MPV and cleanup.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
