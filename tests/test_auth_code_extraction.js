const assert = require('assert');

const {
    extractAuthorizationCodeFromUrl,
    summarizeAuthorizationCode,
} = require('../lib/oauth');

assert.strictEqual(
    extractAuthorizationCodeFromUrl('https://127.0.0.1:8182/?code=C0.abc%2Bdef%40&session=123'),
    'C0.abc+def@',
);

assert.strictEqual(
    extractAuthorizationCodeFromUrl('https://127.0.0.1:8182/?code=C0.abc+def%40&session=123'),
    'C0.abc+def@',
);

assert.strictEqual(
    extractAuthorizationCodeFromUrl('https://127.0.0.1:8182/?session=123'),
    null,
);

assert.deepStrictEqual(
    summarizeAuthorizationCode('C0.abc+def@'),
    {
        present: true,
        length: 11,
        startsWithC0: true,
        endsWithAt: true,
        hasWhitespace: false,
        hasPercent: false,
        hasPlus: true,
    },
);

assert.deepStrictEqual(
    summarizeAuthorizationCode(null),
    {
        present: false,
    },
);

console.log('auth code extraction checks passed');
