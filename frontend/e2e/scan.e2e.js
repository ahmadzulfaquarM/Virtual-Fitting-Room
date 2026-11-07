import { test as base, expect } from '@playwright/test'
import { join } from 'node:path'
import { GENERATED } from './fixtures/make-videos.js'
import { stubBackend, watchConsole } from './helpers.js'

const baseArgs = [
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
]
/**
 * Chromium reads its fake camera from launch flags, which Playwright cannot vary per describe
 * block, so each group launches its own browser. cameraFile:
 *   'none'    no fake camera flags (the tests mock navigator.mediaDevices themselves)
 *   'pattern' Chromium's built-in test pattern (no person in view)
 *   '<name>'  a generated y4m video in e2e/.generated
 */
const test = base.extend({
  cameraFile: ['none', { option: true }],
  page: async (
    { playwright, cameraFile, baseURL, viewport, userAgent, isMobile, hasTouch, deviceScaleFactor },
    provide,
  ) => {
    const args = [...baseArgs]
    if (cameraFile !== 'none') {
      args.push('--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream')
      if (cameraFile !== 'pattern') {
        args.push(`--use-file-for-fake-video-capture=${join(GENERATED, cameraFile)}`)
      }
    }
    const browser = await playwright.chromium.launch({ args })
    const context = await browser.newContext({
      baseURL,
      viewport,
      userAgent,
      isMobile,
      hasTouch,
      deviceScaleFactor,
      permissions: cameraFile === 'none' ? [] : ['camera'],
    })
    await provide(await context.newPage())
    await context.close()
    await browser.close()
  },
})

async function open(page) {
  await stubBackend(page)
  await page.goto('/')
}

/** Intro -> consent -> height -> "Start camera". The camera is requested only by the last click. */
async function startScan(page, { height = '172', pressStart = true } = {}) {
  await page.getByRole('button', { name: 'Start body scan' }).click()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel(/height \(cm\)/i).fill(height)
  if (pressStart) await page.getByRole('button', { name: 'Start camera' }).click()
}

const mockCamera = (script) => (page) => page.addInitScript(script)

// ---------------------------------------------------------------------------------------------
test.describe('camera permission and browser support (mocked getUserMedia)', () => {
  test('the camera is not requested on load, in the intro, or on the height screen', async ({
    page,
  }) => {
    await mockCamera(`
      window.__gum = 0
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
        getUserMedia: () => { window.__gum++; return Promise.reject(new DOMException('no', 'NotAllowedError')) },
      }})`)(page)
    await open(page)
    await startScan(page, { pressStart: false })
    expect(await page.evaluate(() => window.__gum)).toBe(0)
    await page.getByRole('button', { name: 'Start camera' }).click()
    await expect.poll(() => page.evaluate(() => window.__gum)).toBe(1)
  })

  test('permission denied: clear guidance, and Try again asks again', async ({ page }) => {
    await mockCamera(`
      window.__gum = 0
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
        getUserMedia: () => { window.__gum++; return Promise.reject(new DOMException('denied', 'NotAllowedError')) },
      }})`)(page)
    await open(page)
    await startScan(page)
    const alert = page.getByRole('alert')
    await expect(alert).toContainText('Camera access was blocked')
    await expect(alert).toContainText('browser settings')
    await alert.getByRole('button', { name: 'Try again' }).click()
    await expect.poll(() => page.evaluate(() => window.__gum)).toBe(2)
    await expect(alert).toContainText('Camera access was blocked')
  })

  test('no camera connected', async ({ page }) => {
    await mockCamera(`
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
        getUserMedia: () => Promise.reject(new DOMException('none', 'NotFoundError')),
      }})`)(page)
    await open(page)
    await startScan(page)
    await expect(page.getByRole('alert')).toContainText('No camera found')
  })

  test('camera busy in another app', async ({ page }) => {
    await mockCamera(`
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
        getUserMedia: () => Promise.reject(new DOMException('busy', 'NotReadableError')),
      }})`)(page)
    await open(page)
    await startScan(page)
    await expect(page.getByRole('alert')).toContainText('Another app')
  })

  test('unsupported browser: told up front, cannot continue', async ({ page }) => {
    await mockCamera(
      `Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined })`,
    )(page)
    await open(page)
    await page.getByRole('button', { name: 'Start body scan' }).click()
    await expect(page.getByRole('alert')).toContainText(/cannot access a camera/)
    await page.getByRole('checkbox').check()
    await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled()
  })

  test('permission revoked while scanning (simulated at the API level): scan stops with guidance', async ({
    page,
  }) => {
    // A real revoke happens in browser settings and is a manual test (see README). Here the camera
    // track reports "ended", which is what browsers do when access is removed or the camera unplugged.
    await mockCamera(`
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
        getUserMedia: async () => {
          const c = document.createElement('canvas'); c.width = 640; c.height = 480
          const g = c.getContext('2d'); let n = 0
          setInterval(() => { g.fillStyle = 'hsl(' + (n++ * 7) + ' 40% 50%)'; g.fillRect(0, 0, 640, 480) }, 50)
          const stream = c.captureStream(10)
          window.__track = stream.getVideoTracks()[0]
          return stream
        },
      }})`)(page)
    await open(page)
    await startScan(page)
    await expect(page.getByText('Starting camera…')).toBeHidden({ timeout: 30_000 })
    await page.evaluate(() => window.__track.dispatchEvent(new Event('ended')))
    await expect(page.getByRole('alert')).toContainText('The camera stopped')
  })
})

// ---------------------------------------------------------------------------------------------
test.describe('real camera pipeline with the Chromium test pattern (no person)', () => {
  test.use({ cameraFile: 'pattern' })

  test('starts the camera, loads real MediaPipe, finds nobody, refuses to capture, console clean', async ({
    page,
  }) => {
    const problems = watchConsole(page)
    await open(page)
    await startScan(page)
    await expect(page.getByTestId('scan-video')).toBeVisible()
    await expect
      .poll(() => page.getByTestId('scan-video').evaluate((v) => v.videoWidth))
      .toBeGreaterThan(0)
    await expect(page.getByText('No person detected').first()).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole('button', { name: 'Capture now' })).toBeDisabled()
    await page.waitForTimeout(3000)
    await expect(page.getByRole('heading', { name: /Front photo \(1 of 4\)/ })).toBeVisible()
    expect(problems).toEqual([])
  })

  test('Back stops the camera', async ({ page }) => {
    await open(page)
    await startScan(page)
    await expect(page.getByTestId('scan-video')).toBeVisible()
    await expect
      .poll(() => page.getByTestId('scan-video').evaluate((v) => v.videoWidth))
      .toBeGreaterThan(0)
    const track = await page.evaluate(() => {
      const t = document.querySelector('video').srcObject.getVideoTracks()[0]
      window.__t = t
      return t.readyState
    })
    expect(track).toBe('live')
    await page
      .getByRole('region', { name: /photo \(/ })
      .getByRole('button', { name: 'Back' })
      .click()
    await expect.poll(() => page.evaluate(() => window.__t.readyState)).toBe('ended')
  })
})

// ---------------------------------------------------------------------------------------------
test.describe('real pipeline on a rendered mannequin (front view, well lit)', () => {
  test.use({ cameraFile: 'front.y4m' })

  test('captures the front photo automatically, then refuses a front-on body for the side view', async ({
    page,
  }) => {
    const problems = watchConsole(page)
    await open(page)
    await startScan(page)
    await expect(page.getByRole('heading', { name: /Left side photo \(2 of 4\)/ })).toBeVisible({
      timeout: 80_000,
    })
    // The camera still shows a front-on body, which is the wrong pose for the side view.
    await expect(page.getByText(/side-on/).first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Capture now' })).toBeDisabled()
    await page.waitForTimeout(6000)
    await expect(page.getByRole('heading', { name: /Left side photo \(2 of 4\)/ })).toBeVisible()
    expect(problems).toEqual([])
  })
})

test.describe('real pipeline on a rendered mannequin (too dark)', () => {
  test.use({ cameraFile: 'dark.y4m' })

  test('a dark image is rejected with lighting guidance and nothing is captured', async ({
    page,
  }) => {
    await open(page)
    await startScan(page)
    await expect(page.getByText(/Too dark/).first()).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole('button', { name: 'Capture now' })).toBeDisabled()
    await page.waitForTimeout(5000)
    await expect(page.getByRole('heading', { name: /Front photo \(1 of 4\)/ })).toBeVisible()
  })
})

// ---------------------------------------------------------------------------------------------
// MediaPipe cannot be exercised on side-on mannequin renders (it reports knees and feet at 0.1-0.3
// visibility on them), so the four-view flow replaces ONLY the MediaPipe module with scripted
// landmarks. The camera stream, frame capture, quality checks, React app and review are real.
const FAKE_MEDIAPIPE = `
const P = (x, y, v = 1) => ({ x, y, z: 0, visibility: v })
const base = () => Array.from({ length: 33 }, () => P(0.5, 0.5))
function body(side) {
  const p = base()
  const set = (i, x, y, v) => { p[i] = P(x, y, v) }
  set(0, side ? 0.46 : 0.5, 0.12); set(7, 0.53, 0.11); set(8, 0.47, 0.11)
  set(11, side ? 0.51 : 0.58, 0.25); set(12, side ? 0.49 : 0.42, 0.25, side ? 0.3 : 1)
  set(15, side ? 0.51 : 0.68, 0.5); set(16, side ? 0.49 : 0.32, 0.5, side ? 0.3 : 1)
  set(23, side ? 0.505 : 0.54, 0.52); set(24, side ? 0.495 : 0.46, 0.52, side ? 0.3 : 1)
  set(25, side ? 0.51 : 0.55, 0.72); set(26, side ? 0.49 : 0.45, 0.72, side ? 0.3 : 1)
  set(27, side ? 0.51 : 0.55, 0.9); set(28, side ? 0.49 : 0.45, 0.9, side ? 0.3 : 1)
  set(29, side ? 0.51 : 0.55, 0.92); set(30, side ? 0.49 : 0.45, 0.92, side ? 0.3 : 1)
  set(31, side ? 0.55 : 0.56, 0.93); set(32, side ? 0.53 : 0.44, 0.93, side ? 0.3 : 1)
  return p
}
export const FilesetResolver = { forVisionTasks: async () => ({}) }
export const PoseLandmarker = {
  createFromOptions: async () => ({
    detectForVideo: () => {
      const heading = document.querySelector('#scan-camera-heading')?.textContent ?? ''
      return { landmarks: [body(/Left|Right/.test(heading))] }
    },
    close() {},
  }),
}
`

test.describe('full guided flow (real camera stream and capture, scripted landmarks)', () => {
  test.use({ cameraFile: 'front.y4m' })

  test('four views -> review -> approval; nothing is uploaded at any point', async ({ page }) => {
    test.setTimeout(240_000)
    const problems = watchConsole(page)
    const uploads = []
    page.on('request', (r) => {
      if (r.method() !== 'GET' && r.method() !== 'HEAD') uploads.push(`${r.method()} ${r.url()}`)
    })
    await page.route(/@mediapipe_tasks-vision\.js/, (route) =>
      route.fulfill({ contentType: 'text/javascript', body: FAKE_MEDIAPIPE }),
    )
    await open(page)
    await startScan(page)

    await expect(page.getByRole('heading', { name: /review your photos/i })).toBeVisible({
      timeout: 200_000,
    })
    const photos = page.getByRole('img', { name: /photo$/ })
    await expect(photos).toHaveCount(4)
    // The thumbnails are real JPEGs of what the camera saw.
    for (const size of await photos.evaluateAll((imgs) =>
      imgs.map((i) => [i.naturalWidth, i.naturalHeight]),
    )) {
      expect(size[0]).toBeGreaterThan(0)
      expect(size[1]).toBeGreaterThan(0)
    }
    expect(uploads).toEqual([])

    const approve = page.getByRole('button', { name: 'Approve photos' })
    await expect(approve).toBeDisabled()
    await page.getByRole('checkbox').check()
    await approve.click()
    await expect(page.getByTestId('scan-approved-note')).toContainText(
      'Nothing has left this browser',
    )
    expect(uploads).toEqual([])
    expect(problems).toEqual([])
  })

  test('retake and delete work in a real browser', async ({ page }) => {
    test.setTimeout(240_000)
    await page.route(/@mediapipe_tasks-vision\.js/, (route) =>
      route.fulfill({ contentType: 'text/javascript', body: FAKE_MEDIAPIPE }),
    )
    await open(page)
    await startScan(page)
    await expect(page.getByRole('heading', { name: /review your photos/i })).toBeVisible({
      timeout: 200_000,
    })
    await page.getByRole('button', { name: 'Retake Back photo' }).click()
    await expect(page.getByRole('heading', { name: /Back photo \(3 of 4\)/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: /review your photos/i })).toBeVisible({
      timeout: 60_000,
    })
    await page.getByRole('button', { name: 'Delete photos' }).click()
    await expect(page.getByRole('heading', { name: 'Guided body scan' })).toBeVisible()
    await expect(page.getByRole('img', { name: /photo$/ })).toHaveCount(0)
  })
})
