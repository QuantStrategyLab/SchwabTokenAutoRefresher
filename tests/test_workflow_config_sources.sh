#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
workflow_file="$repo_dir/.github/workflows/main.yml"

grep -Fq 'GCP_PROJECT_ID: ${{ vars.GCP_PROJECT_ID }}' "$workflow_file"
grep -Fq 'GCP_SECRET_ID: ${{ vars.GCP_SECRET_ID }}' "$workflow_file"
grep -Fq 'SCHWAB_REDIRECT_URI: ${{ vars.SCHWAB_REDIRECT_URI }}' "$workflow_file"
grep -Fq 'id-token: write' "$workflow_file"
grep -Fq 'workload_identity_provider: ${{ vars.GCP_WORKLOAD_IDENTITY_PROVIDER }}' "$workflow_file"
grep -Fq 'service_account: ${{ vars.GCP_WORKLOAD_IDENTITY_SERVICE_ACCOUNT }}' "$workflow_file"
grep -Fq 'github.ref_name == github.event.repository.default_branch' "$workflow_file"
if grep -Fq 'GCP_SA_KEY' "$workflow_file"; then
  echo "workflow must use federated Google credentials" >&2
  exit 1
fi
grep -Fq 'TELEGRAM_TOKEN: ${{ secrets.TELEGRAM_TOKEN || secrets.TG_TOKEN }}' "$workflow_file"
grep -Fq 'GLOBAL_TELEGRAM_CHAT_ID: ${{ secrets.GLOBAL_TELEGRAM_CHAT_ID }}' "$workflow_file"
grep -Fq 'run: node scripts/notify_refresh_failure.js' "$workflow_file"

if grep -Eq 'secrets.SCHWAB_PROXY_URL|proxy_mode:|SCHWAB_FORCE_PROXY_FIRST' "$workflow_file"; then
  echo "workflow must not read the retired proxy secret or expose manual proxy mode" >&2
  exit 1
fi
grep -Fq 'SCHWAB_USERNAME: ${{ secrets.SCHWAB_USERNAME }}' "$workflow_file"
grep -Fq 'SCHWAB_PASSWORD: ${{ secrets.SCHWAB_PASSWORD }}' "$workflow_file"
grep -Fq 'SCHWAB_TOTP_SECRET: ${{ secrets.SCHWAB_TOTP_SECRET }}' "$workflow_file"
grep -Fq 'permissions:' "$workflow_file"
grep -Fq 'contents: read' "$workflow_file"
grep -Fq 'CHROME_VERSION="147.0.7727.137-1"' "$workflow_file"
grep -Fq 'https://dl.google.com/linux/chrome/deb/pool/main/g/google-chrome-stable/${CHROME_DEB}' "$workflow_file"
grep -Fq 'sudo apt install -y --allow-downgrades "./${CHROME_DEB}"' "$workflow_file"
grep -Eq "channel: ['\"]chrome['\"]" "$repo_dir/main.js"
grep -Fq 'PW_TEST_SCREENSHOT_NO_FONTS_READY' "$repo_dir/main.js"
grep -Fq '#placeholderCode' "$repo_dir/main.js"
grep -Fq '#continueButton' "$repo_dir/main.js"
grep -Fq 'upload_debug_artifacts:' "$workflow_file"
grep -Fq 'Upload Redacted Diagnostics' "$workflow_file"
grep -Fq "inputs.upload_debug_artifacts == 'true'" "$workflow_file"
grep -Fq '          path: ${{ runner.temp }}/redacted-diagnostics' "$workflow_file"

if grep -Fq 'google-chrome-stable_current_amd64.deb' "$workflow_file"; then
  echo "workflow should not install floating Google Chrome stable anymore" >&2
  exit 1
fi

if grep -Fq 'npx playwright install --with-deps chromium' "$workflow_file"; then
  echo "workflow should install pinned Google Chrome instead of Playwright Chromium for Schwab compatibility" >&2
  exit 1
fi

if grep -Fq '            *.png' "$workflow_file"; then
  echo "workflow should not upload screenshots by default" >&2
  exit 1
fi

if grep -Fq 'secrets.GCP_PROJECT_ID' "$workflow_file"; then
  echo "workflow should not read GCP_PROJECT_ID from secrets anymore" >&2
  exit 1
fi

if grep -Fq 'secrets.GCP_SECRET_ID' "$workflow_file"; then
  echo "workflow should not read GCP_SECRET_ID from secrets anymore" >&2
  exit 1
fi

if grep -Fq 'secrets.SCHWAB_REDIRECT_URI' "$workflow_file"; then
  echo "workflow should not read SCHWAB_REDIRECT_URI from secrets anymore" >&2
  exit 1
fi

if grep -Eq 'contents: write|git push|git checkout -B logs' "$workflow_file"; then
  echo "Runtime diagnostics must not be committed to a public branch" >&2
  exit 1
fi

grep -Fq 'Scan diagnostics before upload' "$workflow_file"
grep -Fq "steps.scan_diagnostics.outcome == 'success'" "$workflow_file"
grep -Fq '$GITHUB_STEP_SUMMARY' "$workflow_file"
