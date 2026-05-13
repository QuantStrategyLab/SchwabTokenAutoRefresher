#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
workflow_file="$repo_dir/.github/workflows/main.yml"

grep -Fq 'GCP_PROJECT_ID: ${{ vars.GCP_PROJECT_ID }}' "$workflow_file"
grep -Fq 'GCP_SECRET_ID: ${{ vars.GCP_SECRET_ID }}' "$workflow_file"
grep -Fq 'SCHWAB_REDIRECT_URI: ${{ vars.SCHWAB_REDIRECT_URI }}' "$workflow_file"
grep -Fq 'GCP_SA_KEY: ${{ secrets.GCP_SA_KEY }}' "$workflow_file"
grep -Fq 'SCHWAB_PROXY_URL: ${{ secrets.SCHWAB_PROXY_URL }}' "$workflow_file"
grep -Fq 'SCHWAB_FORCE_PROXY_FIRST' "$workflow_file"
grep -Fq 'SCHWAB_USERNAME: ${{ secrets.SCHWAB_USERNAME }}' "$workflow_file"
grep -Fq 'SCHWAB_PASSWORD: ${{ secrets.SCHWAB_PASSWORD }}' "$workflow_file"
grep -Fq 'SCHWAB_TOTP_SECRET: ${{ secrets.SCHWAB_TOTP_SECRET }}' "$workflow_file"
grep -Fq 'permissions:' "$workflow_file"
grep -Fq 'contents: write' "$workflow_file"
grep -Fq 'CHROME_VERSION="147.0.7727.137-1"' "$workflow_file"
grep -Fq 'https://dl.google.com/linux/chrome/deb/pool/main/g/google-chrome-stable/${CHROME_DEB}' "$workflow_file"
grep -Eq "channel: ['\"]chrome['\"]" "$repo_dir/main.js"
grep -Fq 'PW_TEST_SCREENSHOT_NO_FONTS_READY' "$repo_dir/main.js"
grep -Fq '#placeholderCode' "$repo_dir/main.js"
grep -Fq '#continueButton' "$repo_dir/main.js"
grep -Fq '            *.png' "$workflow_file"
grep -Fq '            *_diagnostics.json' "$workflow_file"

if grep -Fq 'google-chrome-stable_current_amd64.deb' "$workflow_file"; then
  echo "workflow should not install floating Google Chrome stable anymore" >&2
  exit 1
fi

if grep -Fq 'npx playwright install --with-deps chromium' "$workflow_file"; then
  echo "workflow should install pinned Google Chrome instead of Playwright Chromium for Schwab compatibility" >&2
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
