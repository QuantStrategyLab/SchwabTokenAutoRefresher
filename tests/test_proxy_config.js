const assert = require('assert');

const {
    buildAxiosProxyConfig,
    buildPlaywrightProxy,
    maskProxyForLogs,
    resolveProxyUrl,
} = require('../lib/proxy');

assert.strictEqual(resolveProxyUrl({}), null);
assert.strictEqual(
    resolveProxyUrl({
        HTTPS_PROXY: 'http://fallback.example.com:3128',
        SCHWAB_PROXY_URL: 'http://primary.example.com:8080',
    }),
    'http://primary.example.com:8080',
);

assert.deepStrictEqual(
    buildPlaywrightProxy('http://user:pass@proxy.example.com:8080'),
    {
        server: 'http://proxy.example.com:8080',
        bypass: 'localhost,127.0.0.1',
        username: 'user',
        password: 'pass',
    },
);

assert.deepStrictEqual(
    buildAxiosProxyConfig('https://user:pass@proxy.example.com'),
    {
        proxy: {
            protocol: 'https',
            host: 'proxy.example.com',
            port: 443,
            auth: {
                username: 'user',
                password: 'pass',
            },
        },
    },
);

assert.strictEqual(
    maskProxyForLogs('http://user:pass@proxy.example.com:8080'),
    'http://***:***@proxy.example.com:8080/',
);

assert.throws(
    () => buildPlaywrightProxy('socks5://proxy.example.com:1080'),
    /Unsupported proxy protocol/,
);

console.log('proxy config checks passed');
