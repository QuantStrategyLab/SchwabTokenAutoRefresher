#!/usr/bin/env python3
"""Deprecated compatibility entrypoint for the centralized Codex PR review workflow.

This repository now delegates PR review to
QuantStrategyLab/AIAuditBridge/.github/workflows/codex_pr_review.yml.
The local runner is intentionally kept as a tiny stub so old links fail clearly
without reintroducing copied review logic.
"""

from __future__ import annotations

import sys


def main() -> int:
    print(
        "Local Codex PR review runner has moved to "
        "QuantStrategyLab/AIAuditBridge reusable workflow.",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
