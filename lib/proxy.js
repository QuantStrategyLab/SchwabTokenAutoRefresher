const { HttpsProxyAgent } = require('https-proxy-agent');
const PLAYWRIGHT_PROXY_BYPASS = [
    'localhost',
    '127.0.0.1',
    '.launchdarkly.com',
    '.go-mpulse.net',
    '.glancecdn.net',
].join(',');

function resolveProxyUrl(env = process.env) {
    return env.SCHWAB_PROXY_URL || null;
}

function parseProxyUrl(proxyUrl) {
    if (!proxyUrl) {
        return null;
    }

    let parsed;
    try {
        parsed = new URL(proxyUrl);
    } catch (error) {
        throw new Error(`Invalid proxy URL: ${error.message}`);
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error(`Unsupported proxy protocol "${parsed.protocol}". Only http:// and https:// are supported.`);
    }

    return parsed;
}

function maskProxyForLogs(proxyUrl) {
    const parsed = parseProxyUrl(proxyUrl);
    if (!parsed) {
        return null;
    }

    const masked = new URL(parsed.toString());
    if (masked.username) {
        masked.username = '***';
    }
    if (masked.password) {
        masked.password = '***';
    }
    return masked.toString();
}

function buildPlaywrightProxy(proxyUrl) {
    const parsed = parseProxyUrl(proxyUrl);
    if (!parsed) {
        return undefined;
    }

    return {
        server: `${parsed.protocol}//${parsed.host}`,
        bypass: PLAYWRIGHT_PROXY_BYPASS,
        ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
        ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    };
}

function buildAxiosProxyConfig(proxyUrl) {
    const parsed = parseProxyUrl(proxyUrl);
    if (!parsed) {
        return {};
    }

    const proxyAgent = new HttpsProxyAgent(parsed.toString());

    return {
        proxy: false,
        httpAgent: proxyAgent,
        httpsAgent: proxyAgent,
    };
}

module.exports = {
    buildAxiosProxyConfig,
    buildPlaywrightProxy,
    maskProxyForLogs,
    parseProxyUrl,
    resolveProxyUrl,
};
