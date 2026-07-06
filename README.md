# SchwabTokenAutoRefresher


## QSL architecture role

- **Layer**: `platform-tooling`.
- **Responsibility**: Schwab OAuth token refresh automation utility.
- **Owns**: token refresh flow and Secret Manager sync behavior.
- **Consumes**: Schwab auth endpoints, Google Secret Manager, CharlesSchwabPlatform.
- **Must not**: decide strategy eligibility or log sensitive token values.

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

## QSL Compatibility Metadata

- Added `qsl.toml` to participate in the compatibility matrix with `tier = "platform-tooling"`, `ring = 4`, and `compat.bundle = "2026.07.0"`.
- This repository is a token refresh tooling utility and Node-based helper; no Python package migration is applied in this phase.
- Change scope is metadata-only with no API/credential/credential-storage path changes.


## Community and security

- See [CONTRIBUTING.md](CONTRIBUTING.md) for pull request scope, local verification, and documentation expectations.
- Follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for maintainer and contributor conduct.
- Report credential, automation, broker, exchange, or cloud-resource vulnerabilities through [SECURITY.md](SECURITY.md); do not open public issues for secrets or live-execution risk.

## License

See [LICENSE](LICENSE).
