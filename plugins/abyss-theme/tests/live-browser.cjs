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
        await page.waitForFunction(() => document.querySelector('#abyss-status').textContent.startsWith('Active revision:'));
        console.log('Configuration page mounted successfully in the real authenticated Jellyfin dashboard.');
        assert.equal(await page.locator('#MrBoneCrash-AbyssTheme-v1').getAttribute('media'), 'not all');
        const admin = page;
        const base = process.env.ABYSS_TEST_BASE;
        async function settled() {
            await admin.waitForFunction(() => document.querySelector('#abyss-status').textContent.startsWith('Active revision:') && !document.querySelector('#abyss-check').disabled);
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
            await admin.locator('summary').click();
            await admin.getByRole('button', { name: 'Restore previous theme', exact: true }).click();
            await settled();
            assert.equal(await admin.getByLabel('Automatically update Abyss CSS', { exact: true }).isChecked(), false);
            await admin.getByRole('button', { name: 'Reset to bundled defaults', exact: true }).click();
            await settled();
            assert.equal(await admin.getByLabel('Jellyfin Enhanced adaptation', { exact: true }).isChecked(), false);
            assert.equal(await admin.getByLabel('Media Bar Enhanced adaptation', { exact: true }).isChecked(), false);
            await admin.getByRole('button', { name: 'Save settings', exact: true }).focus();
            await admin.keyboard.press('Enter');
            await settled();
            await admin.screenshot({ path: path.join(process.env.ABYSS_TEST_OUTPUT, 'config-' + width + '.png'), fullPage: true });
            await admin.locator('summary').click();
        }
        console.log('Configuration controls, save, rollback, reset and keyboard submission verified against real admin endpoints.');
        await admin.goto(base + '/web/#/home');
        await admin.waitForFunction(() => document.querySelector('#MrBoneCrash-AbyssTheme-v1').media === 'all');
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
