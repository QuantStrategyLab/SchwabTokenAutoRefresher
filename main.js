const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);

const axios = require('axios');
const { TOTP } = require('otpauth');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const path = require('path');
const {
    buildAxiosProxyConfig,
    buildPlaywrightProxy,
    maskProxyForLogs,
    resolveProxyUrl,
} = require('./lib/proxy');
const {
    extractAuthorizationCodeFromUrl,
    summarizeAuthorizationCode,
} = require('./lib/oauth');

// --- Configuration ---
const USERNAME = process.env.SCHWAB_USERNAME;
const PASSWORD = process.env.SCHWAB_PASSWORD;
const TOTP_SECRET = process.env.SCHWAB_TOTP_SECRET;
const APP_KEY = process.env.SCHWAB_API_KEY;
const APP_SECRET = process.env.SCHWAB_APP_SECRET;
const PROJECT_ID = process.env.GCP_PROJECT_ID;
const SECRET_ID = process.env.GCP_SECRET_ID;
const REDIRECT_URI = process.env.SCHWAB_REDIRECT_URI;
const PROXY_URL = resolveProxyUrl(process.env);

// --- Timing constants ---
const TIMEOUTS = {
    AUTH_PAGE: 60000,
    LOGIN_FORM: 30000,
    TWO_FA: 20000,
    BUTTON_CLICK: 10000,
    CHECKBOX: 5000,
    CODE_POLL_INTERVAL: 1000,
    CODE_POLL_MAX_ATTEMPTS: 30,
};
const DELAYS = {
    CREDENTIAL_ENTRY: { min: 3000, max: 5000 },
    OAUTH_CONSENT: { min: 8000, max: 12000 },
    BETWEEN_CLICKS: { min: 3000, max: 5000 },
};
const VIEWPORT = { width: 1280, height: 800 };
const TOTP_PERIOD_SECONDS = 30;
const TOTP_MIN_VALIDITY_SECONDS = 20;
const TWO_FA_MAX_ATTEMPTS = 2;
const AUTH_NAVIGATION_MAX_ATTEMPTS = 3;

// --- Helpers ---
const humanDelay = (min = 2000, max = 5000) =>
    new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (max - min) + min)));

function validateEnv() {
    const required = [
        'SCHWAB_USERNAME', 'SCHWAB_PASSWORD', 'SCHWAB_TOTP_SECRET',
        'SCHWAB_API_KEY', 'SCHWAB_APP_SECRET',
        'GCP_PROJECT_ID', 'GCP_SECRET_ID', 'SCHWAB_REDIRECT_URI',
    ];
    const missing = required.filter(v => !process.env[v]);
    if (missing.length > 0) {
        throw new Error(`Missing required env vars: ${missing.join(', ')}`);
    }
}

/**
 * Smart-fallback click helper with configurable timeout.
 */
async function smartClick(page, targetName, selector = null, timeout = TIMEOUTS.BUTTON_CLICK) {
    try {
        console.log(`Attempting to find target button: ${targetName}`);
        let target = selector ? page.locator(selector) : page.getByRole('button', { name: targetName, exact: false });
        await target.waitFor({ state: 'visible', timeout });
        await target.click({ delay: Math.random() * 200 + 100 });
        console.log(`Clicked: ${targetName}`);
        return true;
    } catch (e) {
        const backupLabels = ['Accept', 'Continue', 'Done', 'Agree'];
        for (const label of backupLabels) {
            const backupBtn = page.getByRole('button', { name: label, exact: false }).first();
            if (await backupBtn.isVisible()) {
                await backupBtn.click({ delay: Math.random() * 200 + 100 });
                return true;
            }
        }
        return false;
    }
}

async function waitForFreshTotpWindow(minRemainingSeconds = TOTP_MIN_VALIDITY_SECONDS) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const secondsIntoWindow = nowSeconds % TOTP_PERIOD_SECONDS;
    const remainingSeconds = TOTP_PERIOD_SECONDS - secondsIntoWindow;
    if (remainingSeconds < minRemainingSeconds) {
        const waitMs = (remainingSeconds + 1) * 1000;
        console.log(`Waiting ${waitMs}ms for a fresh TOTP window...`);
        await humanDelay(waitMs, waitMs + 250);
    }
}

async function navigateToLoginForm(page, authUrl) {
    const loginInput = page.getByRole('textbox', { name: /Login ID/i });
    const passwordInput = page.getByRole('textbox', { name: /Password/i });

    for (let attempt = 1; attempt <= AUTH_NAVIGATION_MAX_ATTEMPTS; attempt += 1) {
        console.log(`1. Navigating to auth page, attempt ${attempt}/${AUTH_NAVIGATION_MAX_ATTEMPTS}...`);
        await page.goto(authUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.AUTH_PAGE });
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
        await humanDelay(DELAYS.CREDENTIAL_ENTRY.min, DELAYS.CREDENTIAL_ENTRY.max);

        try {
            await loginInput.waitFor({ state: 'visible', timeout: TIMEOUTS.LOGIN_FORM });
            await passwordInput.waitFor({ state: 'visible', timeout: TIMEOUTS.LOGIN_FORM });
            return { loginInput, passwordInput };
        } catch (e) {
            const title = await page.title().catch(() => '');
            console.log(`Login form was not visible on attempt ${attempt}/${AUTH_NAVIGATION_MAX_ATTEMPTS}.`);
            console.log(`Current auth page state: ${JSON.stringify({ url: page.url(), title: title || null })}`);
            await page.screenshot({ path: `auth_page_attempt_${attempt}.png` }).catch(() => {});

            if (attempt === AUTH_NAVIGATION_MAX_ATTEMPTS) {
                throw new Error(`Login form did not become visible after ${AUTH_NAVIGATION_MAX_ATTEMPTS} attempts: ${e.message}`);
            }

            await humanDelay(4000, 7000);
        }
    }

    throw new Error('Login form navigation attempts were exhausted.');
}

async function submitTwoFactorCode(page) {
    const codeInput = page.getByRole('spinbutton', { name: 'Security Code' });
    await codeInput.waitFor({ timeout: TIMEOUTS.TWO_FA });

    const continueButton = page.getByRole('button', { name: 'Continue' });
    const totp = new TOTP({ secret: TOTP_SECRET.replace(/\s/g, "") });

    for (let attempt = 1; attempt <= TWO_FA_MAX_ATTEMPTS; attempt += 1) {
        await waitForFreshTotpWindow();
        const token = totp.generate();
        console.log(`Submitting 2FA code, attempt ${attempt}/${TWO_FA_MAX_ATTEMPTS}...`);
        await codeInput.fill('');
        await codeInput.fill(token);
        await continueButton.click();
        await page.waitForTimeout(3000);

        const invalidCodeMessage = page.getByText('Enter a valid 6-digit security code.');
        const loginErrorBanner = page.getByText(/We cant log you in right now/i);
        const stillOnCodePage =
            (await codeInput.isVisible().catch(() => false)) &&
            ((await invalidCodeMessage.isVisible().catch(() => false)) ||
                (await loginErrorBanner.isVisible().catch(() => false)));

        if (!stillOnCodePage) {
            return;
        }

        if (attempt === TWO_FA_MAX_ATTEMPTS) {
            throw new Error('2FA code was rejected after retry.');
        }

        console.log('2FA code was rejected, retrying with a fresh TOTP code...');
    }
}

async function updateAndCleanupSecrets(tokenData) {
    console.log("Initializing GCP Secret Manager...");
    let options = { projectId: PROJECT_ID };
    if (process.env.GCP_SA_KEY) {
        try {
            options.credentials = JSON.parse(process.env.GCP_SA_KEY);
        } catch (e) {
            throw new Error(`GCP_SA_KEY is not valid JSON: ${e.message}`);
        }
    }
    const client = new SecretManagerServiceClient(options);
    const parent = `projects/${PROJECT_ID}/secrets/${SECRET_ID}`;
    const payload = Buffer.from(JSON.stringify(tokenData), 'utf8');
    const [newVersion] = await client.addSecretVersion({ parent, payload: { data: payload } });
    console.log(`Token Version ${newVersion.name.split('/').pop()} synced.`);
}

async function exchangeCodeForToken(code) {
    const credentials = Buffer.from(`${APP_KEY}:${APP_SECRET}`).toString('base64');
    const params = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI });
    console.log(`Submitting token exchange with code summary: ${JSON.stringify(summarizeAuthorizationCode(code))}`);
    try {
        const response = await axios.post('https://api.schwabapi.com/v1/oauth/token', params.toString(), {
            headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 30000,
            ...buildAxiosProxyConfig(PROXY_URL),
        });
        const data = response.data;
        if (!data.access_token || !data.refresh_token) {
            throw new Error(`Token response missing required fields: ${JSON.stringify(Object.keys(data))}`);
        }
        return data;
    } catch (err) {
        if (err.response) {
            const responseHeaders = err.response.headers || {};
            const responseData = typeof err.response.data === 'string'
                ? err.response.data
                : JSON.stringify(err.response.data);
            throw new Error(`Token exchange failed: ${err.response.status} ${JSON.stringify({
                body: responseData.slice(0, 300),
                bodyLength: responseData.length,
                headers: {
                    contentType: responseHeaders['content-type'] || null,
                    proxyAgent: responseHeaders['proxy-agent'] || null,
                    server: responseHeaders.server || null,
                    via: responseHeaders.via || null,
                },
            })}`);
        }
        throw new Error(`Token exchange network error: ${err.message}`);
    }
}

async function main() {
    validateEnv();
    console.log("Starting Chrome OAuth task on GitHub Hosted Runner...");
    if (PROXY_URL) {
        console.log(`Using outbound proxy for Schwab traffic: ${maskProxyForLogs(PROXY_URL)}`);
    }
    const authUrl = `https://api.schwabapi.com/v1/oauth/authorize?client_id=${APP_KEY}&redirect_uri=${REDIRECT_URI}`;
    const userDataDir = path.resolve(__dirname, 'schwab-local-session');

    const context = await chromium.launchPersistentContext(userDataDir, {
        channel: 'chrome',
        headless: false,
        args: [
            '--no-sandbox',
            '--disable-blink-features=AutomationControlled',
            `--window-size=${VIEWPORT.width},${VIEWPORT.height}`
        ],
        viewport: VIEWPORT,
        ...(PROXY_URL ? { proxy: buildPlaywrightProxy(PROXY_URL) } : {}),
    });

    const page = context.pages()[0] || await context.newPage();
    let interceptedCode = null;

    page.on('request', r => {
        const requestUrl = r.url();
        const extractedCode = extractAuthorizationCodeFromUrl(requestUrl);
        if (!extractedCode) {
            return;
        }

        interceptedCode = extractedCode;
        const parsedUrl = new URL(requestUrl);
        console.log(`Captured redirect request: ${JSON.stringify({
            origin: parsedUrl.origin,
            path: parsedUrl.pathname,
            code: summarizeAuthorizationCode(extractedCode),
        })}`);
    });

    try {
        const { loginInput, passwordInput } = await navigateToLoginForm(page, authUrl);
        console.log("2. Entering credentials...");
        await loginInput.fill(USERNAME);
        await passwordInput.fill(PASSWORD);
        await page.getByRole('button', { name: 'Log in' }).click();

        console.log("3. Processing 2FA code...");
        try {
            await submitTwoFactorCode(page);
        } catch (e) {
            await page.screenshot({ path: 'fatal_2fa_missing.png' });
            throw new Error(`2FA step failed: ${e.message}`);
        }

        console.log("4. Authorizing...");
        await humanDelay(DELAYS.OAUTH_CONSENT.min, DELAYS.OAUTH_CONSENT.max);

        try {
            const cb = page.getByRole('checkbox', { name: /By checking this box/i });
            if (await cb.isVisible({ timeout: TIMEOUTS.CHECKBOX })) { await cb.check(); }
        } catch (e) {
            console.log("Checkbox not found, skipping...");
        }

        await smartClick(page, 'Continue', '#submit-btn');
        await humanDelay(DELAYS.BETWEEN_CLICKS.min, DELAYS.BETWEEN_CLICKS.max);
        await smartClick(page, 'Accept');
        await humanDelay(DELAYS.BETWEEN_CLICKS.min, DELAYS.BETWEEN_CLICKS.max);
        await smartClick(page, 'Continue');
        await humanDelay(DELAYS.BETWEEN_CLICKS.min, DELAYS.BETWEEN_CLICKS.max);
        await smartClick(page, 'Done');

        console.log("5. Intercepting Code...");
        for (let i = 0; i < TIMEOUTS.CODE_POLL_MAX_ATTEMPTS && !interceptedCode; i++) {
            await page.waitForTimeout(TIMEOUTS.CODE_POLL_INTERVAL);
        }
        if (!interceptedCode) throw new Error("Code interception failed after polling.");

        const tokenDict = await exchangeCodeForToken(interceptedCode);
        tokenDict.expires_at = Math.floor(Date.now() / 1000) + tokenDict.expires_in;
        await updateAndCleanupSecrets({ creation_timestamp: Math.floor(Date.now() / 1000), token: tokenDict });
        console.log("SUCCESS! Token refreshed and synced.");

    } catch (err) {
        console.error("Failure:", err.message);
        if (err.stack) console.error("Stack:", err.stack);
        await page.screenshot({ path: 'last_error_state.png' });
        process.exit(1);
    } finally {
        await context.close();
    }
}
main();
