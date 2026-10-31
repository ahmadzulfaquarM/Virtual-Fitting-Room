#!/usr/bin/env bash
# Phase 1 verification: install from scratch, then lint, format-check,
# test and build both halves. Exits non-zero on the first failure.
#
# Usage (from the repository root):  bash scripts/verify-phase1.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

step "Frontend: clean install (npm ci)"
cd "$ROOT/frontend"
npm ci

step "Frontend: lint"
npm run lint
step "Frontend: format check"
npm run format:check
step "Frontend: unit tests"
npm test
step "Frontend: production build"
npm run build

step "Backend: create venv and install"
cd "$ROOT/backend"
python3 -m venv .venv
# shellcheck disable=SC1091
. .venv/bin/activate
pip install --quiet -r requirements-dev.txt

step "Backend: lint"
ruff check .
step "Backend: format check"
ruff format --check .
step "Backend: tests"
pytest -q

printf '\n\033[1;32mPhase 1 verification: ALL AUTOMATED CHECKS PASSED\033[0m\n'
printf 'Reminder: the "no console errors" criterion needs the manual browser check in README.md.\n'
