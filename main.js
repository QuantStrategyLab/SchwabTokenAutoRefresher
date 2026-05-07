const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);

const axios = require('axios');
const { TOTP } = require('otpauth');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const path = require('path');
const fs = require('fs');
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
    TWO_FA: 30000,
    SCREENSHOT: 10000,
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

function summarizeUrl(value) {
    try {
        const url = new URL(value);
        return `${url.origin}${url.pathname}`;
    } catch (e) {
        return String(value).slice(0, 160);
    }
}

function sanitizeError(value) {
    return String(value ?? '').replace(/https?:\/\/[^\s"')]+/g, match => summarizeUrl(match));
}

function redactKnownSecrets(value) {
    const secrets = [USERNAME, PASSWORD, TOTP_SECRET, APP_KEY, APP_SECRET]
        .filter(secret => typeof secret === 'string' && secret.length >= 4)
        .sort((a, b) => b.length - a.length);

    let output = String(value ?? '');
    secrets.forEach((secret, index) => {
        output = output.split(secret).join(`[REDACTED_${index + 1}]`);
    });
    return output;
}

function sanitizeLogValue(value, maxLength = 1000) {
    return redactKnownSecrets(sanitizeError(value))
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);
}

function isSchwabUrl(value) {
    try {
        const { hostname } = new URL(value);
        const host = hostname.toLowerCase();
        return host === 'schwab.com' ||
            host.endsWith('.schwab.com') ||
            host === 'schwabapi.com' ||
            host.endsWith('.schwabapi.com');
    } catch (e) {
        return false;
    }
}

function attachPageDiagnostics(page) {
    let networkLogCount = 0;
    const maxNetworkLogs = 80;
    const logNetworkEvent = message => {
        if (networkLogCount < maxNetworkLogs) {
            console.log(message);
        } else if (networkLogCount === maxNetworkLogs) {
            console.log('Further Schwab network diagnostic events suppressed.');
        }
        networkLogCount += 1;
    };

    page.on('console', msg => {
        const type = msg.type();
        if (type !== 'error' && type !== 'warning') {
            return;
        }
        console.log(`Browser console ${type}: ${sanitizeLogValue(msg.text())}`);
    });

    page.on('pageerror', error => {
        console.log(`Browser page error: ${sanitizeLogValue(error.message)}`);
    });

    page.on('requestfailed', request => {
        const requestUrl = request.url();
        if (!isSchwabUrl(requestUrl)) {
            return;
        }
        logNetworkEvent(`Schwab request failed: ${JSON.stringify({
            method: request.method(),
            url: summarizeUrl(requestUrl),
            failure: sanitizeLogValue(request.failure()?.errorText || 'unknown', 240),
        })}`);
    });

    page.on('response', response => {
        const responseUrl = response.url();
        const status = response.status();
        if (!isSchwabUrl(responseUrl) || status < 400) {
            return;
        }
        logNetworkEvent(`Schwab response ${status}: ${JSON.stringify({
            url: summarizeUrl(responseUrl),
            statusText: sanitizeLogValue(response.statusText(), 160),
        })}`);
    });
}

async function collectPageDiagnostics(page, filename) {
    const title = await page.title().catch(() => '');
    const bodyText = await page.locator('body').innerText({ timeout: 1500 }).catch(error => `body text unavailable: ${error.message}`);
    const inputs = await page.locator('input').evaluateAll(elements => elements.slice(0, 40).map(element => ({
        type: element.getAttribute('type') || null,
        id: element.id || null,
        name: element.getAttribute('name') || null,
        ariaLabel: element.getAttribute('aria-label') || null,
        placeholder: element.getAttribute('placeholder') || null,
        disabled: element.disabled,
        visibleValueLength: element.value ? element.value.length : 0,
    }))).catch(error => [{ error: error.message }]);
    const buttons = await page.locator('button').evaluateAll(elements => elements.slice(0, 40).map(element => ({
        id: element.id || null,
        name: element.getAttribute('name') || null,
        ariaLabel: element.getAttribute('aria-label') || null,
        text: (element.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80),
        disabled: element.disabled,
    }))).catch(error => [{ error: error.message }]);
    const diagnostics = {
        url: summarizeUrl(page.url()),
        title: sanitizeLogValue(title, 240),
        frames: page.frames().map(frame => ({
            name: sanitizeLogValue(frame.name() || '', 120) || null,
            url: summarizeUrl(frame.url()),
        })).slice(0, 20),
        bodyTextLength: String(bodyText ?? '').length,
        bodyTextPreview: sanitizeLogValue(bodyText, 1200),
        inputs: JSON.parse(redactKnownSecrets(JSON.stringify(inputs))),
        buttons: JSON.parse(redactKnownSecrets(JSON.stringify(buttons))),
    };

    fs.writeFileSync(filename, `${JSON.stringify(diagnostics, null, 2)}\n`);
    console.log(`Saved page diagnostics: ${JSON.stringify({
        file: filename,
        url: diagnostics.url,
        title: diagnostics.title || null,
        frameCount: diagnostics.frames.length,
        bodyTextLength: diagnostics.bodyTextLength,
        bodyTextPreview: diagnostics.bodyTextPreview.slice(0, 240),
    })}`);
}

async function saveScreenshot(page, filename) {
    try {
        await page.screenshot({ path: filename, timeout: TIMEOUTS.SCREENSHOT });
    } catch (error) {
        console.log(`Could not capture screenshot ${filename}: ${sanitizeError(error.message)}`);
    }
}

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
            console.log(`Current auth page state: ${JSON.stringify({ url: summarizeUrl(page.url()), title: title || null })}`);
            await saveScreenshot(page, `auth_page_attempt_${attempt}.png`);

            if (attempt === AUTH_NAVIGATION_MAX_ATTEMPTS) {
                throw new Error(`Login form did not become visible after ${AUTH_NAVIGATION_MAX_ATTEMPTS} attempts: ${sanitizeError(e.message)}`);
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
    attachPageDiagnostics(page);
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
            await saveScreenshot(page, 'fatal_2fa_missing.png');
            await collectPageDiagnostics(page, 'fatal_2fa_missing_diagnostics.json');
            throw new Error(`2FA step failed: ${sanitizeError(e.message)}`);
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
        console.error("Failure:", sanitizeError(err.message));
        if (err.stack) console.error("Stack:", sanitizeError(err.stack));
        await saveScreenshot(page, 'last_error_state.png');
        process.exit(1);
    } finally {
        await context.close();
    }
}
main();
