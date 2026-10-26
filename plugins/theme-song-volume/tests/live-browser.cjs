/* Full browser test against an isolated, real Jellyfin server. No mocked routes. */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

(async () => {
    const sessionFile = process.env.THEME_VOLUME_LIVE_SESSION;
    if (!sessionFile) throw new Error('THEME_VOLUME_LIVE_SESSION must point to the isolated test session.');
    const session = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
    const base = new URL(session.baseUrl || 'http://127.0.0.1:18096');
    if (!['127.0.0.1', 'localhost'].includes(base.hostname))
        throw new Error('This test only permits an isolated loopback server.');
    const headers = { Authorization: `MediaBrowser Token="${session.token}"` };
    const hash = filename => crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
    assert.ok(session.themePath && session.configurationDirectory, 'Media and owned-settings paths are required for cleanup verification.');
    const sourceHash = hash(session.themePath);
    const browser = await chromium.launch({ headless: true,
        ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
        args: ['--autoplay-policy=no-user-gesture-required'] });
    const checks = [];
    const pass = message => { checks.push(message); console.log(`PASS: ${message}`); };
    let page;
    try {
        const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 1000 } });
        page = await context.newPage();
        const pluginStatuses = [];
        page.on('response', response => {
            if (new URL(response.url()).pathname === '/ThemeSongVolume/settings') pluginStatuses.push(response.status());
        });
        const info = await (await context.request.get(`${base.origin}/System/Info/Public`)).json();
        assert.equal(info.Version, '12.3.0');
        const items = await (await context.request.get(`${base.origin}/Items?Recursive=true&IncludeItemTypes=Movie`, { headers })).json();
        const movie = items.Items.find(item => item.Name === 'Test Movie');
        assert.ok(movie, 'The isolated synthetic movie must be scanned before testing.');
        const media = await (await context.request.get(`${base.origin}/Items/${movie.Id}/ThemeMedia?UserId=${session.userId}`, { headers })).json();
        const songId = media.ThemeSongsResult.Items[0].Id.replaceAll('-', '');
        const preferences = await context.request.get(`${base.origin}/ThemeSongVolume/settings`, { headers });
        assert.equal(preferences.status(), 200, 'Real Jellyfin must accept plugin settings authentication.');
        pass('Real authenticated plugin settings endpoint returns HTTP 200');

        await page.goto(`${base.origin}/web/index.html`);
        await page.locator('#txtManualName').fill(session.username);
        await page.locator('#txtManualPassword').fill(session.password);
        await page.getByRole('button', { name: 'Sign In', exact: true }).click();
        await page.waitForFunction(() => window.ApiClient?.getCurrentUserId?.());
        await page.waitForURL(url => !url.hash.includes('login'), { timeout: 15000 });
        // This is Jellyfin's own device setting, confined to this disposable browser.
        await page.evaluate(userId => localStorage.setItem(`${userId}-enableThemeSongs`, 'true'), session.userId);
        const detailUrl = `${base.origin}/web/index.html#!/details?id=${movie.Id}&serverId=${info.Id}`;
        await page.goto(detailUrl);
        const panel = page.locator('#mbc-theme-volume');
        await panel.waitFor({ state: 'visible', timeout: 30000 });
        await page.waitForFunction(() => {
            const audio = document.querySelector('audio.mediaPlayerAudio');
            return audio && !audio.paused && audio.currentSrc && Math.abs(audio.volume - .25) < .001;
        });
        pass('Official bundled theme/audio players show controls and play the real theme at 25%');
        const masterBefore = await page.evaluate(() => localStorage.getItem('volume'));
        if (process.env.THEME_VOLUME_CSS_DIR) {
            const files = ['fixes.css','jf_font.css','base.css','accentlist.css','rounding.css','smallercast.css',
                'episodelist_episodes_compactlist.css','header_header_transparent.css','login_login_frame.css',
                'fields_fields_border.css','cornerindicator_indicator_floating.css','type_colorful.css',
                'titlepage_title_banner-logo.css','progress_floating.css','effects_hoverglow.css'];
            await page.addStyleTag({ content: files.map(file => fs.readFileSync(path.join(process.env.THEME_VOLUME_CSS_DIR, file), 'utf8')).join('\n') +
                '\n.backdropImage{filter:blur(4px) saturate(110%) contrast(110%) brightness(65%)}:root{--rounding:12px;--accent:52,227,5}.backgroundContainer{background-color:rgba(var(--accent),0)!important}' });
            assert.ok(await panel.isVisible());
            pass('Controls remain visible with the reported 15 Ultrachromic modules');
        }
        await panel.locator('summary').click();
        const defaultVolume = panel.getByRole('slider', { name: 'Default volume', exact: true });
        await defaultVolume.fill('50'); await defaultVolume.dispatchEvent('change');
        await page.waitForFunction(() => document.querySelector('#mbc-theme-volume [role=status]')?.textContent === 'Saved');
        await page.waitForFunction(() => Math.abs(document.querySelector('audio.mediaPlayerAudio').volume - .5) < .001);
        const persisted = await (await context.request.get(`${base.origin}/ThemeSongVolume/settings`, { headers })).json();
        assert.equal(persisted.profile.volume, 50);
        pass('Default slider changes actual playback and persists through the real API');

        await panel.getByRole('checkbox').check();
        const overrideVolume = panel.getByRole('slider', { name: 'Song volume', exact: true });
        await overrideVolume.fill('0'); await overrideVolume.dispatchEvent('change');
        await page.waitForFunction(() => document.querySelector('audio.mediaPlayerAudio').volume === 0);
        await page.waitForTimeout(250);
        const muted = await (await context.request.get(`${base.origin}/ThemeSongVolume/settings`, { headers })).json();
        assert.equal(muted.profile.overrides[songId], 0);
        assert.equal(await page.locator('audio.mediaPlayerAudio').evaluate(audio => audio.paused), false);
        await panel.getByRole('checkbox').uncheck();
        await page.waitForFunction(() => Math.abs(document.querySelector('audio.mediaPlayerAudio').volume - .5) < .001);
        pass('Per-song mute and inheritance affect the real playing theme');
        assert.equal(await page.evaluate(() => localStorage.getItem('volume')), masterBefore);
        pass('Jellyfin master-volume storage is unchanged by theme adjustments');

        if (process.env.THEME_VOLUME_LIVE_SCREENSHOT)
            await page.screenshot({ path: process.env.THEME_VOLUME_LIVE_SCREENSHOT, fullPage: true });
        const movieHash = new URL(page.url()).hash;
        await page.evaluate(() => { window.__liveTestBridge = window.__MrBoneCrashThemeVolumeV1; location.hash = '#/home'; });
        await page.waitForTimeout(1000);
        await page.evaluate(hash => { location.hash = hash; }, movieHash);
        await panel.waitFor({ state: 'visible', timeout: 15000 });
        await page.waitForFunction(() => {
            const audio = document.querySelector('audio.mediaPlayerAudio');
            return audio?.paused === false && Math.abs(audio.volume - .5) < .001 &&
                window.__MrBoneCrashThemeVolumeV1.diagnostics().playback.some(state => state.active);
        });
        assert.equal(await page.evaluate(() => window.__liveTestBridge === window.__MrBoneCrashThemeVolumeV1), true);
        pass('Actual Jellyfin navigation preserves runtime and saved preferences');

        const play = page.locator('.mainDetailButtons .btnPlay:not(.hide), .mainDetailButtons .btnReplay:not(.hide)').first();
        await play.click();
        await page.waitForFunction(() => [...document.querySelectorAll('video')].some(video => !video.paused && video.currentSrc));
        assert.equal(await page.locator('video').first().evaluate(video => video.volume), 1);
        pass('Ordinary movie playback retains full master volume');
        await page.goto(detailUrl);
        // A hash-only goto is SPA navigation; reload to actually replace the document/player.
        await page.reload();
        await panel.waitFor({ state: 'visible', timeout: 15000 });
        await page.waitForFunction(() => {
            const audio = document.querySelector('audio.mediaPlayerAudio');
            return audio && !audio.paused && audio.currentSrc && Math.abs(audio.volume - .5) < .001;
        });
        pass('Saved theme volume survives a full browser page load');
        console.log('Reload playback state:', JSON.stringify(await page.evaluate(() => ({
            diagnostics: window.__MrBoneCrashThemeVolumeV1.diagnostics(), master: localStorage.getItem('volume')
        }))));

        await panel.locator('summary').click();
        const reset = panel.getByRole('button', { name: 'Reset all theme volumes' });
        await reset.click();
        await page.waitForFunction(() => document.querySelector('#mbc-theme-volume [role=status]')?.textContent === 'Theme volumes reset');
        console.log('Reset playback state:', JSON.stringify(await page.evaluate(() => ({
            diagnostics: window.__MrBoneCrashThemeVolumeV1.diagnostics(), master: localStorage.getItem('volume')
        }))));
        await page.waitForFunction(() => Math.abs(document.querySelector('audio.mediaPlayerAudio').volume - .25) < .001);
        pass('Reset removes overrides and restores the default during playback');
        // Save a profile again so uninstall must remove an actual settings file.
        await defaultVolume.fill('40'); await defaultVolume.dispatchEvent('change');
        await page.waitForFunction(() => document.querySelector('#mbc-theme-volume [role=status]')?.textContent === 'Saved');
        const removed = await context.request.delete(`${base.origin}/Plugins/bc7977c8-ec09-4da4-8030-97c7e5a21491`, { headers });
        assert.equal(removed.status(), 204);
        await page.waitForFunction(() => !window.__MrBoneCrashThemeVolumeV1, { timeout: 20000 });
        assert.equal(await panel.count(), 0);
        assert.equal(await page.locator('audio.mediaPlayerAudio').evaluate(audio => audio.volume), 1);
        assert.equal(await page.locator('#mbc-theme-volume-style').count(), 0);
        assert.equal(fs.existsSync(path.join(session.configurationDirectory, 'MrBoneCrash.ThemeSongVolume')), false);
        pass('Real uninstall removes controls, runtime, owned settings, and restores volume');
        assert.equal(hash(session.themePath), sourceHash);
        pass('Original synthetic theme file checksum remains unchanged');
        assert.ok(pluginStatuses.every(status => [200, 204, 410].includes(status)), `Unexpected settings statuses: ${pluginStatuses.join(', ')}`);
        const report = { passed: true, serverVersion: info.Version, checks };
        if (process.env.THEME_VOLUME_LIVE_REPORT)
            fs.writeFileSync(process.env.THEME_VOLUME_LIVE_REPORT, JSON.stringify(report, null, 2));
        console.log(JSON.stringify(report, null, 2));
    } catch (error) {
        if (page) {
            console.error('Live browser failure:', JSON.stringify(await page.evaluate(() => ({
                path: location.hash, runtime: !!window.__MrBoneCrashThemeVolumeV1,
                diagnostics: window.__MrBoneCrashThemeVolumeV1?.diagnostics(),
                audio: [...document.querySelectorAll('audio')].map(audio => ({ volume: audio.volume, paused: audio.paused })),
                bodyText: document.body.innerText.slice(-500)
            }))));
        }
        throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
