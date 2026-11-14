async function notifyRefreshFailure(env = process.env, request = fetch) {
    const token = (env.TELEGRAM_TOKEN || env.TG_TOKEN || '').trim();
    const chats = [...new Set((env.GLOBAL_TELEGRAM_CHAT_ID || '').split(/[,;\s]+/).filter(Boolean))];
    if (!token || chats.length === 0) {
        throw new Error('Telegram alert requires TELEGRAM_TOKEN (or TG_TOKEN) and GLOBAL_TELEGRAM_CHAT_ID.');
    }

    const runUrl = `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;
    const text = `Schwab Token Auto Refresher 刷新失败。仅使用直连，未尝试代理。请检查工作流：\n${runUrl}`;
    const failures = [];
    for (const chat of chats) {
        let response;
        try {
            response = await request(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
                signal: AbortSignal.timeout(15000),
            });
        } catch (error) {
            // Request errors can include the bot token in the URL; never log them.
            failures.push(error?.name === 'TimeoutError' ? 'request timed out' : 'network request failed');
            continue;
        }
        if (!response.ok) {
            const status = response.status;
            failures.push(Number.isInteger(status) && status >= 400 && status <= 599
                ? `HTTP ${status}` : 'HTTP request rejected');
            continue;
        }
        try {
            const payload = await response.json();
            if (payload?.ok === true) continue;
            const code = payload?.error_code;
            failures.push(Number.isInteger(code) && code >= 400 && code <= 599
                ? `Telegram API ${code}` : 'Telegram API rejected the request');
        } catch {
            failures.push('invalid Telegram API response');
        }
    }
    if (failures.length) {
        throw new Error(`Telegram refresh failure alert delivery failed (${failures.length}/${chats.length}): ${[...new Set(failures)].join(', ')}.`);
    }
}

if (require.main === module) {
    notifyRefreshFailure().then(() => {
        console.log('Telegram refresh failure alert sent.');
    }).catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    });
}

module.exports = { notifyRefreshFailure };
