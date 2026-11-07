# 3D Virtual Fitting Room (standalone)

A standalone web application for guided body scanning, 3D avatar reconstruction, garment try-on
and measurement-based size recommendation. It is built separately from the MERN shopping cart and
will only be integrated after it passes its own acceptance tests.

**Current status: Phase 2 of 9 (interactive 3D visualization).**
The viewer shows a generated placeholder mannequin and T-shirt. Nothing here scans bodies,
reconstructs avatars or estimates fit yet. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the plan and design decisions.

## Prerequisites

| Tool    | Version tested | Minimum                         |
| ------- | -------------- | ------------------------------- |
| Node.js | 22.23          | 20.19 (required by Vite 8)      |
| npm     | 10.9           | 10                              |
| Python  | 3.13           | 3.11 (`ruff` target is `py311`) |

## Quick start

Open two terminals from the repository root.

```bash
# Terminal 1: backend (http://127.0.0.1:8000)
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

```bash
# Terminal 2: frontend (http://localhost:5173)
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. The "System status" card should show **Frontend: Running** and
**Backend API: Healthy (v0.1.0)**. Stop the backend and press **Re-check** to see the error state.

In development Vite proxies `/api/*` to the backend, so the browser talks to a single origin.

## Commands

| Task             | Frontend (`cd frontend`) | Backend (`cd backend`, venv active) |
| ---------------- | ------------------------ | ----------------------------------- |
| Install          | `npm install`            | `pip install -r requirements-dev.txt` |
| Run              | `npm run dev`            | `uvicorn app.main:app --reload`     |
| Lint             | `npm run lint`           | `ruff check .`                      |
| Format check     | `npm run format:check`   | `ruff format --check .`             |
| Format (write)   | `npm run format`         | `ruff format .`                     |
| Test             | `npm test`               | `pytest -q`                         |
| Production build | `npm run build`          | n/a                                 |

### Extra frontend commands (Phase 2)

| Task                            | Command                                                         |
| ------------------------------- | --------------------------------------------------------------- |
| Browser tests (real WebGL)      | `npx playwright install chromium` once, then `npm run test:e2e` |
| Validate the 3D assets          | `npm run validate:assets`                                       |
| Regenerate the sample assets    | `python3 tools/generate_sample_assets.py` (repository root)     |

`npm test` runs the fast Vitest suite only. `npm run test:e2e` starts the dev server itself and
drives Chromium with software WebGL, so it works on machines without a GPU.

### One-shot verification

```bash
bash scripts/verify-phase3.sh     # Phase 2 checks (regression) + model check + scan tests (all in the e2e run)
bash scripts/verify-phase2.sh     # Phase 1 checks (regression) + asset validation + browser tests
bash scripts/verify-phase1.sh     # only the Phase 1 checks
```

Both do a clean `npm ci` and a fresh Python venv first.

## Using the viewer

- Drag to rotate, scroll or pinch to zoom. Buttons: Front / Left / Back / Right, zoom in and out,
  reset, auto-rotate, show or hide the garment.
- Test hook (same-origin `.glb` paths only, anything else is ignored): `/?avatar=/models/x.glb`,
  `/?garment=/models/y.glb`, `/?garment=none`. A missing file shows the error states.
- The mannequin and T-shirt are generated placeholders, not a body scan and not a fit simulation.

## Manual checks that automation cannot cover (Phase 2)

1. On a real phone (iOS Safari and Android Chrome): drag to rotate, pinch to zoom, then try to
   scroll the page with a finger that starts on the viewer. Report whether it feels usable.
2. On a machine with a real GPU: confirm smooth rotation and no flicker.
3. Open the page, switch the phone to airplane mode and press Try again on a missing asset.

## Using the scanner (Phase 3)

Press **Start body scan**. Tick the consent box, enter your height, then press **Start camera**
(the browser asks for permission only then). Stand 2 to 3 m back with your whole body in frame; the
photo is taken automatically after the checks pass and you hold still for about 4 seconds, or press
**Capture now** once everything passes. Review the four photos, retake any, tick the approval box and
press **Approve photos**. In this phase nothing is uploaded: photos exist only in the page.

The camera views (front, left, back, right) are provisional; Phase 4 fixes them once the
reconstruction provider's input requirements are verified (`features/scan/captureConfig.js`).

### Manual checks that automation cannot cover (Phase 3)

1. **Real permission revoke**: while scanning, remove camera access in the browser's site settings
   (or unplug a USB camera). Expect "The camera stopped" with a Try again button. (Automated tests
   only simulate the track ending.)
2. **A real person, on a real phone and a real webcam**: all pose heuristics were tuned on synthetic
   poses and a mannequin render only. Try bad light, loose clothes, partial body, two people, wrong
   direction, and report any case where a good photo is refused or a bad one accepted.
3. **Side views**: on mannequin renders MediaPipe reports knees and feet at 0.1 to 0.3 visibility, so
   the side-on visibility checks have not been exercised with real detection at all.
4. Denied permission on iOS Safari and Firefox (the Permissions API for camera is not available
   there, so only the track "ended" event signals a revoke).
5. `npm run verify:pose-model` on a machine with internet access to compare the model against
   Google's official file (the build environment could not reach it).

## Manual browser check (required for the "no console errors" criterion)

Automated tests run in jsdom, not a real browser, so this must be done by hand:

1. Start both servers (see Quick start) and open <http://localhost:5173> in Chrome.
2. Open DevTools (F12) → **Console**. Reload the page.
3. Expect **no red errors and no warnings**. The status card should show the backend as healthy.
4. Stop the backend, press **Re-check**. The page should show "Unavailable" and a readable message.
   A failed `/api/health` network request in the Network/Console tab is expected in this step only.
5. Run `npm run build && npm run preview` in `frontend/` and repeat steps 2–3 on the production
   build (<http://localhost:4173>; the preview server has no proxy, so the backend will show as
   unavailable there unless `VITE_API_BASE_URL` points at a reachable backend).

Please report the console output if anything appears.

## Environment variables

- `frontend/.env.example`: optional `VITE_API_BASE_URL`, `VITE_DEV_BACKEND_URL`.
  **Never** put secrets in `VITE_*` variables; they are bundled into public JavaScript.
- `backend/.env.example`: `LOG_LEVEL`, `CORS_ALLOWED_ORIGINS`. AI provider keys will live here
  (backend only) in later phases.

## Repository layout

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#folder-structure). Changes are tracked in
[`CHANGELOG.md`](CHANGELOG.md).
