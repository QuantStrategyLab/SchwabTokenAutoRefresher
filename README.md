# SchwabTokenAutoRefresher

[Chinese README](README.zh-CN.md)

> Investing involves risk. This project does not provide investment advice and is for education, research, and engineering review only.

## What this repository is

SchwabTokenAutoRefresher is a QuantStrategyLab credential automation utility. It automates Schwab OAuth token refresh and syncs refreshed credentials to Google Cloud Secret Manager.

It supports the system but does not decide which strategy should be live. Strategy eligibility remains in the strategy and snapshot repositories; broker execution remains in the platform repositories.

## Design boundary

- Keep contracts stable and versioned where downstream repositories depend on them.
- Prefer backward-compatible changes unless a coordinated migration is planned.
- Keep secrets and environment-specific settings outside the shared library code.
- Document changes that affect multiple platforms or strategy packages.

## Repository layout

- `tests/`: unit, contract, and regression tests.
- `.github/workflows/`: CI, scheduled jobs, release, or deployment workflows.

## Quick start

```bash
npm ci
```

## Useful docs

- No separate `docs/` directory yet; start with this README and the workflow files.

## License

See [LICENSE](LICENSE).
