# SchwabTokenAutoRefresher

A scheduled utility that refreshes the Charles Schwab OAuth token and stores it in Google Cloud Secret Manager.

English | [简体中文](README.zh-CN.md)

## Status

Experimental. Use at your own risk. This project is not financial advice and
does not guarantee any trading result. It handles broker credentials on behalf
of other services, so a misconfiguration can stop those services from
authenticating. It does not place orders.

## What this is

SchwabTokenAutoRefresher refreshes a Charles Schwab OAuth token on a schedule
and writes the refreshed credentials to Google Cloud Secret Manager, so
dependent services keep a valid token without manual renewal. It uses Playwright
to complete the broker login, including TOTP two-factor authentication, and can
route the login through an outbound HTTP proxy. It runs on Node.js 20.

## What this is not

It does not place, modify, or cancel orders. It does not decide which strategies
are eligible to run. It is not a general-purpose secret manager, and it does not
replace the broker platform that consumes the token.

## Quick start

Requires Node.js 20.x and npm.

```bash
npm ci
```

The refresher reads credentials from the environment and needs a browser
session, so run it under a headless X server as the `start` script does:

```bash
npm start
```

The unit tests are plain Node scripts; they do not contact the broker:

```bash
node tests/test_auth_retry.js
node tests/test_proxy_config.js
node tests/test_auth_code_extraction.js
```

## Configuration

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `SCHWAB_USERNAME` | Yes | none | Broker login name. |
| `SCHWAB_PASSWORD` | Yes | none | Broker login password. |
| `SCHWAB_TOTP_SECRET` | Yes | none | Base32 secret used to generate TOTP codes. |
| `SCHWAB_API_KEY` | Yes | none | OAuth application key. |
| `SCHWAB_APP_SECRET` | Yes | none | OAuth application secret. |
| `SCHWAB_REDIRECT_URI` | Yes | none | OAuth redirect URI registered with the application. |
| `GCP_PROJECT_ID` | Yes | none | Google Cloud project that holds the secret. |
| `GCP_SECRET_ID` | Yes | none | Secret Manager secret to update. |
| `GCP_SA_KEY` | No | ambient credentials | Service account key JSON when ambient credentials are not available. |
| `GCP_SECRET_VERSION_RETENTION` | No | `1` | Number of secret versions to keep; older versions are disabled. |
| `SCHWAB_PROXY_URL` | No | none | HTTP proxy for the login flow. |
| `SCHWAB_FORCE_PROXY_FIRST` | No | disabled | Use the proxy before a direct connection when set to `true`. |

## Repository layout

```
main.js     scheduled refresh entrypoint
lib/        proxy, OAuth, and retry helpers
tests/      dependency-free unit tests
prompts/    review prompt text
scripts/    operator helpers
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

See [SECURITY.md](SECURITY.md). Do not open a public issue for a vulnerability.
Never commit credentials or token material.

## License

MIT. See [LICENSE](LICENSE).
