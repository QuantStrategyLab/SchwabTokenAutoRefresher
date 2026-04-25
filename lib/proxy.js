const DEFAULT_PORTS = {
    'http:': 80,
    'https:': 443,
};
const PLAYWRIGHT_PROXY_BYPASS = 'localhost,127.0.0.1';

function resolveProxyUrl(env = process.env) {
    return env.SCHWAB_PROXY_URL || env.HTTPS_PROXY || env.HTTP_PROXY || null;
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

    return {
        proxy: {
            protocol: parsed.protocol.replace(':', ''),
            host: parsed.hostname,
            port: parsed.port ? Number(parsed.port) : DEFAULT_PORTS[parsed.protocol],
            ...(parsed.username
                ? {
                    auth: {
                        username: decodeURIComponent(parsed.username),
                        password: decodeURIComponent(parsed.password),
                    },
                }
                : {}),
        },
    };
}

module.exports = {
    buildAxiosProxyConfig,
    buildPlaywrightProxy,
    maskProxyForLogs,
    parseProxyUrl,
    resolveProxyUrl,
};
