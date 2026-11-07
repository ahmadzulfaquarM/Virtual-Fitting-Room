import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { HealthStatus } from './components/HealthStatus'
import App from './App'
import { HealthCheckError } from './services/health'

// The real viewer needs WebGL; it has its own tests (features/viewer) and a browser e2e test.
vi.mock('./features/viewer/Viewer', () => ({
  Viewer: ({ avatarUrl, garmentUrl }) => (
    <div data-testid="viewer-stub" data-avatar={avatarUrl} data-garment={garmentUrl} />
  ),
}))

const healthy = { status: 'ok', service: 'fitting-room-api', version: '0.1.0' }

describe('App', () => {
  it('renders the title, the viewer with the sample assets, and the not-built notice', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    render(<App />)
    expect(
      screen.getByRole('heading', { level: 1, name: /3D Virtual Fitting Room/i }),
    ).toBeVisible()
    expect(screen.getByText(/Nothing on this page reconstructs your body/i)).toBeVisible()
    const viewer = screen.getByTestId('viewer-stub')
    expect(viewer).toHaveAttribute('data-avatar', '/models/avatar.glb')
    expect(viewer).toHaveAttribute('data-garment', '/models/garment.glb')
    vi.unstubAllGlobals()
  })
})

describe('HealthStatus', () => {
  it('shows a checking state and then a healthy backend', async () => {
    render(<HealthStatus check={() => Promise.resolve(healthy)} />)
    expect(screen.getByRole('status')).toHaveTextContent(/checking/i)
    await waitFor(() => expect(screen.getByTestId('backend-status')).toHaveTextContent(/healthy/i))
    expect(screen.getByTestId('frontend-status')).toHaveTextContent(/running/i)
  })

  it('shows an understandable error when the backend is unavailable', async () => {
    render(
      <HealthStatus
        check={() => Promise.reject(new HealthCheckError('Could not reach the backend.'))}
      />,
    )
    await waitFor(() =>
      expect(screen.getByTestId('backend-status')).toHaveTextContent(/unavailable/i),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/Could not reach the backend/)
  })

  it('re-runs the check when Re-check is pressed', async () => {
    const check = vi
      .fn()
      .mockRejectedValueOnce(new HealthCheckError('down'))
      .mockResolvedValueOnce(healthy)
    render(<HealthStatus check={check} />)
    await waitFor(() =>
      expect(screen.getByTestId('backend-status')).toHaveTextContent(/unavailable/i),
    )

    await userEvent.click(screen.getByRole('button', { name: /re-check/i }))
    await waitFor(() => expect(screen.getByTestId('backend-status')).toHaveTextContent(/healthy/i))
    expect(check).toHaveBeenCalledTimes(2)
  })
})
