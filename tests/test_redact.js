const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
    redactKnownSecrets,
    redactSecrets,
} = require('../lib/redact');

// Synthetic secrets only: these values never existed outside this test and
// are never printed. Each assertion failure reports "leaked a synthetic
// secret" instead of the value itself. Secret-shaped values are assembled
// from segments at runtime so secret scanners do not flag the file.
const SYNTHETIC_PASSWORD = ['SyntheticP', '@', 'ssw0rd', '-', '98f2'].join('');
const SYNTHETIC_OTP = '482913';
const SYNTHETIC_TOTP_SEED = ['JBSWY3', 'DPEHPK', '3PXP'].join('');
// Assembled from segments so the file contains no JWT-shaped literal that a
// secret scanner could mistake for a real credential.
const SYNTHETIC_ACCESS_TOKEN = [
    'eyJhbGciOiJIUzI1NiJ9',
    'eyJzdWIiOiJzeW50aGV0aWMiLCJleHAiOjQ4MjA5MzEwMDB9',
    'c3ludGhldGljLXNpZ25hdHVyZS1mb3ItdGVzdHM',
].join('.');
const SYNTHETIC_OPAQUE_TOKEN = ['opaqueSyntheticToken',
    '4b1d7c3e', '9f2a8b6d', '5c4e3f2a', '1b0c9d8e'].join('_');

function assertNotContains(output, secret, label) {
    assert.ok(!String(output).includes(secret), `leaked a synthetic ${label}`);
}

// --- lib/redact unit checks ---

const passwordFillError = `page.fill: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('input[name="password"]')
    - locator resolved to <input name="password" type="password" value="${SYNTHETIC_PASSWORD}"/>
    - fill("${SYNTHETIC_PASSWORD}")
  - attempting fill action
    2 × waiting for element to be visible, enabled and editable
      - element is not editable`;

{
    const out = redactSecrets(passwordFillError, [SYNTHETIC_PASSWORD]);
    assertNotContains(out, SYNTHETIC_PASSWORD, 'password');
    assert.ok(out.includes('[REDACTED'), 'expected a redaction marker');
    assert.ok(out.includes('element is not editable'), 'non-secret text must survive');
}

{
    const out = redactSecrets(`locator.fill: element is not editable\n  - fill("${SYNTHETIC_OTP}")`, []);
    assertNotContains(out, SYNTHETIC_OTP, 'OTP');
    assert.ok(out.includes('fill([REDACTED])'));
}

{
    const out = redactSecrets(
        `page.fill: strict violation\n  - fill('input[name="password"]', '${SYNTHETIC_PASSWORD}')`,
        [],
    );
    assertNotContains(out, SYNTHETIC_PASSWORD, 'password');
}

{
    const out = redactSecrets(
        `  - pressSequentially("input", "${SYNTHETIC_PASSWORD}")\n  - type("#code", "${SYNTHETIC_OTP}")`,
        [],
    );
    assertNotContains(out, SYNTHETIC_PASSWORD, 'password');
    assertNotContains(out, SYNTHETIC_OTP, 'OTP');
}

{
    // Unquoted numeric arguments (a code rendered without quotes) must be
    // redacted too.
    const out = redactSecrets(`locator.fill: element is not editable\n  - fill(${SYNTHETIC_OTP})`, []);
    assertNotContains(out, SYNTHETIC_OTP, 'OTP');
    assert.ok(out.includes('fill([REDACTED])'));
}

{
    // Resolved-element previews carry typed values in attributes and text
    // content; the whole preview line must be dropped.
    const out = redactSecrets(`locator.fill: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('#password')
    - locator resolved to <input id="password" type="password" value="${SYNTHETIC_PASSWORD}"/>
    - fill("${SYNTHETIC_PASSWORD}")
  - attempting fill action`, []);
    assertNotContains(out, SYNTHETIC_PASSWORD, 'password');
    assert.ok(out.includes('locator preview [REDACTED]'));
    assert.ok(out.includes('attempting fill action'), 'non-secret text must survive');
}

{
    const out = redactSecrets(`    - locator resolved to <textarea id="note">${SYNTHETIC_PASSWORD}</textarea>`, []);
    assertNotContains(out, SYNTHETIC_PASSWORD, 'password');
    assert.ok(out.includes('locator preview [REDACTED]'));
}

{
    // Strict-mode listings quote each matched element preview on its own line.
    const out = redactSecrets(`    1) <input value="${SYNTHETIC_PASSWORD}"/> aka getByRole('textbox').first()`, []);
    assertNotContains(out, SYNTHETIC_PASSWORD, 'password');
    assert.ok(out.includes('locator preview [REDACTED]'));
}

{
    // Values containing angle brackets must not break preview redaction.
    const hostilePassword = ['pa<', 'ss>w0rd'].join('');
    const out = redactSecrets(`  - locator resolved to <input value="${hostilePassword}"/> tail`, []);
    assertNotContains(out, hostilePassword, 'password');
    assert.ok(!out.includes('tail'), 'the preview line must be dropped entirely');
}

{
    // Values containing parens or quotes must not survive redaction.
    const hostilePassword = 'pa(")ss';
    const out = redactSecrets(`  - fill("${hostilePassword}") tail`, []);
    assertNotContains(out, hostilePassword, 'password');
    assert.ok(out.endsWith('fill([REDACTED])'));
}

{
    const out = redactKnownSecrets(`seed echo: ${SYNTHETIC_TOTP_SEED}`, [SYNTHETIC_TOTP_SEED]);
    assertNotContains(out, SYNTHETIC_TOTP_SEED, 'TOTP seed');
}

{
    const out = redactSecrets(`access_token=${SYNTHETIC_ACCESS_TOKEN}`, []);
    assertNotContains(out, SYNTHETIC_ACCESS_TOKEN, 'access token');
    assert.ok(out.includes('[REDACTED'));
}

{
    const out = redactSecrets(`refresh_token=${SYNTHETIC_OPAQUE_TOKEN}`, []);
    assertNotContains(out, SYNTHETIC_OPAQUE_TOKEN, 'refresh token');
    assert.ok(out.includes('[REDACTED'));
}

{
    const out = redactSecrets('Authorization: Bearer abcDEF1234567890', []);
    assertNotContains(out, 'abcDEF1234567890', 'bearer credential');
    assert.ok(out.includes('Bearer [REDACTED]'));
}

{
    const out = redactSecrets('net::ERR_CONNECTION_REFUSED', []);
    assert.strictEqual(out, 'net::ERR_CONNECTION_REFUSED');
}

{
    assert.strictEqual(redactSecrets(null, []), '');
    assert.strictEqual(redactSecrets(undefined, []), '');
}

// --- end-to-end check of main.js exception logging ---

// Loads main.js in a VM with synthetic env secrets, stub browser/network
// modules and a capturing console. The real CLI bootstrap runs (require.main
// === module) so the final "Failure:" log path is exercised; process.exit is
// replaced with a recorder.
function loadSyntheticMain(scenario = {}) {
    const captured = [];
    const counts = { fills: 0 };
    let redirect;
    let exitCode = null;
    let resolveExit;
    const exitPromise = new Promise(resolve => { resolveExit = resolve; });
    const lastThrownMessages = {};
    const failure = message => new Error(message);
    const input = kind => ({
        first() { return this; },
        async waitFor() {},
        async fill() {
            if (kind === 'login' || kind === 'password') counts.fills += 1;
            if (kind === 'password' && scenario.passwordFillError) {
                lastThrownMessages.password = scenario.passwordFillError;
                throw failure(scenario.passwordFillError);
            }
            if (kind === 'code' && scenario.codeFillError) {
                lastThrownMessages.code = scenario.codeFillError;
                throw failure(scenario.codeFillError);
            }
        },
        async isVisible() { return false; },
    });
    const login = input('login');
    const password = input('password');
    const code = input('code');
    const button = name => ({ first() { return this; }, async waitFor() {}, async click() {} });
    const page = {
        on(event, callback) { if (event === 'request') redirect = callback; },
        async goto() {},
        async waitForLoadState() {}, async waitForTimeout() {},
        async title() { return ''; }, url() { return 'https://example.invalid'; },
        frames() { return []; },
        getByRole(role, options) {
            if (role === 'textbox') return /Login/.test(options.name.source) ? login : password;
            if (role === 'spinbutton') return code;
            return button(options.name);
        },
        getByText() { return { async isVisible() { return false; } }; },
        locator(selector) {
            if (selector === 'body') return { async innerText() { return ''; } };
            return code;
        },
    };
    const forbidden = () => { throw new Error('FORBIDDEN_REAL_OPERATION'); };
    const contextModule = { exports: {} };
    const fakeRequire = name => {
        if (name === 'playwright-extra') return { chromium: {
            use() {}, async launchPersistentContext() {
                return { pages: () => [page], async close() {} };
            },
        } };
        if (name === 'puppeteer-extra-plugin-stealth') return () => ({});
        if (name === 'axios') return {
            async post() {
                if (scenario.tokenResponseError) {
                    const err = failure('token endpoint rejected the exchange');
                    err.response = {
                        status: 400,
                        headers: {},
                        data: scenario.responseData ?? {
                            error: 'invalid_grant',
                            error_description: ['code echoed ', SYNTHETIC_ACCESS_TOKEN].join(''),
                        },
                    };
                    throw err;
                }
                if (scenario.tokenExchangeSucceeds) {
                    return {
                        data: {
                            access_token: SYNTHETIC_ACCESS_TOKEN,
                            refresh_token: SYNTHETIC_OPAQUE_TOKEN,
                            expires_in: 1800,
                        },
                    };
                }
                const message = `token endpoint returned an error with access_token=${SYNTHETIC_ACCESS_TOKEN}`;
                lastThrownMessages.token = message;
                throw failure(message);
            },
        };
        if (name === 'otpauth') return { TOTP: class { generate() { return SYNTHETIC_OTP; } } };
        if (name === '@google-cloud/secret-manager') return { SecretManagerServiceClient: forbidden };
        if (name === 'path') return path;
        if (name === 'fs') return { writeFileSync: forbidden };
        if (name === './lib/auth_retry') return require('../lib/auth_retry');
        if (name === './lib/proxy') return {
            resolveProxyUrl: () => null, buildPlaywrightProxy: () => ({}),
            buildAxiosProxyConfig: () => ({}), maskProxyForLogs: () => 'synthetic-proxy',
        };
        if (name === './lib/oauth') return require('../lib/oauth');
        if (name === './lib/redact') return require('../lib/redact');
        throw new Error(`UNEXPECTED_MODULE: ${name}`);
    };
    fakeRequire.main = contextModule;
    const context = vm.createContext({
        require: fakeRequire, module: contextModule, __dirname: '/synthetic', URL, URLSearchParams, Buffer,
        console: {
            log: (...args) => captured.push(args.map(String).join(' ')),
            error: (...args) => captured.push(args.map(String).join(' ')),
        },
        setTimeout(callback) { callback(); },
        process: {
            env: {
                SCHWAB_USERNAME: 'synthetic-user-9f2a',
                SCHWAB_PASSWORD: scenario.envPassword || SYNTHETIC_PASSWORD,
                SCHWAB_TOTP_SECRET: SYNTHETIC_TOTP_SEED,
                SCHWAB_API_KEY: 'demo-x',
                SCHWAB_APP_SECRET: 'demo-s',
                GCP_PROJECT_ID: 'synthetic-project',
                GCP_SECRET_ID: 'synthetic-secret-id',
                SCHWAB_REDIRECT_URI: 'https://127.0.0.1:8182/callback',
                GCP_SA_KEY: scenario.gcpSaKey || undefined,
            },
            exit(code) { exitCode = code; resolveExit(); },
        },
    });
    const source = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
    vm.runInContext(source, context);
    context.syntheticConsent = async () =>
        redirect({ url: () => 'https://example.invalid/callback?code=synthetic-code' });
    vm.runInContext(`
        saveScreenshot = async () => {};
        collectPageDiagnostics = async () => ({ title: '', bodyTextPreview: '' });
        waitForFreshTotpWindow = async () => {};
        smartClick = syntheticConsent;
    `, context);
    return {
        counts,
        capturedText: () => captured.join('\n'),
        exitPromise,
        exitCode: () => exitCode,
        main: vm.runInContext('main', context),
        sanitizeError: vm.runInContext('sanitizeError', context),
        sanitizeLogValue: vm.runInContext('sanitizeLogValue', context),
        lastThrownMessages,
    };
}

async function awaitExit(run) {
    const exited = await Promise.race([
        run.exitPromise.then(() => true),
        new Promise(resolve => setTimeout(() => resolve(false), 5000)),
    ]);
    assert.ok(exited, 'main must reach process.exit');
    assert.strictEqual(run.exitCode(), 1, 'failure flow must exit non-zero');
}

(async () => {
    const probe = loadSyntheticMain();
    await awaitExit(probe);

    const sanitized = probe.sanitizeError(passwordFillError);
    assertNotContains(sanitized, SYNTHETIC_PASSWORD, 'password');
    assert.ok(sanitized.includes('[REDACTED'));

    const sanitizedOtp = probe.sanitizeError(`  - fill("${SYNTHETIC_OTP}")`);
    assertNotContains(sanitizedOtp, SYNTHETIC_OTP, 'OTP');

    const sanitizedLog = probe.sanitizeLogValue(`username echo synthetic-user-9f2a and ${SYNTHETIC_TOTP_SEED}`, 200);
    assertNotContains(sanitizedLog, 'synthetic-user-9f2a', 'username');
    assertNotContains(sanitizedLog, SYNTHETIC_TOTP_SEED, 'TOTP seed');

    // Password fill failure: the raw Playwright error carries the password in
    // its call log, the logged output must not.
    const passwordRun = loadSyntheticMain({ passwordFillError: passwordFillError });
    await awaitExit(passwordRun);
    assert.ok(passwordRun.lastThrownMessages.password.includes(SYNTHETIC_PASSWORD),
        'scenario must be leak-shaped before sanitization');
    assert.strictEqual(passwordRun.counts.fills, 2);
    assertNotContains(passwordRun.capturedText(), SYNTHETIC_PASSWORD, 'password');
    assert.ok(passwordRun.capturedText().includes('[REDACTED'));

    // OTP fill failure: the raw Playwright error carries the OTP in its call
    // log, the logged output must not.
    const otpRun = loadSyntheticMain({
        codeFillError: `locator.fill: element is not editable\n  - fill("${SYNTHETIC_OTP}")`,
    });
    await awaitExit(otpRun);
    assert.ok(otpRun.lastThrownMessages.code.includes(SYNTHETIC_OTP),
        'scenario must be leak-shaped before sanitization');
    assertNotContains(otpRun.capturedText(), SYNTHETIC_OTP, 'OTP');
    assert.ok(otpRun.capturedText().includes('[REDACTED'));

    // Token exchange failure echoing the access token: the logged output must
    // not contain it.
    const tokenRun = loadSyntheticMain({});
    await awaitExit(tokenRun);
    assert.ok(tokenRun.lastThrownMessages.token.includes(SYNTHETIC_ACCESS_TOKEN),
        'scenario must be leak-shaped before sanitization');
    assertNotContains(tokenRun.capturedText(), SYNTHETIC_ACCESS_TOKEN, 'access token');
    assert.ok(tokenRun.capturedText().includes('[REDACTED'));

    // Token endpoint error response echoing the access token in the body:
    // the response body path must be sanitized before it is logged.
    const responseRun = loadSyntheticMain({ tokenResponseError: true });
    await awaitExit(responseRun);
    assertNotContains(responseRun.capturedText(), SYNTHETIC_ACCESS_TOKEN, 'access token');
    assert.ok(responseRun.capturedText().includes('[REDACTED'));

    // A token crossing the old 300-character preview boundary must not leave
    // a short prefix behind when the response body is logged.
    const tokenPrefix = SYNTHETIC_OPAQUE_TOKEN.slice(0, 10);
    const boundaryRun = loadSyntheticMain({
        tokenResponseError: true,
        responseData: '-'.repeat(300 - tokenPrefix.length) + SYNTHETIC_OPAQUE_TOKEN,
    });
    await awaitExit(boundaryRun);
    assertNotContains(boundaryRun.capturedText(), tokenPrefix, 'token prefix');
    assert.ok(boundaryRun.capturedText().includes('Token exchange failed: 400'));
    assert.ok(boundaryRun.capturedText().includes('"body":"[REDACTED]"'));
    assert.ok(boundaryRun.capturedText().includes(
        `"bodyLength":${300 - tokenPrefix.length + SYNTHETIC_OPAQUE_TOKEN.length}`,
    ));

    // JSON serialization escapes quotes, backslashes and control characters;
    // matching only the original password cannot protect this response body.
    const escapedPassword = 'synthetic-"password\\with\ncontrols';
    const escapedRun = loadSyntheticMain({
        tokenResponseError: true,
        envPassword: escapedPassword,
        responseData: { error_description: escapedPassword },
    });
    await awaitExit(escapedRun);
    const escapedOutput = escapedRun.capturedText();
    assertNotContains(escapedOutput, escapedPassword, 'password');
    assertNotContains(escapedOutput, 'synthetic-', 'escaped password prefix');
    assertNotContains(escapedOutput, 'error_description', 'response field');
    assert.ok(escapedOutput.includes('Token exchange failed: 400'));
    assert.ok(escapedOutput.includes('"body":"[REDACTED]"'));

    // Invalid GCP_SA_KEY: the JSON parse error message can embed a fragment
    // of the key and must not be echoed into the failure log.
    const gcpRun = loadSyntheticMain({ tokenExchangeSucceeds: true, gcpSaKey: 'not json' });
    await awaitExit(gcpRun);
    assert.ok(gcpRun.capturedText().includes('GCP_SA_KEY is not valid JSON'));
    assertNotContains(gcpRun.capturedText(), 'not json', 'GCP_SA_KEY fragment');

    console.log('secret redaction checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
