const assert = require('assert');
const { HttpsProxyAgent } = require('https-proxy-agent');

const {
    buildAxiosProxyConfig,
    buildPlaywrightProxy,
    maskProxyForLogs,
    resolveProxyUrl,
} = require('../lib/proxy');

assert.strictEqual(resolveProxyUrl({}), null);
assert.strictEqual(
    resolveProxyUrl({
        SCHWAB_PROXY_URL: 'http://primary.example.com:8080',
    }),
    'http://primary.example.com:8080',
);

assert.deepStrictEqual(
    buildPlaywrightProxy('http://user:pass@proxy.example.com:8080'),
    {
        server: 'http://proxy.example.com:8080',
        bypass: 'localhost,127.0.0.1,.launchdarkly.com,.go-mpulse.net,.glancecdn.net',
        username: 'user',
        password: 'pass',
    },
);

const axiosProxyConfig = buildAxiosProxyConfig('https://user:pass@proxy.example.com');
assert.strictEqual(axiosProxyConfig.proxy, false);
assert.ok(axiosProxyConfig.httpAgent instanceof HttpsProxyAgent);
assert.ok(axiosProxyConfig.httpsAgent instanceof HttpsProxyAgent);

assert.strictEqual(
    maskProxyForLogs('http://user:pass@proxy.example.com:8080'),
    'http://***:***@proxy.example.com:8080/',
);

assert.throws(
    () => buildPlaywrightProxy('socks5://proxy.example.com:1080'),
    /Unsupported proxy protocol/,
);

console.log('proxy config checks passed');
