function normalizeText(value) {
    return String(value ?? '')
        .replace(/[’‘]/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

const BANNER_PATTERNS = [
    /we can'?t log you in right now/i,
    /your (?:login id|user id) or password.*incorrect/i,
    /the (?:login id|user id) or password.*incorrect/i,
    /invalid (?:login|credentials|user id|password)/i,
    /incorrect (?:login id|user id|password)/i,
    /locked/i,
    /too many failed/i,
    /suspicious/i,
    /risk/i,
];

const RETRYABLE_ERROR_PATTERNS = [
    /net::ERR_TUNNEL_CONNECTION_FAILED/i,
    /net::ERR_PROXY_CONNECTION_FAILED/i,
    /net::ERR_CONNECTION_REFUSED/i,
    /net::ERR_CONNECTION_RESET/i,
    /net::ERR_CONNECTION_CLOSED/i,
    /login form did not become visible after/i,
    /credential\/risk rejection/i,
    /login page rejected credentials or flagged risk/i,
    /token exchange network error/i,
];

function looksLikeCredentialOrRiskBanner(value) {
    const text = normalizeText(value);
    return BANNER_PATTERNS.some(pattern => pattern.test(text));
}

function isRetryableWithProxy(value) {
    const text = normalizeText(value);
    return RETRYABLE_ERROR_PATTERNS.some(pattern => pattern.test(text));
}

module.exports = {
    isRetryableWithProxy,
    looksLikeCredentialOrRiskBanner,
    normalizeText,
};
