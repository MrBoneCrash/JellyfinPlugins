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
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        let profile = { volume: 25, overrides: {} };
        let removed = false;
        let writes = 0;
        let firstRead = true;
        await page.route('http://theme-volume.test/**', async route => {
            const url = new URL(route.request().url());
            if (url.pathname.endsWith('client.js')) return route.fulfill({ contentType: 'application/javascript',
                body: fs.readFileSync(path.join(__dirname, '../src/Web/client.js'), 'utf8') });
            if (url.pathname.endsWith('/settings')) {
                assert.equal(route.request().headers()['x-emby-token'], 'fixture-only-token');
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
            return route.fulfill({ contentType: 'text/html', body: `<!DOCTYPE html><html><head>
                <style>body{background:#181818;color:#eee;font:16px system-ui;margin:24px}button{padding:8px}</style>
                <script>window.ApiClient={getCurrentUserId:()=> 'fixture-user',accessToken:()=> 'fixture-only-token',serverAddress:()=> 'http://theme-volume.test'};</script>
                <script defer src="/ThemeSongVolume/client.js"></script></head><body>
                <main class="itemDetailPage"><h1>Example Series</h1><div class="detailButtons"><button>Play</button></div></main>
                </body></html>` });
        });
        await page.goto('http://theme-volume.test/web/index.html');
        await page.waitForFunction(() => window.__MrBoneCrashThemeVolumeV1);
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
        await page.waitForSelector('#mbc-theme-volume');
        await page.waitForFunction(() => window.audio.volume === 0.2);
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
        removed = true;
        await page.evaluate(() => document.dispatchEvent(new CustomEvent('viewshow')));
        await page.waitForFunction(() => !window.__MrBoneCrashThemeVolumeV1);
        assert.equal(await page.evaluate(() => window.audio.volume), 0.8);
        assert.equal(await page.locator('#mbc-theme-volume').count(), 0);
        assert.equal(await page.locator('#mbc-theme-volume-style').count(), 0);
        assert.equal(await page.evaluate(() => window.fetch === window.originalFetch && HTMLMediaElement.prototype.play === window.originalPlay), true);
        assert.equal(await page.evaluate(() => localStorage.length), 0);
        assert.ok(writes > 0);
        assert.deepEqual(errors, []);
        console.log('Browser checks passed: sliders, zero override, inheritance, keyboard, narrow layout, reset, duplicate injection, playback scope, and removal.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
