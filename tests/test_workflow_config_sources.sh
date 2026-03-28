#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
workflow_file="$repo_dir/.github/workflows/main.yml"

grep -Fq 'GCP_PROJECT_ID: ${{ vars.GCP_PROJECT_ID || secrets.GCP_PROJECT_ID }}' "$workflow_file"
grep -Fq 'GCP_SECRET_ID: ${{ vars.GCP_SECRET_ID || secrets.GCP_SECRET_ID }}' "$workflow_file"
grep -Fq 'SCHWAB_REDIRECT_URI: ${{ vars.SCHWAB_REDIRECT_URI || secrets.SCHWAB_REDIRECT_URI }}' "$workflow_file"
grep -Fq 'GCP_SA_KEY: ${{ secrets.GCP_SA_KEY }}' "$workflow_file"
grep -Fq 'SCHWAB_USERNAME: ${{ secrets.SCHWAB_USERNAME }}' "$workflow_file"
grep -Fq 'SCHWAB_PASSWORD: ${{ secrets.SCHWAB_PASSWORD }}' "$workflow_file"
grep -Fq 'SCHWAB_TOTP_SECRET: ${{ secrets.SCHWAB_TOTP_SECRET }}' "$workflow_file"
