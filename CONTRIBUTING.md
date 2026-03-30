# Contributing

Thanks for contributing to `SchwabTokenAutoRefresher`.

## Ground Rules

- Prefer small, low-risk pull requests.
- Keep refactors separate from behavior changes.
- Add or update tests when changing runtime behavior.
- Do not use deployment or scheduled workflows as a substitute for local verification.

## Branching and Pull Requests

- Create a topic branch for each change.
- Open a pull request with a short summary and a concrete test plan.
- Wait for CI to pass before merging.

## Local Verification

Run the main verification command before opening a pull request:

```bash
npm install && node --check main.js && bash tests/test_workflow_config_sources.sh
```
