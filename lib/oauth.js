function extractAuthorizationCodeFromUrl(redirectUrl) {
    if (!redirectUrl) {
        return null;
    }

    const match = redirectUrl.match(/[?&]code=([^&]+)/);
    if (!match) {
        return null;
    }

    try {
        return decodeURIComponent(match[1]);
    } catch (error) {
        throw new Error(`Failed to decode authorization code from redirect URL: ${error.message}`);
    }
}

function summarizeAuthorizationCode(code) {
    if (!code) {
        return {
            present: false,
        };
    }

    return {
        present: true,
        length: code.length,
        startsWithC0: code.startsWith('C0.'),
        endsWithAt: code.endsWith('@'),
        hasWhitespace: /\s/.test(code),
        hasPercent: code.includes('%'),
        hasPlus: code.includes('+'),
    };
}

module.exports = {
    extractAuthorizationCodeFromUrl,
    summarizeAuthorizationCode,
};
