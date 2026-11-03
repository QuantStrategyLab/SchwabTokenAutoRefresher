const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');
const { notifyRefreshFailure } = require('../scripts/notify_refresh_failure');

(async () => {
    const env = {
        TELEGRAM_TOKEN: 'synthetic-token', TG_TOKEN: 'synthetic-legacy-token',
        GLOBAL_TELEGRAM_CHAT_ID: 'synthetic-chat, other-chat synthetic-chat',
        GITHUB_SERVER_URL: 'https://github.com', GITHUB_REPOSITORY: 'example/refresher', GITHUB_RUN_ID: '123',
        SCHWAB_PASSWORD: 'synthetic-password',
    };
    const requests = [];
    await notifyRefreshFailure(env, async (url, options) => {
        requests.push({ url, options });
        return { ok: true, json: async () => ({ ok: true }) };
    });
    assert.strictEqual(requests.length, 2);
    for (const { url, options } of requests) {
        assert.strictEqual(url, 'https://api.telegram.org/botsynthetic-token/sendMessage');
        assert.strictEqual(options.method, 'POST');
        assert.ok(options.signal instanceof AbortSignal);
        const body = JSON.parse(options.body);
        assert.match(body.text, /刷新失败/);
        assert.ok(body.text.includes('https://github.com/example/refresher/actions/runs/123'));
        assert.ok(!options.body.includes(env.SCHWAB_PASSWORD));
        assert.ok(!options.body.includes(env.TELEGRAM_TOKEN));
    }
    assert.deepStrictEqual(requests.map(({ options }) => JSON.parse(options.body).chat_id),
        ['synthetic-chat', 'other-chat']);

    await notifyRefreshFailure({ ...env, TELEGRAM_TOKEN: '' }, async url => {
        assert.ok(url.includes(env.TG_TOKEN));
        return { ok: true, json: async () => ({ ok: true }) };
    });
    const forbidden = () => { throw new Error('must not make a request'); };
    for (const config of [{}, { TELEGRAM_TOKEN: 'synthetic' }, { GLOBAL_TELEGRAM_CHAT_ID: 'synthetic' }]) {
        await assert.rejects(notifyRefreshFailure(config, forbidden), /requires TELEGRAM_TOKEN/);
    }
    for (const request of [
        async () => ({ ok: false }),
        async () => ({ ok: true, json: async () => ({ ok: false }) }),
        async () => { throw new Error('synthetic-token must not leak'); },
        async () => ({ ok: true, json: async () => { throw new Error('bad JSON'); } }),
    ]) {
        await assert.rejects(notifyRefreshFailure(env, request), error => {
            assert.strictEqual(error.message, 'Telegram refresh failure alert delivery failed.');
            return true;
        });
    }
    let attempts = 0;
    await assert.rejects(notifyRefreshFailure(env, async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('first chat failed');
        return { ok: true, json: async () => ({ ok: true }) };
    }));
    assert.strictEqual(attempts, 2);

    const cli = spawnSync(process.execPath, [path.join(__dirname, '../scripts/notify_refresh_failure.js')],
        { env: {}, encoding: 'utf8' });
    assert.strictEqual(cli.status, 1);
    assert.match(cli.stderr, /requires TELEGRAM_TOKEN/);
    console.log('refresh failure Telegram alert checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
