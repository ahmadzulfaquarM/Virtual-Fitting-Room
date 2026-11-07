import { expect } from '@playwright/test'

export const surface = (page) => page.getByTestId('viewer-surface')

/** The backend is not needed for viewer tests; answer its health check so no request fails. */
export async function stubBackend(page) {
  await page.route('**/api/health', (route) =>
    route.fulfill({
      json: { status: 'ok', service: 'fitting-room-api', version: '0.1.0' },
    }),
  )
}

/** Collects console errors and page errors; known third-party warnings are listed explicitly. */
export function watchConsole(page) {
  const problems = []
  // react-three-fiber 9.8 still constructs THREE.Clock, which three r18x deprecated.
  const knownWarnings = [
    /THREE\.Clock: This module has been deprecated/,
    // Native MediaPipe / ANGLE log lines (software WebGL in the test browser). Not app errors.
    /OpenGL error checking is disabled/,
    /GPU stall due to ReadPixels/,
    /landmark_projection_calculator\.cc.*NORM_RECT without IMAGE_DIMENSIONS/,
  ]
  page.on('console', (message) => {
    const type = message.type()
    if (type !== 'error' && type !== 'warning') return
    if (type === 'warning' && knownWarnings.some((re) => re.test(message.text()))) return
    problems.push(`${type}: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  return problems
}

export async function openViewer(page, query = '') {
  await stubBackend(page)
  await page.goto(`/${query}`)
}

export async function waitForModel(page) {
  await expect(surface(page)).toHaveAttribute('data-ready', 'true')
  await expect(page.getByText(/Drag to rotate/)).toBeVisible()
  await settle(page)
}

/** Camera state published by the viewer (data attributes on the surface). */
export async function cameraState(page) {
  const el = surface(page)
  return {
    azimuth: Number(await el.getAttribute('data-azimuth')),
    distance: Number(await el.getAttribute('data-distance')),
  }
}

/** Waits until the camera stops moving (two identical reads 250 ms apart). */
export async function settle(page) {
  let previous = null
  await expect
    .poll(
      async () => {
        const now = JSON.stringify(await cameraState(page))
        const stable = now === previous
        previous = now
        return stable
      },
      { intervals: [250], timeout: 15_000 },
    )
    .toBe(true)
}

/**
 * Screenshot of the 3D surface analysed inside the page (no image library needed).
 * Returns pixel counts, the figure's height, and its width across the chest/arm band.
 */
export async function analyseSurface(page) {
  const png = await surface(page).screenshot()
  const base64 = png.toString('base64')
  return page.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0)
    const { data, width, height } = ctx.getImageData(0, 0, img.width, img.height)
    let blue = 0
    let gray = 0
    let minX = width
    let maxX = -1
    let minY = height
    let maxY = -1
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        const isBlue = b > 140 && b - r > 70 && b - g > 40
        const isBackground =
          Math.abs(r - 248) < 12 && Math.abs(g - 250) < 12 && Math.abs(b - 252) < 12
        // Mannequin: grey-blue slate tones that are clearly darker than the background.
        const isFigure = !isBlue && !isBackground && b - r < 45 && r < 215 && r > 60
        if (isBlue) blue++
        if (isFigure) gray++
        if (isBlue || isFigure) {
          if (y < minY) minY = y
          if (y > maxY) maxY = y
          // Width is measured on a band across the chest and arms only: the soft ground shadow
          // is wide from every angle and would hide the difference between views.
          if (y > height * 0.32 && y < height * 0.5) {
            if (x < minX) minX = x
            if (x > maxX) maxX = x
          }
        }
      }
    }
    return {
      blue,
      gray,
      width,
      height,
      figureWidth: maxX >= minX ? maxX - minX + 1 : 0,
      figureHeight: maxY - minY + 1,
    }
  }, base64)
}
