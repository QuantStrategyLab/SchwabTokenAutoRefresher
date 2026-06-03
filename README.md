# SchwabTokenAutoRefresher

[Chinese README](README.zh-CN.md)

> ⚠️ Investing involves risk. This project does not provide investment advice and is for educational and research purposes only.

## What this project does

SchwabTokenAutoRefresher is a **Credential automation utility** in the QuantStrategyLab ecosystem. It automates Schwab OAuth token refresh and syncs refreshed credentials to Google Cloud Secret Manager.

## Who this is for

- Engineers and researchers who want to inspect, reproduce, or extend this part of the QuantStrategyLab stack.
- Operators who need a clear entry point before reading the deeper runbooks or workflow files.
- Reviewers who need to understand the repository purpose, safety boundary, and evidence requirements before enabling automation.

## Current status

Credential utility. It should never store secrets in Git or print sensitive values in logs.

## Repository layout

- `lib/`: shared JavaScript runtime modules.
- `tests/`: unit and contract tests.
- `.github/workflows/`: CI, scheduled jobs, and deployment workflows.

## Quick start

From a fresh clone:

```bash
npm ci
```

If a command requires credentials, run it only after reading the relevant workflow or runbook and configuring secrets outside Git.

## Deployment and operation

Configure Schwab, Google Cloud, and optional proxy secrets in GitHub Actions. Run the workflow manually once, confirm redacted logs and Secret Manager updates, then enable the schedule.

Prefer manual or dry-run execution first. Enable schedules or live execution only after logs, artifacts, permissions, and rollback steps are reviewed.

## Strategy performance and evidence

Not a strategy repository. Success is measured by safe and reliable token refresh, redacted logs, and correct Secret Manager updates.

README files are intentionally not a source of dated performance promises. Re-run the relevant tests, backtests, or pipeline jobs before relying on any result.

## Safety notes

- Never commit API keys, broker credentials, OAuth tokens, cookies, or account identifiers.
- Run new strategies and platform changes in dry-run or paper mode before any live execution.
- Review generated orders, artifacts, and logs manually before enabling schedules.

## Contributing

Keep changes small, reproducible, and covered by the narrowest useful tests. For strategy-facing changes, include the evidence artifact or command used to validate behavior.

## License

See [LICENSE](LICENSE) if present in this repository.
