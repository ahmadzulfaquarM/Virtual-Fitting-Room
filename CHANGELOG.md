# Changelog

## Phase 3: Guided camera scanning (2026-11-03)

### Added
- `frontend/src/features/scan/`: `ScanFlow.jsx` (intro/consent -> height -> camera -> review ->
  approval, services injectable for tests), `IntroStep`, `HeightStep`, `CameraStep`, `ReviewStep`,
  `BlobImage`, and pure logic: `captureConfig` (the four views, PROVISIONAL until Phase 4),
  `poseQuality` (landmark checks, stability tracker), `imageQuality` (light, contrast, sharpness,
  backlight), `heightInput`, `autoCapture`, `scanReducer`, `cameraService` (error taxonomy,
  permission and track watchers), `frameCapture`, `poseDetector` (lazy MediaPipe, GPU then CPU).
- Pose model: MediaPipe Pose Landmarker (lite), self-hosted (`public/models/pose/`, WASM copied by
  `scripts/copy-mediapipe-wasm.js`). No third-party CDN, so no body image leaves the origin.
  `npm run verify:pose-model` and `public/models/pose/NOTICE.md` explain provenance (see Known issues).
- Dependency: `@mediapipe/tasks-vision@1.2.0`.
- Tests: 146 new Vitest tests (checks on synthetic poses and images, every camera error type,
  permission changes, reducer gating, the full UI flow with a fake camera) and 12 Playwright tests per
  project (real Chromium, fake camera device, real MediaPipe). `scripts/verify-phase3.sh`.
- `e2e/fixtures/`: renders of the sample mannequin and `make-videos.js` (ffmpeg -> y4m fake cameras).

### Modified
- `App.jsx`: "Start body scan" opens the scanner (lazy loaded; the camera stays off until the person
  presses Start camera). `App.test.jsx`, `test/setup.js` (object-URL stub), `e2e/helpers.js`
  (native MediaPipe/ANGLE log lines allow-listed), `playwright.config.js` (global setup).

### Bugs found by the new tests and fixed
- One press of Start camera asked for the camera twice under React StrictMode (effects run twice).
  Camera and model start are now deferred one tick; regression test added.
- "Hold still" could never pass on a slow device: the stability window needed 4 samples in 700 ms but
  software MediaPipe gave ~5 detections per second. The tracker now keeps at least 3 samples (max age 4 s).
- In the dark the detector finds nobody, so "No person detected" hid the real cause. Lighting is now
  reported first.
- The Retake button's accessible name read "RetakeFront photo"; it now has an explicit aria-label.
- Infinity was reported as an out-of-range height instead of "not a number".
- If body detection failed to load, the camera was left on behind the error. It is now stopped.

## Phase 2: Interactive 3D visualization (2026-10-31)

### Added
- `tools/generate_sample_assets.py`: dependency-free generator for the placeholder assets
  (original geometry, no third-party content), plus `frontend/public/models/avatar.glb`,
  `garment.glb`, `avatar.meta.json` (ground-truth height 1.75 m and chest/waist/hip girths, kept
  for Phase 4 / 6 tests). Both GLBs pass the Khronos glTF Validator with 0 errors and 0 warnings.
- `frontend/src/features/viewer/`: `Viewer.jsx` (states and layout), `ViewerCanvas.jsx` (WebGL, lazy
  loaded), `ViewerControls.jsx`, `ViewerErrorBoundary.jsx`, `viewPresets.js` (pure camera maths),
  `assetCheck.js` (GLB pre-flight with readable errors), `useAssetCheck.js`, `fit.js`,
  `modelCache.js`, `sampleAssets.js`, `webgl.js`.
- `ui.jsx`: `ToggleButton` (selected state, blue-600) and `Spinner`.
- Tests: 63 new Vitest tests (camera maths, asset checks, query-string safety, controls, viewer
  states) and 22 Playwright browser tests run on a desktop and a mobile profile (real WebGL).
- `frontend/scripts/validate-assets.js` (`npm run validate:assets`), `scripts/verify-phase2.sh`,
  `frontend/playwright.config.js`, `frontend/e2e/`.
- Dependencies: `three`, `@react-three/fiber`, `react-icons`; dev: `@playwright/test` (1.63.0),
  `gltf-validator`.

### Modified
- `App.jsx` shows the viewer above the status cards; `App.test.jsx` stubs the viewer.
- `vite.config.js`: Vitest ignores `e2e/`. `.gitignore`, `.prettierignore`: Playwright output.

### Bugs found by the new tests and fixed
- Tearing a canvas down (after a render error, or on Retry) fired `webglcontextlost`, which replaced
  the real error message with "The 3D view was interrupted". Context loss is now ignored once the
  canvas is unmounting.
- Test-only: a glob route also matched the page URL, and the shadow skewed silhouette measurements.

### Known limitations
- `THREE.Clock` deprecation warning in the console comes from `@react-three/fiber` 9.8 with
  three r186. It is not suppressed; the e2e console check allow-lists exactly that message.
- Touch gestures (pinch, drag) and a real GPU were not tested; see README manual checks.
- Draco / Meshopt compressed models are not supported yet (no self-hosted decoder).
- The three.js chunk is about 954 kB (254 kB gzipped), loaded only when the viewer is shown.
- `touch-action: none` on the canvas means a finger that starts on the viewer rotates it instead of
  scrolling the page. Standard for 3D viewers, unverified on phones.

## UI theme: match the MERN Shopping Cart (2026-10-28)

### Added
- Tailwind CSS (`tailwindcss`, `@tailwindcss/vite`), the same styling system as the store.
- `frontend/src/components/ui.jsx`: shared `Card`, `Button`, `Badge` (plain Tailwind utilities).
- Brand tokens pinned in `frontend/src/index.css` (`@theme`): blue-600 `#2563EB`, blue-50 `#EFF6FF`,
  slate-50 `#F8FAFC`, white cards, gray-900 `#111827`, gray-600 `#4B5563`, slate-200 `#E2E8F0`
  (plus blue-700 hover and green/red/amber status tones).

### Modified
- `frontend/vite.config.js`: Tailwind plugin; `src/index.css`, `src/App.jsx`,
  `src/components/HealthStatus.jsx` restyled with Tailwind classes (hand-written CSS removed,
  dark-mode palette removed to match the light-only store).

### Not done
- The shopping cart's real source/screenshots were not available in this session, so the theme is
  built from the stated palette and the stack recorded for the store (Tailwind, blue-600 brand), not
  copied from its components. See docs/ARCHITECTURE.md "Design system".

## Phase 1: Project setup and architecture (2026-10-27; converted to JavaScript 2026-10-28)

### Added

- `frontend/`: Vite + React app in **plain JavaScript** (`.jsx` components, `.js` modules; no TypeScript).
  Initially scaffolded from the `react-ts` template, then converted to JavaScript on request.
  - `src/config.js`, `src/services/health.js`, `src/components/HealthStatus.jsx`, `src/main.jsx`, `src/App.jsx`
  - `src/test/setup.js`, `src/App.test.jsx`, `src/services/health.test.js`
  - `jsconfig.json` (editor path/JSX hints only; no type checking)
  - `.prettierrc.json`, `.prettierignore`, `.env.example`
  - Dev dependencies: vitest, jsdom, @testing-library/{react,jest-dom,user-event}, prettier
- `backend/`: FastAPI service with `GET /health`
  - `app/__init__.py`, `app/main.py`, `tests/test_health.py`
  - `requirements.txt`, `requirements-dev.txt`, `pyproject.toml`, `.env.example`
- `docs/ARCHITECTURE.md`, `README.md`, `CHANGELOG.md`, `scripts/verify-phase1.sh`
- `.gitignore`, `.editorconfig`

### Modified (from the scaffold)

- `frontend/package.json`: renamed to `fitting-room-frontend`; added `format`, `format:check`, `test`,
  `test:watch` scripts and an `engines` field; `build` is now plain `vite build`
- `frontend/vite.config.js`: `/api` dev proxy and Vitest configuration
- `frontend/.oxlintrc.json`: dropped the `typescript` plugin
- `frontend/index.html`: page title, entry is `/src/main.jsx`
- `frontend/src/App.jsx`, `frontend/src/index.css`: replaced template content

### Removed

- Template demo assets: `src/App.css`, `src/assets/*`, `public/icons.svg`
- All TypeScript: every `.ts`/`.tsx` file, `tsconfig*.json`, and the `typescript` and `@types/*`
  dev dependencies. There is no type-check step.

### Fixed during the phase

- `HealthStatus` re-rendered in an infinite loop because its default `check` prop was a new function
  on every render. Found by `App.test.jsx` hanging; fixed with a module-level default and an
  effect-based fetch with unmount cancellation.
- Backend test dependency changed from `httpx` to `httpx2` to remove a Starlette deprecation warning.
