const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { looksLikeCredentialOrRiskBanner } = require('../lib/auth_retry');

function loadSyntheticMain(scenario = {}) {
    const counts = { launches: 0, navigations: 0, fills: 0, logins: 0, codes: 0, exchanges: 0, writes: 0 };
    let redirect;
    const failure = message => new Error(message);
    const input = kind => ({
        first() { return this; },
        async waitFor() {
            if (kind === 'login' && scenario.formTimeout) throw failure('login visibility timeout');
        },
        async fill() {
            if (kind === 'login' || kind === 'password') counts.fills += 1;
            if (kind === 'login' && scenario.fillError) throw failure(scenario.fillError);
        },
        async isVisible() { return !(scenario.hiddenLogin && kind === 'login' && counts.logins > 0); },
    });
    const login = input('login');
    const password = input('password');
    const code = input('code');
    const button = name => ({
        first() { return this; }, async waitFor() {},
        async click() {
            if (name === 'Log in') {
                counts.logins += 1;
                if (scenario.submitError) throw failure(scenario.submitError);
            } else counts.codes += 1;
        },
    });
    const page = {
        on(event, callback) { if (event === 'request') redirect = callback; },
        async goto() {
            counts.navigations += 1;
            if (scenario.navigationError && (scenario.alwaysFail || counts.launches === 1)) {
                throw failure(scenario.navigationError);
            }
        },
        async waitForLoadState() {}, async waitForTimeout() {},
        async title() { return ''; }, url() { return 'https://example.invalid'; },
        getByRole(role, options) {
            if (role === 'textbox') return /Login/.test(options.name.source) ? login : password;
            if (role === 'spinbutton') return code;
            return button(options.name);
        },
        getByText() { return { async isVisible() { return !!scenario.twoFactorRejected; } }; },
        locator(selector) {
            if (selector === 'body') return { async innerText() { return (counts.codes > 0 && scenario.twoFactorBanner) || scenario.banner || ''; } };
            return code;
        },
    };
    const forbidden = () => { throw new Error('FORBIDDEN_REAL_OPERATION'); };
    const fakeRequire = name => {
        if (name === 'playwright-extra') return { chromium: {
            use() {}, async launchPersistentContext(directory, options) {
                counts.launches += 1;
                if (scenario.retiredProxyEnv) {
                    assert.strictEqual(options.proxy, undefined);
                    assert.ok(options.args.includes('--no-proxy-server'));
                }
                return { pages: () => [page], async close() {} };
            },
        } };
        if (name === 'puppeteer-extra-plugin-stealth') return () => ({});
        if (name === 'axios') return { async post(url, body, options) {
            assert.strictEqual(options.proxy, false);
            assert.strictEqual(options.httpAgent, undefined);
            assert.strictEqual(options.httpsAgent, undefined);
            return { data: { access_token: 'synthetic-access', refresh_token: 'synthetic-refresh' } };
        } };
        if (name === 'otpauth') return { TOTP: class { generate() { return 'synthetic-code'; } } };
        if (name === '@google-cloud/secret-manager') return { SecretManagerServiceClient: forbidden };
        if (name === 'path') return path;
        if (name === 'fs') return { writeFileSync: forbidden };
        if (name === './lib/auth_retry') return require('../lib/auth_retry');
        if (name === './lib/oauth') return {
            extractAuthorizationCodeFromUrl: () => 'synthetic-code', summarizeAuthorizationCode: () => ({}),
        };
        if (name === './lib/redact') return require('../lib/redact');
        throw new Error(`UNEXPECTED_MODULE: ${name}`);
    };
    fakeRequire.main = {};
    const context = vm.createContext({
        require: fakeRequire, module: {}, __dirname: '/synthetic', URL, URLSearchParams, Buffer,
        console: { log() {}, error() {} }, setTimeout(callback) { callback(); },
        process: { env: { SCHWAB_TOTP_SECRET: '', ...(scenario.retiredProxyEnv ? {
            SCHWAB_PROXY_URL: 'http://proxy.invalid:1080', SCHWAB_FORCE_PROXY_FIRST: 'true',
            HTTPS_PROXY: 'http://proxy.invalid:1080', HTTP_PROXY: 'http://proxy.invalid:1080',
        } : {}) }, exit: forbidden },
    });
    const source = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
    vm.runInContext(source, context);
    const exchange = vm.runInContext('exchangeCodeForToken', context);
    context.syntheticExchange = async () => {
        counts.exchanges += 1;
        if (scenario.exchangeError) throw failure('Token exchange network error: net::ERR_CONNECTION_REFUSED');
        return { expires_in: 1 };
    };
    context.syntheticWrite = async () => { counts.writes += 1; };
    context.syntheticConsent = async () => redirect({ url: () => 'https://example.invalid/callback' });
    vm.runInContext(`
        validateEnv = () => {};
        waitForFreshTotpWindow = async () => {};
        saveScreenshot = async () => {};
        collectPageDiagnostics = async () => ({ title: '', bodyTextPreview: '' });
        exchangeCodeForToken = syntheticExchange;
        updateAndCleanupSecrets = syntheticWrite;
        smartClick = syntheticConsent;
    `, context);
    return { counts, main: vm.runInContext('main', context), exchange, source };
}

(async () => {
    const denials = [
        'Your login ID or password is incorrect', 'Account locked', 'Too many failed attempts',
        'Suspicious activity', 'Credential/risk rejection', 'Login page flagged risk', '2FA code was rejected',
        'Enter a valid 6-digit security code.',
    ];
    for (const message of denials) {
        assert.strictEqual(looksLikeCredentialOrRiskBanner(message), true);
    }
    assert.strictEqual(looksLikeCredentialOrRiskBanner('We can’t log you in right now.'), true);
    assert.strictEqual(looksLikeCredentialOrRiskBanner('Login ID Password'), false);
    assert.strictEqual(looksLikeCredentialOrRiskBanner('Investing involves risk.'), false);
    const normal = loadSyntheticMain();
    await normal.main();
    assert.strictEqual(normal.counts.launches, 1);
    assert.strictEqual(normal.counts.logins, 1);
    assert.strictEqual(normal.counts.codes, 1);
    assert.strictEqual(normal.counts.writes, 1);
    assert.match(normal.source, /if\s*\(require\.main\s*===\s*module\)/);

    for (const scenario of [
        { banner: 'Investing involves risk. Read the disclosures before continuing.' },
        { twoFactorBanner: 'Investing involves risk. Never share your security code.' },
    ]) {
        const run = loadSyntheticMain(scenario);
        await run.main();
        assert.strictEqual(run.counts.launches, 1);
        assert.strictEqual(run.counts.logins, 1);
        assert.strictEqual(run.counts.codes, 1);
        assert.strictEqual(run.counts.writes, 1);
    }

    for (const banner of denials.slice(0, 6)) {
        const run = loadSyntheticMain({ banner, hiddenLogin: true });
        await assert.rejects(run.main());
        assert.strictEqual(run.counts.launches, 1);
        assert.strictEqual(run.counts.logins, 1);
        assert.strictEqual(run.counts.codes, 0);
    }
    for (const scenario of [
        { fillError: 'net::ERR_CONNECTION_REFUSED' }, { submitError: 'net::ERR_CONNECTION_REFUSED' },
        { submitError: 'login click timeout' }, { twoFactorRejected: true }, { exchangeError: true },
        { twoFactorBanner: 'Account locked' }, { twoFactorBanner: 'Suspicious activity' },
        { twoFactorBanner: 'Security code is invalid' },
        { formTimeout: true }, { navigationError: 'net::ERR_CONNECTION_RESET' },
        { navigationError: 'navigation timeout' },
    ]) {
        const run = loadSyntheticMain(scenario);
        await assert.rejects(run.main());
        assert.strictEqual(run.counts.launches, 1, JSON.stringify(scenario));
        assert.ok(run.counts.logins <= 1);
        assert.ok(run.counts.codes <= 1);
        assert.strictEqual(run.counts.navigations, 1);
        assert.strictEqual(run.counts.writes, 0);
    }
    for (const navigationError of ['net::ERR_CONNECTION_REFUSED', 'net::ERR_TUNNEL_CONNECTION_FAILED',
        'net::ERR_PROXY_CONNECTION_FAILED']) {
        const direct = loadSyntheticMain({ navigationError, retiredProxyEnv: true });
        await assert.rejects(direct.main(), new RegExp(navigationError));
        assert.strictEqual(direct.counts.launches, 1);
        assert.strictEqual(direct.counts.logins, 0);
        assert.strictEqual(direct.counts.writes, 0);
    }
    const exhausted = loadSyntheticMain({ navigationError: 'net::ERR_PROXY_CONNECTION_FAILED', alwaysFail: true });
    await assert.rejects(exhausted.main());
    assert.strictEqual(exhausted.counts.launches, 1);
    assert.strictEqual(exhausted.counts.fills, 0);
    const retired = loadSyntheticMain({ retiredProxyEnv: true });
    await retired.main();
    await retired.exchange('synthetic-code');
    assert.strictEqual(retired.counts.launches, 1);
    assert.strictEqual(retired.counts.writes, 1);
    console.log('schwab auth classification and synthetic caller checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
