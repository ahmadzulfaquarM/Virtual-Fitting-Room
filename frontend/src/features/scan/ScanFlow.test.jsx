import { StrictMode } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CameraError } from './cameraService'
import { ScanFlow } from './ScanFlow'
import { frontPose, sidePose } from './testPoses'

const W = 64
const H = 48
const imageOf = (fn) => {
  const data = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const v = fn(x, y)
      const i = (y * W + x) * 4
      data[i] = data[i + 1] = data[i + 2] = v
      data[i + 3] = 255
    }
  return { data, width: W, height: H }
}
const GOOD = () => imageOf((x, y) => ((x + y) % 2 ? 190 : 60))
const DARK = () => imageOf((x, y) => ((x + y) % 2 ? 40 : 5))
const BLURRY = () => imageOf((x) => 40 + (x / W) * 160)

/** Fake camera, detector and frame source. `ctx` lets a test change what the "camera sees". */
function makeServices(overrides = {}) {
  const ctx = {
    image: GOOD,
    poses: () => {
      const heading = document.querySelector('#scan-camera-heading')?.textContent ?? ''
      return [/Left|Right/.test(heading) ? sidePose() : frontPose()]
    },
    endedCb: null,
    permissionCb: null,
    stop: vi.fn(),
    close: vi.fn(),
    clock: 0,
  }
  const services = {
    getCameraSupport: () => ({ supported: true }),
    startCamera: vi.fn(async () => ({ stream: {}, track: {}, stop: ctx.stop })),
    watchStream: vi.fn((_s, cb) => {
      ctx.endedCb = cb
      return () => {}
    }),
    watchCameraPermission: vi.fn((cb) => {
      ctx.permissionCb = cb
      return () => {}
    }),
    createPoseDetector: vi.fn(async () => ({
      detect: () => ({ poses: ctx.poses() }),
      close: ctx.close,
    })),
    sampleFrame: () => ctx.image(),
    captureFrame: vi.fn(async () => ({ blob: new Blob(['jpg']), width: 640, height: 480 })),
    now: () => (ctx.clock += 100),
    intervalMs: 5,
    ...overrides,
  }
  return { services, ctx }
}

async function toCamera(user, { height = '172' } = {}) {
  await user.click(screen.getByRole('checkbox'))
  await user.click(screen.getByRole('button', { name: 'Continue' }))
  await user.type(screen.getByLabelText(/height \(cm\)/i), height)
  await user.click(screen.getByRole('button', { name: 'Start camera' }))
}

const reviewHeading = () =>
  screen.findByRole('heading', { name: /review your photos/i }, { timeout: 4000 })

beforeEach(() => {
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
})
afterEach(() => vi.restoreAllMocks())

describe('permission and set-up', () => {
  it('does not touch the camera until the person has consented, given a height and pressed Start camera', async () => {
    const user = userEvent.setup()
    const { services } = makeServices()
    render(<ScanFlow services={services} />)
    expect(services.startCamera).not.toHaveBeenCalled()
    expect(services.createPoseDetector).not.toHaveBeenCalled()

    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(services.startCamera).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Start camera' })) // empty height
    expect(screen.getByRole('alert')).toHaveTextContent(/centimetres/)
    expect(services.startCamera).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText(/height \(cm\)/i), '172')
    await user.click(screen.getByRole('button', { name: 'Start camera' }))
    await waitFor(() => expect(services.startCamera).toHaveBeenCalledTimes(1))
  })

  it('asks for the camera exactly once per start, even under React StrictMode (regression)', async () => {
    const user = userEvent.setup()
    const { services } = makeServices()
    render(
      <StrictMode>
        <ScanFlow services={services} />
      </StrictMode>,
    )
    await toCamera(user)
    await screen.findByRole('heading', { name: /Live checks/ })
    expect(services.startCamera).toHaveBeenCalledTimes(1)
    expect(services.createPoseDetector).toHaveBeenCalledTimes(1)
  })

  it('states the privacy promise and that landmark checks do not prove accuracy', () => {
    render(<ScanFlow services={makeServices().services} />)
    expect(
      screen.getByText(/Nothing is uploaded until you review the photos and approve/),
    ).toBeVisible()
    expect(
      screen.getByText(/does not mean any later measurement or size suggestion will be accurate/),
    ).toBeVisible()
  })

  it('blocks an unsupported browser before asking for anything', () => {
    const { services } = makeServices({
      getCameraSupport: () => ({
        supported: false,
        message: 'This browser cannot access a camera.',
      }),
    })
    render(<ScanFlow services={services} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/cannot access a camera/)
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
  })

  it('accepts feet and inches', async () => {
    const user = userEvent.setup()
    const { services } = makeServices()
    render(<ScanFlow services={services} />)
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'ft / in' }))
    await user.type(screen.getByLabelText('Feet'), '5')
    await user.type(screen.getByLabelText('Inches'), '9')
    await user.click(screen.getByRole('button', { name: 'Start camera' }))
    await waitFor(() => expect(services.startCamera).toHaveBeenCalled())
  })
})

describe('camera failures', () => {
  it.each([
    ['denied', 'Camera access was blocked', /browser settings/],
    ['not-found', 'No camera found', /Connect a camera/],
    ['in-use', 'The camera could not be started', /Another app/],
  ])('%s shows guidance and lets the person try again', async (code, title, detail) => {
    const user = userEvent.setup()
    const { services } = makeServices()
    services.startCamera
      .mockRejectedValueOnce(new CameraError(code, 'x'))
      .mockImplementation(async () => ({ stream: {}, track: {}, stop: vi.fn() }))
    render(<ScanFlow services={services} />)
    await toCamera(user)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(title)
    expect(alert).toHaveTextContent(detail)

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: /Live checks/ })).toBeVisible()
    expect(services.startCamera).toHaveBeenCalledTimes(2)
  })

  it('reports the camera being revoked or unplugged mid-scan, and stops the camera', async () => {
    const user = userEvent.setup()
    const { services, ctx } = makeServices()
    render(<ScanFlow services={services} />)
    await toCamera(user)
    await screen.findByRole('heading', { name: /Live checks/ })
    await waitFor(() => expect(ctx.endedCb).toBeTypeOf('function'))

    act(() => ctx.endedCb())
    expect(await screen.findByRole('alert')).toHaveTextContent('The camera stopped')
    expect(ctx.stop).toHaveBeenCalled()
  })

  it('treats a permission change to "denied" as revoked', async () => {
    const user = userEvent.setup()
    const { services, ctx } = makeServices()
    render(<ScanFlow services={services} />)
    await toCamera(user)
    await waitFor(() => expect(ctx.permissionCb).toBeTypeOf('function'))
    act(() => ctx.permissionCb('granted'))
    expect(screen.queryByRole('alert')).toBeNull()
    act(() => ctx.permissionCb('denied'))
    expect(await screen.findByRole('alert')).toHaveTextContent('The camera stopped')
  })

  it('shows a clear error when body detection cannot load, and does not leave the camera on', async () => {
    const user = userEvent.setup()
    const { services, ctx } = makeServices({
      createPoseDetector: vi
        .fn()
        .mockRejectedValue(new Error('The body-detection files could not be downloaded.')),
    })
    render(<ScanFlow services={services} />)
    await toCamera(user)
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be downloaded/)
    await waitFor(() => expect(ctx.stop).toHaveBeenCalled())
  })

  it('releases the camera and the detector when the flow is closed', async () => {
    const user = userEvent.setup()
    const { services, ctx } = makeServices()
    const { unmount } = render(<ScanFlow services={services} />)
    await toCamera(user)
    await screen.findByRole('heading', { name: /Live checks/ })
    await waitFor(() => expect(ctx.close).not.toHaveBeenCalled())
    unmount()
    expect(ctx.stop).toHaveBeenCalled()
    await waitFor(() => expect(ctx.close).toHaveBeenCalled())
  })
})

describe('capture quality gating', () => {
  it('never captures when nobody is in the frame, and says why', async () => {
    const user = userEvent.setup()
    const { services, ctx } = makeServices()
    ctx.poses = () => []
    render(<ScanFlow services={services} />)
    await toCamera(user)
    expect(await screen.findAllByText(/No person detected/)).not.toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Capture now' })).toBeDisabled()
    await new Promise((r) => setTimeout(r, 300))
    expect(services.captureFrame).not.toHaveBeenCalled()
  })

  it('rejects an incomplete body (feet cut off)', async () => {
    const user = userEvent.setup()
    const { services, ctx } = makeServices()
    ctx.poses = () => {
      const p = frontPose()
      for (const i of [27, 28, 29, 30, 31, 32]) p[i] = { x: 0.5, y: 1.05, z: 0, visibility: 0.1 }
      return [p]
    }
    render(<ScanFlow services={services} />)
    await toCamera(user)
    expect((await screen.findAllByText(/feet/)).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Capture now' })).toBeDisabled()
    await new Promise((r) => setTimeout(r, 300))
    expect(services.captureFrame).not.toHaveBeenCalled()
  })

  it('rejects an image that is too dark', async () => {
    const user = userEvent.setup()
    const { services, ctx } = makeServices()
    ctx.image = DARK
    render(<ScanFlow services={services} />)
    await toCamera(user)
    expect((await screen.findAllByText(/Too dark/)).length).toBeGreaterThan(0)
    await new Promise((r) => setTimeout(r, 300))
    expect(services.captureFrame).not.toHaveBeenCalled()
  })

  it('shows the live checklist with text, not colour alone', async () => {
    const user = userEvent.setup()
    const { services, ctx } = makeServices()
    ctx.image = DARK // keeps the scan on this screen with some checks passing and one failing
    render(<ScanFlow services={services} />)
    await toCamera(user)
    expect((await screen.findAllByText(/Passed:/)).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Needs fixing:/).length).toBeGreaterThan(0)
  })

  it('lets a person take the photo with Capture now once everything passes', async () => {
    const user = userEvent.setup()
    const { services } = makeServices()
    render(<ScanFlow services={services} />)
    await toCamera(user)
    const button = screen.getByRole('button', { name: 'Capture now' })
    await waitFor(() => expect(button).toBeEnabled())
    await user.click(button)
    await waitFor(() => expect(services.captureFrame).toHaveBeenCalled())
    expect(await screen.findByRole('heading', { name: /Left side photo \(2 of 4\)/ })).toBeVisible()
  })
})

describe('full flow, review and approval', () => {
  async function toReview(overrides) {
    const user = userEvent.setup()
    const made = makeServices(overrides)
    const onApprove = vi.fn()
    render(<ScanFlow services={made.services} onApprove={onApprove} />)
    await toCamera(user)
    await reviewHeading()
    return { user, onApprove, ...made }
  }

  it('captures all four views automatically and reaches review without sending anything', async () => {
    const { onApprove, services } = await toReview()
    expect(services.captureFrame).toHaveBeenCalledTimes(4)
    expect(screen.getAllByRole('img')).toHaveLength(4)
    expect(onApprove).not.toHaveBeenCalled()
  })

  it('does not hand over the photos until the approval box is ticked and Approve pressed', async () => {
    const { user, onApprove } = await toReview()
    const approve = screen.getByRole('button', { name: 'Approve photos' })
    expect(approve).toBeDisabled()
    await user.click(approve)
    expect(onApprove).not.toHaveBeenCalled()

    await user.click(screen.getByRole('checkbox'))
    await user.click(approve)
    expect(onApprove).toHaveBeenCalledTimes(1)
    const { heightCm, shots } = onApprove.mock.calls[0][0]
    expect(heightCm).toBe(172)
    expect(Object.keys(shots).sort()).toEqual(['back', 'front', 'left', 'right'])
    expect(await screen.findByText(/Photos approved/)).toBeVisible()
  })

  it('without an upload handler, says nothing has left the browser', async () => {
    const user = userEvent.setup()
    render(<ScanFlow services={makeServices().services} />)
    await toCamera(user)
    await reviewHeading()
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Approve photos' }))
    expect(await screen.findByTestId('scan-approved-note')).toHaveTextContent(
      /Nothing has left this browser/,
    )
  })

  it('flags a blurry photo in review instead of hiding it', async () => {
    const { ctx } = { ctx: null }
    expect(ctx).toBeNull()
    const user = userEvent.setup()
    const made = makeServices()
    made.ctx.image = BLURRY
    render(<ScanFlow services={made.services} />)
    await toCamera(user)
    await reviewHeading()
    expect(screen.getAllByText('Flagged')).toHaveLength(4)
    expect(screen.getAllByText(/blurry/).length).toBeGreaterThan(0)
  })

  it('retake returns to that view, then back to review with approval cleared', async () => {
    const { user } = await toReview()
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: /Retake Front photo/ }))
    expect(await screen.findByRole('heading', { name: /Front photo \(1 of 4\)/ })).toBeVisible()
    await reviewHeading()
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Approve photos' })).toBeDisabled()
  })

  it('Delete photos discards everything and returns to the start', async () => {
    const { user } = await toReview()
    await user.click(screen.getByRole('button', { name: 'Delete photos' }))
    expect(screen.getByRole('heading', { name: /Guided body scan/ })).toBeVisible()
    expect(screen.queryAllByRole('img')).toHaveLength(0)
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })
})
