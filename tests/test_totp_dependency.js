const assert = require('assert');
const { Secret, TOTP } = require('otpauth');

// RFC 6238 SHA-1 vector at Unix time 59 seconds.
const base32Secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const expectedCode = '94287082';

assert.strictEqual(
    new TOTP({ secret: base32Secret, algorithm: 'SHA1', digits: 8, period: 30 })
        .generate({ timestamp: 59000 }),
    expectedCode,
);

assert.strictEqual(
    new TOTP({
        secret: ` ${base32Secret.toLowerCase().slice(0, 10)}\n${base32Secret.toLowerCase().slice(10)} `
            .replace(/\s/g, ''),
        algorithm: 'SHA1',
        digits: 8,
        period: 30,
    }).generate({ timestamp: 59000 }),
    expectedCode,
);

assert.strictEqual(
    new TOTP({
        secret: Secret.fromHex('3132333435363738393031323334353637383930'),
        algorithm: 'SHA1',
        digits: 8,
        period: 30,
    }).generate({ timestamp: 59000 }),
    expectedCode,
);

console.log('otpauth RFC 6238 vectors passed');
