#!/usr/bin/env bash
# Phase 2 verification = everything from Phase 1 (regression) + asset validation + browser tests.
#
# Usage (repository root):  bash scripts/verify-phase2.sh
# Set SKIP_BROWSER_INSTALL=1 if Playwright's Chromium is already installed.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

bash "$ROOT/scripts/verify-phase1.sh"   # clean install, lint, format, unit tests, build, backend

cd "$ROOT/frontend"
step "Validate 3D assets (Khronos glTF Validator)"
npm run validate:assets

if [ "${SKIP_BROWSER_INSTALL:-0}" != "1" ]; then
  step "Install Playwright Chromium"
  npx playwright install chromium
fi

step "Browser tests (real WebGL, desktop + mobile profiles)"
npm run test:e2e

printf '\n\033[1;32mPhase 2 verification: ALL AUTOMATED CHECKS PASSED\033[0m\n'
printf 'Manual checks still required: real GPU, real phone, touch gestures (see README).\n'
