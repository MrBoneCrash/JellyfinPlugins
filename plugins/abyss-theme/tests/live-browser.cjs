const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

(async () => {
    const browser = await chromium.launch({ headless: true, channel: process.env.ABYSS_BROWSER_CHANNEL || undefined });
    try {
        const page = await browser.newPage();
        // Test the local CSS independently of availability of upstream font CDNs.
        await page.route('https://fonts.googleapis.com/**', route => route.abort());
        await page.route('https://fonts.gstatic.com/**', route => route.abort());
        await page.route('https://cdn.jsdelivr.net/**', route => route.abort());
        for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
            await page.setViewportSize({ width, height });
            await page.goto(process.env.ABYSS_TEST_BASE + '/web/index.html', { waitUntil: 'networkidle' });
            await page.waitForSelector('#MrBoneCrash-AbyssTheme-v1', { state: 'attached' });
            assert.equal(await page.locator('#MrBoneCrash-AbyssTheme-v1').count(), 1);
            assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--abyss-accent').trim()), '245, 245, 247');
            await page.waitForTimeout(1000);
            await page.keyboard.press('Tab');
            assert.ok(await page.evaluate(() => document.activeElement !== document.body), 'keyboard focus enters the page');
            await page.screenshot({ path: path.join(process.env.ABYSS_TEST_OUTPUT, name + '.png'), fullPage: true });
        }
        console.log('Abyss embedded CSS and keyboard focus verified at 1440px and 390px.');
        await page.locator('input[type="text"]').first().fill('abyss-test');
        await page.locator('input[type="password"]').fill(process.env.ABYSS_TEST_PASSWORD);
        await page.getByRole('button', { name: /^(sign in|einloggen|log in)$/i }).click();
        await page.waitForTimeout(2000);
        await page.goto(process.env.ABYSS_TEST_BASE + '/web/#/configurationpage?name=AbyssTheme');
        await page.waitForSelector('#AbyssThemeConfig');
        await page.waitForSelector('#AbyssThemeConfig[data-ready="true"][data-busy="false"]');
        console.log('Configuration page mounted successfully in the real authenticated Jellyfin dashboard.');
        assert.equal(await page.locator('#MrBoneCrash-AbyssTheme-v1').getAttribute('media'), 'not all');
        const admin = page;
        const base = process.env.ABYSS_TEST_BASE;
        async function settled() {
            await admin.waitForSelector('#AbyssThemeConfig[data-ready="true"][data-busy="false"]');
        }
        await settled();
        for (const width of [1440, 390]) {
            await admin.setViewportSize({ width, height: 1000 });
            await admin.waitForTimeout(500);
            await admin.screenshot({ path: path.join(process.env.ABYSS_TEST_OUTPUT, 'config-before-' + width + '.png'), fullPage: true });
            await admin.getByText('Jellyfin Enhanced adaptation', { exact: true }).click();
            await admin.getByText('Media Bar Enhanced adaptation', { exact: true }).click();
            assert.equal(await admin.getByLabel('Jellyfin Enhanced adaptation', { exact: true }).isChecked(), true);
            assert.equal(await admin.getByLabel('Media Bar Enhanced adaptation', { exact: true }).isChecked(), true);
            await admin.getByRole('button', { name: 'Save settings', exact: true }).click();
            await settled();
            const styled = await admin.request.get(base + '/web/index.html');
            assert.ok((await styled.text()).includes('data-abyss-override="je"'));
            await admin.getByRole('button', { name: 'Restore previous theme', exact: true }).click();
            await settled();
            assert.equal(await admin.getByLabel('Automatically update Abyss', { exact: true }).isChecked(), false);
            await admin.getByRole('button', { name: 'Reset to bundled defaults', exact: true }).click();
            await settled();
            assert.equal(await admin.getByLabel('Jellyfin Enhanced adaptation', { exact: true }).isChecked(), false);
            assert.equal(await admin.getByLabel('Media Bar Enhanced adaptation', { exact: true }).isChecked(), false);
            await admin.getByRole('button', { name: 'Save settings', exact: true }).focus();
            await admin.keyboard.press('Enter');
            await settled();
            await admin.screenshot({ path: path.join(process.env.ABYSS_TEST_OUTPUT, 'config-' + width + '.png'), fullPage: true });
        }
        console.log('Configuration controls, save, rollback, reset and keyboard submission verified against real admin endpoints.');
        const authHeaders = { Authorization: 'MediaBrowser Token="' + process.env.ABYSS_TEST_TOKEN + '"' };
        async function api(route, method = 'GET', data) {
            const response = await admin.request.fetch(base + '/AbyssTheme/' + route, { method, headers: authHeaders, data });
            assert.ok(response.ok(), 'Abyss administration request succeeded');
            return response.status() === 204 ? null : response.json();
        }
        await admin.setViewportSize({ width: 1440, height: 1080 });
        await admin.locator('.abyss-header').scrollIntoViewIfNeeded();
        await admin.screenshot({ path: path.join(process.env.ABYSS_TEST_OUTPUT, 'config-overview.png') });
        assert.ok(await admin.evaluate(() => document.querySelector('#AbyssThemeConfig').scrollWidth <= document.querySelector('#AbyssThemeConfig').clientWidth + 1), 'configuration has no horizontal overflow');
        const currentRoute = admin.url();
        await admin.getByRole('button', { name: 'Appearance', exact: true }).click();
        assert.equal(admin.url(), currentRoute, 'section navigation does not hijack Jellyfin routing');
        const color = admin.getByLabel('Accent color', { exact: true });
        await color.evaluate(input => { input.value = '#66ddaa'; input.dispatchEvent(new Event('input', { bubbles: true })); });
        assert.equal(await admin.locator('#abyss-preview').evaluate(node => node.style.getPropertyValue('--preview-accent')), '#66ddaa');
        assert.ok((await admin.locator('#abyss-dirty').innerText()).includes('Unsaved changes'));
        await admin.getByRole('button', { name: 'Save settings', exact: true }).click();
        await settled();
        assert.equal((await api('status')).settings.accent, '#66ddaa');
        var configured = (await api('status')).settings;
        Object.assign(configured, { enabled: true, externalFonts: false, radius: 24, liteMode: true, reorderHome: true,
            spotlight: true, spotlightAutoRotate: false, spotlightResume: false, spotlightNextUp: false,
            spotlightMovies: true, spotlightSeries: false, spotlightLogo: false, spotlightOverview: false,
            spotlightHeight: 55, spotlightMobileHeight: 72, spotlightLimit: 2 });
        await api('settings', 'PUT', configured);
        await admin.goto(base + '/web/#/home');
        await admin.evaluate(() => window.__MrBoneCrashAbyssThemeV1.reload());
        await admin.waitForFunction(() => document.querySelector('#MrBoneCrash-AbyssTheme-v1').media === 'all');
        await admin.waitForSelector('#MrBoneCrash-AbyssSpotlightFrame');
        for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
            await admin.setViewportSize({ width, height });
            const element = await admin.$('#MrBoneCrash-AbyssSpotlightFrame');
            const spotlight = await element.contentFrame();
            await spotlight.waitForSelector('#title', { state: 'visible' });
            await spotlight.waitForFunction(() => Number(getComputedStyle(document.querySelector('#content')).opacity) >= .99 && Number(getComputedStyle(document.querySelector('#title')).opacity) >= .99);
            assert.ok(['Horizon', 'Afterglow'].includes((await spotlight.locator('#title').innerText()).trim()));
            assert.equal(await spotlight.locator('#plot').evaluate(node => getComputedStyle(node).display), 'none');
            assert.equal(await admin.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--abyss-radius').trim()), '24px');
            await admin.waitForFunction(() => window.__MrBoneCrashAbyssThemeV1.getStatus().homeOrder.includes('applied'));
            await admin.screenshot({ path: path.join(process.env.ABYSS_TEST_OUTPUT, 'spotlight-' + name + '.png') });
        }
        await admin.setViewportSize({ width: 1440, height: 1000 });
        await admin.emulateMedia({ reducedMotion: 'no-preference' });
        await api('settings', 'PUT', { ...configured, spotlightAutoRotate: true, spotlightInterval: 3 });
        await admin.evaluate(() => window.__MrBoneCrashAbyssThemeV1.reload());
        await admin.waitForSelector('#MrBoneCrash-AbyssSpotlightFrame');
        const rotatingElement = await admin.$('#MrBoneCrash-AbyssSpotlightFrame');
        await rotatingElement.scrollIntoViewIfNeeded();
        const rotating = await rotatingElement.contentFrame();
        await rotating.waitForFunction(() => document.querySelector('#title').textContent && Number(getComputedStyle(document.querySelector('#content')).opacity) >= .99);
        const originalTitle = await rotating.locator('#title').innerText();
        const bounds = await rotatingElement.boundingBox();
        await admin.mouse.move(bounds.x + 25, bounds.y + 25);
        await admin.waitForTimeout(4000);
        assert.equal(await rotating.locator('#title').innerText(), originalTitle, 'hover pauses automatic rotation');
        await admin.mouse.move(0, 0);
        await rotating.waitForFunction(prior => document.querySelector('#title').textContent !== prior && Number(getComputedStyle(document.querySelector('#content')).opacity) >= .99, originalTitle, { timeout: 12000 });
        await api('settings', 'PUT', configured);
        await admin.evaluate(() => window.__MrBoneCrashAbyssThemeV1.reload());
        await admin.waitForSelector('#MrBoneCrash-AbyssSpotlightFrame');
        const heroElement = await admin.$('#MrBoneCrash-AbyssSpotlightFrame');
        const hero = await heroElement.contentFrame();
        await hero.waitForSelector('#buttons .btn-info', { state: 'visible' });
        await hero.getByRole('link', { name: /View details for/ }).click();
        await admin.waitForFunction(() => location.hash.includes('/details?'));
        await admin.waitForSelector('#MrBoneCrash-AbyssSpotlightFrame', { state: 'detached' });
        assert.ok(await admin.locator('#MrBoneCrash-AbyssBackdrop').count() <= 1, 'at most one owned backdrop remains during navigation');
        await admin.waitForSelector('#MrBoneCrash-AbyssBackdrop', { state: 'attached' });
        assert.ok(await admin.locator('#MrBoneCrash-AbyssBackdrop').evaluate(node => node.style.backgroundImage.startsWith('url("blob:')), 'detail backdrop uses an owned authenticated blob');
        await admin.goto(base + '/web/#/home');
        await admin.waitForSelector('#MrBoneCrash-AbyssSpotlightFrame');
        await admin.evaluate(() => { document.documentElement.setAttribute('data-theme','light'); return window.__MrBoneCrashAbyssThemeV1.reload(); });
        assert.equal(await admin.locator('html').getAttribute('data-theme'), 'dark');
        await api('settings', 'PUT', { ...configured, enabled: false });
        await admin.evaluate(() => window.__MrBoneCrashAbyssThemeV1.reload());
        assert.equal(await admin.locator('html').getAttribute('data-theme'), 'light');
        assert.equal(await admin.locator('#MrBoneCrash-AbyssSpotlightFrame').count(), 0);
        assert.equal(await admin.locator('#MrBoneCrash-AbyssTheme-v1').getAttribute('media'), 'not all');
        await api('settings', 'PUT', configured);
        await admin.evaluate(() => window.__MrBoneCrashAbyssThemeV1.reload());
        console.log('Real Spotlight media, desktop/mobile layout, configured appearance, home ordering and navigation cleanup verified.');
        const restricted = await browser.newPage();
        await restricted.goto(base + '/web/index.html', { waitUntil: 'networkidle' });
        await restricted.locator('input[type="text"]').first().fill('abyss-viewer');
        await restricted.getByRole('button', { name: /^(sign in|einloggen|log in)$/i }).click();
        await restricted.waitForTimeout(2000);
        await restricted.goto(base + '/web/#/home');
        await restricted.waitForSelector('#MrBoneCrash-AbyssSpotlightFrame', { state: 'attached' });
        await restricted.waitForFunction(() => document.querySelector('#MrBoneCrash-AbyssSpotlight').style.display === 'none');
        assert.equal(await restricted.evaluate(() => window.__MrBoneCrashAbyssThemeV1.getContext().auth.userId.replace(/-/g, '')), process.env.ABYSS_TEST_VIEWER_ID.replace(/-/g, ''));
        await api('settings', 'PUT', { ...configured, spotlightEmpty: 'message' });
        await restricted.evaluate(() => window.__MrBoneCrashAbyssThemeV1.reload());
        await restricted.waitForFunction(() => document.querySelector('#MrBoneCrash-AbyssSpotlight')?.style.display === 'block');
        const emptyFrame = await (await restricted.$('#MrBoneCrash-AbyssSpotlightFrame')).contentFrame();
        assert.equal(await emptyFrame.locator('#empty').innerText(), 'Nothing to show');
        assert.equal(await emptyFrame.locator('#title').textContent(), '');
        await restricted.close();
        console.log('A restricted account sees an empty Spotlight instead of another user’s library.');
        await api('settings', 'PUT', { ...configured, dashboardStyle: 'full' });
        await admin.setViewportSize({ width: 1440, height: 1000 });
        await admin.goto(base + '/web/#/dashboard/plugins');
        await admin.evaluate(() => window.__MrBoneCrashAbyssThemeV1.reload());
        await admin.waitForFunction(() => window.__MrBoneCrashAbyssThemeV1.getStatus().dashboard.includes('overlap'));
        assert.equal(await admin.locator('#MrBoneCrash-AbyssTheme-v1').getAttribute('media'), 'not all');
        assert.equal(await admin.locator('html').getAttribute('data-mbc-abyss-dashboard'), 'safe');
        console.log('Experimental Full dashboard styling falls back to a usable safe palette.');
        await api('reset', 'POST');
        await admin.evaluate(() => window.__MrBoneCrashAbyssThemeV1.reload());
        const blocked = await browser.newPage();
        await blocked.route('**/AbyssTheme/client.js*', route => route.abort());
        await blocked.goto(base + '/web/index.html', { waitUntil: 'networkidle' });
        assert.equal(await blocked.locator('#MrBoneCrash-AbyssTheme-v1').getAttribute('media'), 'not all');
        assert.equal(await blocked.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--abyss-accent').trim()), '');
        await blocked.close();
        console.log('Theme resumes on normal navigation and remains inactive when its helper cannot load.');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
