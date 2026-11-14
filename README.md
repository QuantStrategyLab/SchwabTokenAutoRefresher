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
to complete the broker login, including TOTP two-factor authentication, over a
direct connection only. It runs on Node.js 20.

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
node tests/test_refresh_failure_alert.js
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
| `GCP_SA_KEY` | No | ambient credentials | Legacy option for local callers using a service account key. |
| `GCP_SECRET_VERSION_RETENTION` | No | `1` | Number of secret versions to keep; older versions are permanently destroyed and cannot be restored. |
| `TELEGRAM_TOKEN` | For workflow alerts | `TG_TOKEN` | Unified Telegram bot token (QSL 资产管家 bot). |
| `GLOBAL_TELEGRAM_CHAT_ID` | For workflow alerts | none | Alert chat IDs, separated by commas, semicolons, or whitespace. |

Set the GitHub variables `GCP_WORKLOAD_IDENTITY_PROVIDER` and
`GCP_WORKLOAD_IDENTITY_SERVICE_ACCOUNT` for the scheduled workflow. Configure
the provider to accept this repository's default-branch refresh workflow.
Grant the refresh identity only the Secret Manager version permissions used by
the workflow, on the configured destination secret.

The workflow makes one direct refresh attempt. On failure it sends a Telegram
alert with the workflow run link, then leaves the job failed. Alert delivery
errors or missing bot configuration also fail the alert step. No refresh errors,
credentials, or token responses are included in the message.

Configure `TELEGRAM_TOKEN` (or the existing `TG_TOKEN`) and
`GLOBAL_TELEGRAM_CHAT_ID` as GitHub Actions secrets for the unified bot.
Tests use simulated requests and do not send real alerts.

Successful refreshes record their UTC completion time in the GitHub Actions run summary.

Automatic proxy fallback and manual `proxy_mode` were retired on 2026-11-02.
The existing `SCHWAB_PROXY_URL` secret is retained but is no longer read.
`SCHWAB_FORCE_PROXY_FIRST` is ignored. Both browser login and token exchange
connect directly, including when standard proxy environment variables are set.

## Repository layout

```
main.js     scheduled refresh entrypoint
lib/        OAuth and login rejection helpers
tests/      unit tests (use installed dependencies)
prompts/    review prompt text
scripts/    operator helpers
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). AI assistants and maintainers also follow [AGENTS.md](AGENTS.md).

## Security

See [SECURITY.md](SECURITY.md). Do not open a public issue for a vulnerability.
Never commit credentials or token material.

## License

MIT. See [LICENSE](LICENSE).
