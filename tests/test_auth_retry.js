const assert = require('assert');

const {
    isRetryableWithProxy,
    looksLikeCredentialOrRiskBanner,
} = require('../lib/auth_retry');

assert.strictEqual(
    looksLikeCredentialOrRiskBanner('We can’t log you in right now. Please try again later.'),
    true,
);

assert.strictEqual(
    looksLikeCredentialOrRiskBanner('Log In Invalid login ID or password. Need help? Login ID Password'),
    true,
);

assert.strictEqual(
    looksLikeCredentialOrRiskBanner('Login ID Password'),
    false,
);

assert.strictEqual(
    isRetryableWithProxy('Login page rejected credentials or flagged risk: We can’t log you in right now.'),
    true,
);

assert.strictEqual(
    isRetryableWithProxy('Login page rejected credentials or flagged risk during 2FA step: Invalid login ID or password'),
    true,
);

assert.strictEqual(
    isRetryableWithProxy('Failure: page.goto: net::ERR_TUNNEL_CONNECTION_FAILED at https://api.schwabapi.com/v1/oauth/authorize'),
    true,
);

assert.strictEqual(
    isRetryableWithProxy('2FA code was rejected after retry.'),
    false,
);

console.log('schwab auth retry checks passed');
