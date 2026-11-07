#!/usr/bin/env bash
# Phase 3 verification = everything from Phase 2 (regression, includes the browser tests, which now
# also cover the scanner) + the pose-model/WASM presence check.
#
# Usage (repository root):  bash scripts/verify-phase3.sh
# Needs ffmpeg on PATH (builds the fake-camera videos). Set SKIP_BROWSER_INSTALL=1 if Chromium is installed.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

command -v ffmpeg >/dev/null || { echo "ffmpeg is required for the camera test videos"; exit 1; }

bash "$ROOT/scripts/verify-phase2.sh"

cd "$ROOT/frontend"
step "Pose model and MediaPipe WASM are present"
test -s public/models/pose/pose_landmarker_lite.task
test -s public/mediapipe/wasm/vision_wasm_internal.wasm

printf '\n\033[1;32mPhase 3 verification: ALL AUTOMATED CHECKS PASSED\033[0m\n'
printf 'Manual checks still required: see "Manual checks ... (Phase 3)" in the README.\n'
