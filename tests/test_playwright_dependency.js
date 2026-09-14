const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();

chromium.use(stealth);

(async () => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'schwab-playwright-smoke-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
        channel: 'chrome',
        headless: true,
    });
    try {
        const page = await context.newPage();
        await page.setContent(`
            <button id="continue" type="button">Continue</button>
            <output id="status">waiting</output>
            <script>
                document.querySelector('#continue').addEventListener('click', () => {
                    document.querySelector('#status').textContent = 'continued';
                });
            </script>
        `);

        await page.getByRole('button', { name: 'Continue' }).click();
        await assert.doesNotReject(() => page.getByText('continued').waitFor());
        assert.strictEqual(await page.locator('#status').textContent(), 'continued');
    } finally {
        await context.close();
        fs.rmSync(userDataDir, { recursive: true, force: true });
    }

    console.log('playwright-extra Chrome channel smoke passed');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
