import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Viewer } from './Viewer'

// jsdom has no WebGL, so the canvas is replaced by a stub that records what the viewer asks of it.
const canvasProps = vi.hoisted(() => ({ latest: null }))
const webgl = vi.hoisted(() => ({ available: true }))

vi.mock('./webgl', () => ({ isWebGLAvailable: () => webgl.available }))
vi.mock('./modelCache', () => ({ clearModelCache: vi.fn() }))
vi.mock('./ViewerCanvas', async () => {
  const { useEffect } = await import('react')
  return {
    default: function StubCanvas(props) {
      canvasProps.latest = props
      useEffect(() => {
        props.onReady()
      }, [props.onReady, props])
      return <div data-testid="canvas-stub" />
    },
  }
})

const glb = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 12, 0, 0, 0])

function stubFetch(routes) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) => {
      const route = routes[url]
      if (route === 'network') throw new TypeError('Failed to fetch')
      if (route === 'ok') {
        return new Response(glb, { status: 200, headers: { 'content-type': 'model/gltf-binary' } })
      }
      return new Response('nope', { status: route ?? 404 })
    }),
  )
}

const renderViewer = (props) =>
  render(
    <Viewer
      avatarUrl="/a.glb"
      garmentUrl="/g.glb"
      avatarLabel="Avatar"
      garmentLabel="Garment"
      {...props}
    />,
  )

beforeEach(() => {
  webgl.available = true
  canvasProps.latest = null
})
afterEach(() => vi.unstubAllGlobals())

describe('Viewer', () => {
  it('shows a loading state, then the canvas, with controls enabled', async () => {
    stubFetch({ '/a.glb': 'ok', '/g.glb': 'ok' })
    renderViewer()
    expect(screen.getByRole('status')).toHaveTextContent(/checking 3d assets/i)
    expect(await screen.findByTestId('canvas-stub')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Front' })).toBeEnabled())
    expect(canvasProps.latest.avatarUrl).toBe('/a.glb')
    expect(canvasProps.latest.garmentUrl).toBe('/g.glb')
  })

  it('shows a clear error and a retry button when the avatar is missing', async () => {
    stubFetch({ '/a.glb': 404, '/g.glb': 'ok' })
    renderViewer()
    expect(await screen.findByRole('alert')).toHaveTextContent(/Avatar not found/)
    expect(screen.queryByTestId('canvas-stub')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Front' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('retry re-checks the avatar and recovers once it exists', async () => {
    stubFetch({ '/a.glb': 404, '/g.glb': 'ok' })
    renderViewer()
    await screen.findByRole('alert')
    stubFetch({ '/a.glb': 'ok', '/g.glb': 'ok' })
    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByTestId('canvas-stub')).toBeInTheDocument()
  })

  it('reports a network failure for the avatar', async () => {
    stubFetch({ '/a.glb': 'network', '/g.glb': 'ok' })
    renderViewer()
    expect(await screen.findByRole('alert')).toHaveTextContent(/internet connection/i)
  })

  it('keeps the avatar usable when only the garment is missing', async () => {
    stubFetch({ '/a.glb': 'ok', '/g.glb': 404 })
    renderViewer()
    expect(await screen.findByTestId('canvas-stub')).toBeInTheDocument()
    expect(await screen.findByText(/Garment not found/)).toBeInTheDocument()
    expect(screen.getByText(/avatar is shown without it/i)).toBeInTheDocument()
    expect(canvasProps.latest.garmentUrl).toBeNull()
    expect(screen.getByRole('button', { name: /show garment/i })).toBeDisabled()
  })

  it('works without a garment at all', async () => {
    stubFetch({ '/a.glb': 'ok' })
    renderViewer({ garmentUrl: null })
    expect(await screen.findByTestId('canvas-stub')).toBeInTheDocument()
    expect(screen.queryByText(/not found/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /show garment/i })).toBeDisabled()
  })

  it('explains when WebGL is unavailable and downloads nothing', async () => {
    webgl.available = false
    stubFetch({ '/a.glb': 'ok', '/g.glb': 'ok' })
    renderViewer()
    expect(await screen.findByRole('alert')).toHaveTextContent(/not supported here/i)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('forwards toolbar actions to the canvas as commands', async () => {
    stubFetch({ '/a.glb': 'ok', '/g.glb': 'ok' })
    renderViewer()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled())

    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(canvasProps.latest.command).toMatchObject({ type: 'view', key: 'back' })
    await userEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(canvasProps.latest.command).toMatchObject({ type: 'zoom', direction: 1 })
    await userEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    expect(canvasProps.latest.command).toMatchObject({ type: 'zoom', direction: -1 })
    await userEvent.click(screen.getByRole('button', { name: 'Reset view' }))
    expect(canvasProps.latest.command).toMatchObject({ type: 'reset' })
  })

  it('toggles auto-rotate and garment visibility', async () => {
    stubFetch({ '/a.glb': 'ok', '/g.glb': 'ok' })
    renderViewer()
    await waitFor(() => expect(screen.getByRole('button', { name: /show garment/i })).toBeEnabled())
    expect(canvasProps.latest.autoRotate).toBe(false)
    expect(canvasProps.latest.showGarment).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: 'Auto-rotate' }))
    expect(canvasProps.latest.autoRotate).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: /show garment/i }))
    expect(canvasProps.latest.showGarment).toBe(false)
  })

  it('highlights the view matching the camera and none between views', async () => {
    stubFetch({ '/a.glb': 'ok', '/g.glb': 'ok' })
    renderViewer()
    await screen.findByTestId('canvas-stub')
    const { act } = await import('@testing-library/react')

    act(() => canvasProps.latest.onCameraChange({ azimuth: Math.PI, distance: 3 }))
    expect(screen.getByRole('button', { name: 'Back' })).toHaveAttribute('aria-pressed', 'true')

    act(() => canvasProps.latest.onCameraChange({ azimuth: 0.78, distance: 3 }))
    for (const name of ['Front', 'Left', 'Back', 'Right']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false')
    }
  })

  it('shows a recoverable message when the graphics context is lost', async () => {
    stubFetch({ '/a.glb': 'ok', '/g.glb': 'ok' })
    renderViewer()
    await screen.findByTestId('canvas-stub')
    const { act } = await import('@testing-library/react')
    act(() => canvasProps.latest.onContextLost())
    expect(await screen.findByRole('alert')).toHaveTextContent(/interrupted/i)
    expect(screen.getByRole('button', { name: /reload viewer/i })).toBeInTheDocument()
  })

  it('always labels the content as sample assets, not a body scan', async () => {
    stubFetch({ '/a.glb': 'ok', '/g.glb': 'ok' })
    renderViewer()
    expect(screen.getByText(/not a body scan/i)).toBeInTheDocument()
    expect(screen.getByText(/say nothing about fit/i)).toBeInTheDocument()
  })
})
