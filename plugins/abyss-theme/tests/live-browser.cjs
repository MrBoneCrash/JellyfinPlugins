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
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
