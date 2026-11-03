'use strict';

// Redaction helpers for exception messages and diagnostic logs. All helpers
// are fail-closed: text that cannot be proven safe is replaced with
// [REDACTED] rather than passed through.

// Playwright echoes actions with their string arguments into error messages
// and call logs, e.g. fill(<locator>, <value>) or a one-arg call-log line
// such as fill(<typed value>). Redact from the action name to the end of
// the line: the whole call is dropped, and consuming to end-of-line keeps
// values that contain parens or quotes, and unquoted numeric arguments,
// from leaking in the remainder.
const PLAYWRIGHT_CALL_LOG_PATTERN =
    /\b(fill|pressSequentially|insertText|type)\([^\n]*/g;

// Playwright renders the resolved element as an HTML-ish preview in
// call-log lines (locator resolved to <input id="x" value="..."/>) and in
// strict-mode listings (1) <input value="..."/> aka ...), and text nodes as
// #text=<content>. Attribute values and element content can hold typed
// secrets, so any line carrying a preview is dropped entirely.
const PLAYWRIGHT_ELEMENT_PREVIEW_LINE_PATTERN =
    /^[ \t]*(?:- )?[^\n]*(?:<[a-z][a-z0-9-]*\b[^>\n]*>|#text=)[^\n]*$/gm;

// JSON Web Tokens: header.payload.signature with a base64url header.
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g;

// Authorization header fragments that may survive into error text.
const BEARER_PATTERN = /\bBearer[ \t]+[A-Za-z0-9._~+/=-]{8,}/gi;

// Opaque access/refresh tokens have no structure to anchor on; redact any
// long unbroken run of token-alphabet characters.
const OPAQUE_TOKEN_PATTERN = /\b[A-Za-z0-9_-]{32,}\b/g;

// Browser console and page-error payloads are arbitrary, untrusted text.
// Cookies and tokens need not have any recognizable alphabet or length, and
// configured secrets may be serialized or encoded repeatedly. Omit the whole
// payload instead of claiming that pattern matching can prove it safe.
function redactBrowserDiagnostic() {
    return '[REDACTED]';
}

function redactKnownSecrets(value, knownSecrets = []) {
    const secrets = [...knownSecrets]
        .filter(secret => typeof secret === 'string' && secret.length >= 4)
        .sort((a, b) => b.length - a.length);

    let output = String(value ?? '');
    secrets.forEach((secret, index) => {
        output = output.split(secret).join(`[REDACTED_${index + 1}]`);
    });
    return output;
}

function redactPlaywrightCallLog(value) {
    return String(value ?? '')
        .replace(PLAYWRIGHT_ELEMENT_PREVIEW_LINE_PATTERN, line => {
            const indent = line.match(/^[ \t]*/)[0];
            return `${indent}locator preview [REDACTED]`;
        })
        .replace(PLAYWRIGHT_CALL_LOG_PATTERN, (match, action) => `${action}([REDACTED])`);
}

function redactTokenPatterns(value) {
    return String(value ?? '')
        .replace(BEARER_PATTERN, 'Bearer [REDACTED]')
        .replace(JWT_PATTERN, '[REDACTED]')
        .replace(OPAQUE_TOKEN_PATTERN, '[REDACTED]');
}

function redactSecrets(value, knownSecrets = []) {
    return redactTokenPatterns(
        redactPlaywrightCallLog(
            redactKnownSecrets(value, knownSecrets),
        ),
    );
}

module.exports = {
    redactBrowserDiagnostic,
    redactKnownSecrets,
    redactPlaywrightCallLog,
    redactSecrets,
};
