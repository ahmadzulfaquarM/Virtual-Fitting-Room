# Architecture

## Goal

A customer scans their body with a camera, an AI service reconstructs a personalised 3D avatar,
garments are shown on that avatar from any angle, and a transparent rule-based engine recommends a
size. The product must be an honest 3D experience, not an AI-generated picture of a person in
clothes.

## Honesty constraints (apply to every phase)

- **3D reconstruction / simulation** and **image-based virtual try-on** are different things and are
  always labelled as such. If genuine 3D garment simulation is not achievable with a provider, that is
  reported as a blocker, not silently replaced by a 2D image.
- Landmark detection never counts as proof of measurement accuracy.
- No provider API, SDK method or model capability is assumed. Each is verified against current
  documentation, pricing, licence and hardware requirements before it is selected (Phases 4–5).
- Test results are reported as PASS / FAIL / BLOCKED / NOT TESTED, never assumed.

## Phase 1 stack and rationale

| Layer            | Choice                                   | Why                                                                         | Trade-off                                                                 |
| ---------------- | ---------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Frontend         | React 19 + Vite 8, **JavaScript only**   | Matches the MERN skill set; fast dev loop; `.jsx` components, `.js` modules   | No compile-time type checking; shapes are documented with JSDoc and runtime validation |
| Styling          | Tailwind CSS v4 (Vite plugin)            | Same system as the store; components port to the cart unchanged               | Version may differ from the cart's; tokens pinned to avoid colour drift |
| Lint / format    | oxlint + Prettier                        | oxlint is the current Vite template default; very fast                       | Smaller rule set than ESLint; swap later if a missing rule matters        |
| Frontend tests   | Vitest + Testing Library (jsdom)         | Same config as Vite; no extra bundler                                       | jsdom is not a real browser (no WebGL/camera); see Phase 2/3 test plans   |
| Backend          | Python 3.11+ / FastAPI / uvicorn         | Pretrained body and try-on models are Python-first; keeps AI services replaceable | A second runtime to operate (versus Node only)                            |
| Backend tests    | pytest + httpx2 (Starlette TestClient)   | Standard, fast                                                              | Starlette deprecated `httpx` for its test client in favour of `httpx2`    |
| Backend lint     | ruff                                     | One tool for lint, imports and format                                        |                                                                           |

**Deliberately not installed yet:** Three.js / React Three Fiber (Phase 2), MediaPipe (Phase 3), any
AI model or provider SDK (Phase 4+), any database or object storage (Phase 4/7), Express (only if API
orchestration needs it; FastAPI can serve the browser directly). A Node/Express layer is a possible
addition when this is integrated into the MERN cart (Phase 9), not a Phase 1 need.

## Design system (matches the MERN Shopping Cart)

- Styling: Tailwind CSS utility classes, as in the store. No custom CSS beyond `index.css` tokens.
- Palette: primary blue-600 `#2563EB`; primary light blue-50 `#EFF6FF`; page slate-50 `#F8FAFC`;
  cards white; headings gray-900 `#111827`; body gray-600 `#4B5563`; borders slate-200 `#E2E8F0`.
- Blue is used for primary buttons, selected sizes, active controls, links and highlights.
- Shape: `rounded-xl` cards with `shadow-sm`, `rounded-lg` buttons, responsive single-column layout.
- Why the colors are pinned: Tailwind v4's default palette differs from v3 (its blue-600 is not
  `#2563EB`). `src/index.css` pins the exact hex values so the look is identical whichever Tailwind
  version the cart uses. Shared pieces live in `src/components/ui.jsx`; every later screen (viewer,
  scanner, clothing selector, measurement panels) must use them rather than new styles.
- Limitation: built from the specified palette and the recorded store stack. The cart's actual
  components/screenshots have not been inspected; at Phase 9 diff against them and reconcile.

## Runtime view (Phase 1)

```
Browser ──► Vite dev server (:5173) ──/api/*──► FastAPI (:8000)
                │                                    └─ GET /health
                └─ React app: System status card calls /api/health
```

In production the frontend is static files; `VITE_API_BASE_URL` selects the backend origin and the
backend `CORS_ALLOWED_ORIGINS` allows only that origin.

## Folder structure

```
virtual-fitting-room/
├── README.md
├── CHANGELOG.md
├── .gitignore  .editorconfig
├── docs/
│   └── ARCHITECTURE.md
├── scripts/
│   └── verify-phase1.sh        clean-install + all automated checks
├── frontend/
│   ├── index.html
│   ├── package.json  jsconfig.json  vite.config.js  .prettierrc.json  .env.example
│   └── src/
│       ├── main.jsx  App.jsx  index.css  config.js
│       ├── components/HealthStatus.jsx  ui.jsx (Card, Button, Badge)
│       ├── services/health.js          API client with timeout + response validation
│       └── test/setup.js               Testing Library / jest-dom setup
│       (tests live beside code: *.test.js / *.test.jsx)
└── backend/
    ├── app/
    │   ├── __init__.py                 holds __version__
    │   └── main.py                     create_app(), GET /health, CORS
    ├── tests/test_health.py
    ├── requirements.txt  requirements-dev.txt  pyproject.toml  .env.example
```

## Phase 2: 3D viewer

**What it is.** A React Three Fiber scene showing an avatar and an optional garment, with orbit
rotation, zoom, reset, front/left/back/right presets, auto-rotate and a garment toggle.

**What it is not.** The mannequin and T-shirt are procedurally generated placeholders
(`tools/generate_sample_assets.py`). They are not a body scan and not a fit or cloth simulation.
The UI says so next to the viewer.

**Design decisions**
- *Coordinate contract:* metres, +Y up, figure faces +Z, feet on y = 0. Garments are authored in the
  avatar's frame and live in the same group, so one fit transform (scale to 1.75 m, stand on the
  floor, centre) keeps them aligned. Phase 4 avatars and Phase 5 garments must follow this contract.
- *Pure camera maths* (`viewPresets.js`) is separate from three.js so it is unit-tested directly;
  the canvas only applies the result. Azimuth moves by the shortest arc.
- *Pre-flight asset check* (`assetCheck.js`) reads the first 12 bytes of each file before WebGL
  touches it. It turns a missing file (including an SPA host answering 200 with HTML), a non-GLB file,
  a wrong glTF version, a network failure and a timeout into specific messages. Corrupt files that
  pass the header check are caught by an error boundary.
- *Failure isolation:* a bad avatar blocks the viewer (with Try again); a bad garment only shows a
  warning and the avatar stays usable.
- *Performance:* three.js is a lazy chunk; `frameloop="demand"` renders only when something changes;
  pixel ratio capped at 1.75; `prefers-reduced-motion` makes camera moves instant.
- *Privacy:* no model or decoder is fetched from a third-party CDN, because scan-derived models will
  be private data. The `?avatar=` test hook accepts same-origin `.glb` paths only.
- *Own OrbitControls/GLTFLoader instead of drei:* smaller bundle, fewer dependencies.

**Test strategy.** Vitest covers logic and UI states with a stubbed canvas (jsdom has no WebGL).
Playwright drives real Chromium with software WebGL and checks rendered pixels (garment colour
present or absent, silhouette width front vs side), every control, drag and wheel input, missing,
fake and corrupt assets, missing WebGL, and a phone-sized layout.

## Phase 3: guided camera scanning

```
IntroStep (consent, tips) -> HeightStep -> CameraStep -> ReviewStep -> approved
        \_________________ scanReducer (pure; invalid transitions are no-ops) ______/
```

- **Nothing leaves the browser.** Photos are Blobs in `ScanFlow` state. The only exit is the
  `onApprove({heightCm, shots})` prop, called after the approval box is ticked and Approve is pressed.
  Phase 3 passes no handler. Unmount or Delete drops the blobs and revokes object URLs.
- **Camera only on a click.** `startCamera` runs when `CameraStep` mounts, which only happens after
  the person presses Start camera. Tracks are stopped on back, error, unmount and camera switch.
- **Checks (pure, tested on synthetic data):** blocking = person found, one person, whole body
  visible, distance, centred, face-on vs side-on (shoulder width / torso length), still, light.
  Warnings (flag, do not block) = arms, tilt, which way round, contrast, sharpness, backlight.
  The photo is taken from the raw (unmirrored) video; only the preview is mirrored.
- **Services are injectable** (`defaultServices.js`), so the flow is tested with a fake camera,
  detector and frame source, and in a real browser with Chromium's fake camera device.
- **Pose model:** MediaPipe Pose Landmarker lite, VIDEO mode, GPU delegate then CPU, self-hosted.
  It returns landmark positions only. It does not measure the body: passing every check means
  "the photo is usable", never "measurements will be accurate". Height is self-reported and unverified.
- **Provisional:** the set of views (`captureConfig.js`) and every threshold (`poseQuality.js`,
  `imageQuality.js`). Thresholds are heuristics, validated on synthetic poses and a mannequin only.

## Planned seams for later phases (not implemented)

- `frontend/src/features/viewer/` Three.js viewer (built in Phase 2) and `features/scan/` camera flow (built in Phase 3).
- `backend/app/reconstruction/` a provider-independent interface with adapters per model or API
  (Phase 4), so a provider can be replaced without touching the rest.
- `backend/app/sizing/` pure, rule-based, unit-testable size logic kept separate from visual try-on
  (Phase 6).
- Private storage and job metadata are added only when Phase 4/7 need them.

## Security notes (Phase 1)

- No secrets exist yet. `.env*` files are git-ignored except `.env.example`.
- Frontend env vars are public by design; secrets stay backend-only.
- CORS is an explicit allow-list, GET only.
- `.gitignore` already excludes `storage/`, `uploads/` and `scans/` so future body-scan data cannot
  be committed by accident.
