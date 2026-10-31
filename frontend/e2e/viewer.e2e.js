import { expect, test } from '@playwright/test'
import {
  analyseSurface,
  cameraState,
  openViewer,
  settle,
  surface,
  waitForModel,
  watchConsole,
} from './helpers'

// Match the request path only: a glob like **/x.glb would also match the page URL `/?avatar=/x.glb`.
const pathIs = (pathname) => (url) => url.pathname === pathname

const DEG = Math.PI / 180
const DEFAULT_DISTANCE = 3.4

test.describe('3D viewer: rendering', () => {
  test('renders the avatar and garment with no console errors', async ({ page }) => {
    const problems = watchConsole(page)
    await openViewer(page)
    await waitForModel(page)

    const pixels = await analyseSurface(page)
    expect(pixels.gray, 'mannequin pixels').toBeGreaterThan(1500)
    expect(pixels.blue, 'blue garment pixels').toBeGreaterThan(1500)
    // The figure should fill most of the height of the viewport without being cropped.
    expect(pixels.figureHeight / pixels.height).toBeGreaterThan(0.55)
    expect(pixels.figureHeight / pixels.height).toBeLessThan(0.98)

    expect(problems).toEqual([])
  })

  test('the garment toggle hides and shows the garment', async ({ page }) => {
    await openViewer(page)
    await waitForModel(page)
    const toggle = page.getByRole('button', { name: /show garment/i })

    const withGarment = await analyseSurface(page)
    expect(withGarment.blue).toBeGreaterThan(1500)

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await expect.poll(async () => (await analyseSurface(page)).blue).toBeLessThan(50)
    expect((await analyseSurface(page)).gray).toBeGreaterThan(1500) // avatar still there

    await toggle.click()
    await expect.poll(async () => (await analyseSurface(page)).blue).toBeGreaterThan(1500)
  })
})

test.describe('3D viewer: camera controls', () => {
  test.beforeEach(async ({ page }) => {
    await openViewer(page)
    await waitForModel(page)
  })

  test('starts at the front view', async ({ page }) => {
    expect(Math.abs((await cameraState(page)).azimuth)).toBeLessThan(0.01)
    expect((await cameraState(page)).distance).toBeCloseTo(DEFAULT_DISTANCE, 1)
    await expect(page.getByRole('button', { name: 'Front' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  for (const [name, azimuthDeg] of [
    ['Left', 90],
    ['Back', 180],
    ['Right', -90],
    ['Front', 0],
  ]) {
    test(`${name} button moves the camera to the ${name.toLowerCase()} view`, async ({ page }) => {
      if (name === 'Front') await page.getByRole('button', { name: 'Left' }).click() // leave the start pose first
      await page.getByRole('button', { name }).click()
      await expect
        .poll(async () => {
          const { azimuth } = await cameraState(page)
          const target = azimuthDeg * DEG
          const delta = Math.atan2(Math.sin(azimuth - target), Math.cos(azimuth - target))
          return Math.abs(delta)
        })
        .toBeLessThan(0.03)
      await expect(page.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true')
    })
  }

  test('the side view really shows a different silhouette from the front', async ({ page }) => {
    const front = await analyseSurface(page)
    await page.getByRole('button', { name: 'Left' }).click()
    await expect(page.getByRole('button', { name: 'Left' })).toHaveAttribute('aria-pressed', 'true')
    await settle(page)
    const side = await analyseSurface(page)
    // Arms and shoulders spread across the front view; from the side the figure is much narrower.
    expect(side.figureWidth).toBeLessThan(front.figureWidth * 0.7)
  })

  test('zoom in and zoom out change the distance, within limits', async ({ page }) => {
    const start = (await cameraState(page)).distance
    await page.getByRole('button', { name: 'Zoom in' }).click()
    await expect.poll(async () => (await cameraState(page)).distance).toBeLessThan(start - 0.3)
    const zoomedIn = (await cameraState(page)).distance

    await page.getByRole('button', { name: 'Zoom out' }).click()
    await page.getByRole('button', { name: 'Zoom out' }).click()
    await expect
      .poll(async () => (await cameraState(page)).distance)
      .toBeGreaterThan(zoomedIn + 0.3)

    for (let i = 0; i < 12; i++) await page.getByRole('button', { name: 'Zoom in' }).click()
    await settle(page)
    expect((await cameraState(page)).distance).toBeGreaterThanOrEqual(1.19)
    for (let i = 0; i < 20; i++) await page.getByRole('button', { name: 'Zoom out' }).click()
    await settle(page)
    expect((await cameraState(page)).distance).toBeLessThanOrEqual(6.01)
  })

  test('reset returns to the default front view', async ({ page }) => {
    await page.getByRole('button', { name: 'Back' }).click()
    await page.getByRole('button', { name: 'Zoom in' }).click()
    await settle(page)
    await page.getByRole('button', { name: 'Reset view' }).click()
    await settle(page)
    const { azimuth, distance } = await cameraState(page)
    expect(Math.abs(azimuth)).toBeLessThan(0.01)
    expect(distance).toBeCloseTo(DEFAULT_DISTANCE, 1)
    await expect(page.getByRole('button', { name: 'Front' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  test('auto-rotate turns the avatar and can be switched off', async ({ page }) => {
    const toggle = page.getByRole('button', { name: 'Auto-rotate' })
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(async () => Math.abs((await cameraState(page)).azimuth)).toBeGreaterThan(0.15)
    await toggle.click()
    await settle(page)
    const stopped = (await cameraState(page)).azimuth
    await page.waitForTimeout(600)
    expect((await cameraState(page)).azimuth).toBeCloseTo(stopped, 3)
  })
})

test.describe('3D viewer: direct manipulation', () => {
  test('dragging rotates the avatar and clears the active preset', async ({ page, isMobile }) => {
    test.skip(
      isMobile,
      'mouse drag is covered on desktop; touch rotation is checked in the mobile test',
    )
    await openViewer(page)
    await waitForModel(page)
    const box = await surface(page).boundingBox()
    const y = box.y + box.height / 2
    await page.mouse.move(box.x + box.width * 0.35, y)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.65, y, { steps: 12 })
    await page.mouse.up()
    await expect.poll(async () => Math.abs((await cameraState(page)).azimuth)).toBeGreaterThan(0.3)
    await expect(page.getByRole('button', { name: 'Front' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  test('the mouse wheel zooms', async ({ page, isMobile }) => {
    test.skip(isMobile, 'wheel input is a desktop interaction')
    await openViewer(page)
    await waitForModel(page)
    const box = await surface(page).boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    const start = (await cameraState(page)).distance
    await page.mouse.wheel(0, -400)
    await expect.poll(async () => (await cameraState(page)).distance).toBeLessThan(start - 0.2)
  })
})

test.describe('3D viewer: missing and invalid assets', () => {
  test('a missing avatar shows a readable error and no controls work', async ({ page }) => {
    const problems = watchConsole(page)
    await openViewer(page, '?avatar=/models/does-not-exist.glb')
    const alert = surface(page).getByRole('alert')
    await expect(alert).toContainText('Sample mannequin not found')
    await expect(alert).toContainText('/models/does-not-exist.glb')
    await expect(surface(page).locator('canvas')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Front' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
    // The page itself keeps working and nothing crashed.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(problems.filter((p) => !/Failed to load resource/.test(p))).toEqual([])
  })

  test('a missing garment is a warning: the avatar still renders', async ({ page }) => {
    await openViewer(page, '?garment=/models/no-shirt.glb')
    await waitForModel(page)
    await expect(page.getByText(/Sample T-shirt not found/)).toBeVisible()
    await expect(page.getByText(/avatar is shown without it/i)).toBeVisible()
    const pixels = await analyseSurface(page)
    expect(pixels.gray).toBeGreaterThan(1500)
    expect(pixels.blue).toBeLessThan(50)
    await expect(page.getByRole('button', { name: /show garment/i })).toBeDisabled()
  })

  test('garment=none renders the bare avatar without any error', async ({ page }) => {
    await openViewer(page, '?garment=none')
    await waitForModel(page)
    await expect(page.getByText(/not found/i)).toHaveCount(0)
    expect((await analyseSurface(page)).blue).toBeLessThan(50)
  })

  test('a file that is not a GLB is rejected before it reaches the renderer', async ({ page }) => {
    await page.route(pathIs('/models/fake.glb'), (route) =>
      route.fulfill({
        status: 200,
        contentType: 'model/gltf-binary',
        body: Buffer.from('this is definitely not a 3D model'),
      }),
    )
    await openViewer(page, '?avatar=/models/fake.glb')
    await expect(surface(page).getByRole('alert')).toContainText('not a valid 3D model')
    await expect(surface(page).getByRole('alert')).toContainText('not a binary glTF')
  })

  test('a corrupt GLB that passes the header check shows a rendering error with retry', async ({
    page,
  }) => {
    // Valid 12-byte GLB header (magic, version 2, length) followed by nothing usable.
    const header = Buffer.alloc(12)
    header.write('glTF', 0, 'ascii')
    header.writeUInt32LE(2, 4)
    header.writeUInt32LE(12, 8)
    await page.route(pathIs('/models/corrupt.glb'), (route) =>
      route.fulfill({ status: 200, contentType: 'model/gltf-binary', body: header }),
    )
    await openViewer(page, '?avatar=/models/corrupt.glb')
    const alert = surface(page).getByRole('alert')
    await expect(alert).toContainText('could not be displayed')
    await expect(surface(page).getByRole('button', { name: 'Try again' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Front' })).toBeDisabled()

    // Regression: tearing the canvas down used to be reported as "3D view was interrupted".
    await surface(page).getByRole('button', { name: 'Try again' }).click()
    await expect(alert).toContainText('could not be displayed')
    await page.waitForTimeout(1000)
    await expect(alert).not.toContainText('interrupted')
  })

  test('Try again recovers once the missing avatar becomes available', async ({ page }) => {
    let available = false
    await page.route(pathIs('/models/late.glb'), async (route) => {
      if (!available) return route.fulfill({ status: 404, body: 'nope' })
      return route.continue({ url: new URL('/models/avatar.glb', page.url()).toString() })
    })
    await openViewer(page, '?avatar=/models/late.glb')
    await expect(surface(page).getByRole('alert')).toContainText('not found')
    available = true
    await surface(page).getByRole('button', { name: 'Try again' }).click()
    await waitForModel(page)
    expect((await analyseSurface(page)).gray).toBeGreaterThan(1500)
  })

  test('unsafe asset overrides in the query string are ignored', async ({ page }) => {
    const requested = []
    page.on('request', (request) => requested.push(request.url()))
    await openViewer(page, '?avatar=https://evil.example/a.glb')
    await waitForModel(page)
    expect(requested.some((url) => new URL(url).hostname === 'evil.example')).toBe(false)
  })
})

test.describe('3D viewer: unsupported browsers', () => {
  test('explains when WebGL is not available', async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        if (/webgl/i.test(type)) return null
        return original.call(this, type, ...rest)
      }
    })
    await openViewer(page)
    await expect(surface(page).getByRole('alert')).toContainText('3D view is not supported here')
    await expect(surface(page).locator('canvas')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Front' })).toBeDisabled()
  })
})

test.describe('3D viewer: layout', () => {
  test('fits the screen without horizontal scrolling and keeps controls usable', async ({
    page,
    isMobile,
  }) => {
    await openViewer(page)
    await waitForModel(page)

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }))
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth)

    // Every toolbar button is at least 40 px high: comfortable for touch.
    const heights = await page
      .getByRole('toolbar')
      .getByRole('button')
      .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)))
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(40)

    if (isMobile) {
      // Toolbar buttons must stay inside the viewport on a phone.
      const outside = await page
        .getByRole('toolbar')
        .getByRole('button')
        .evaluateAll(
          (els) =>
            els.filter((el) => {
              const r = el.getBoundingClientRect()
              return r.left < 0 || r.right > window.innerWidth
            }).length,
        )
      expect(outside).toBe(0)
      // A tap on a view button works with touch input.
      await page.getByRole('button', { name: 'Back' }).tap()
      await expect(page.getByRole('button', { name: 'Back' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    }
  })
})
