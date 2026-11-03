async function notifyRefreshFailure(env = process.env, request = fetch) {
    const token = (env.TELEGRAM_TOKEN || env.TG_TOKEN || '').trim();
    const chats = [...new Set((env.GLOBAL_TELEGRAM_CHAT_ID || '').split(/[,;\s]+/).filter(Boolean))];
    if (!token || chats.length === 0) {
        throw new Error('Telegram alert requires TELEGRAM_TOKEN (or TG_TOKEN) and GLOBAL_TELEGRAM_CHAT_ID.');
    }

    const runUrl = `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;
    const text = `Schwab Token Auto Refresher 刷新失败。仅使用直连，未尝试代理。请检查工作流：\n${runUrl}`;
    let failed = false;
    for (const chat of chats) {
        try {
            const response = await request(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
                signal: AbortSignal.timeout(15000),
            });
            if (!response.ok || (await response.json()).ok !== true) failed = true;
        } catch {
            // Request errors can include the bot token in the URL; never log them.
            failed = true;
        }
    }
    if (failed) throw new Error('Telegram refresh failure alert delivery failed.');
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
