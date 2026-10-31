import { useEffect, useState } from 'react'
import { fetchBackendHealth } from '../services/health'
import { Badge, Button, Card } from './ui'

const defaultCheck = () => fetchBackendHealth()

/**
 * Shows frontend/backend status.
 *
 * @param {Object} props
 * @param {() => Promise<import('../services/health').BackendHealth>} [props.check]
 *   Injectable for tests. Must have a stable identity across renders (the default is a
 *   module-level function) or the effect below would re-run on every render.
 */
export function HealthStatus({ check = defaultCheck }) {
  const [state, setState] = useState({ phase: 'loading' })
  // Incrementing this re-runs the effect, which performs the check.
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false

    check().then(
      (health) => {
        if (!cancelled) setState({ phase: 'ok', health })
      },
      (error) => {
        if (!cancelled) {
          setState({
            phase: 'error',
            message: error instanceof Error ? error.message : 'Unknown error.',
          })
        }
      },
    )

    return () => {
      cancelled = true
    }
  }, [check, attempt])

  const recheck = () => {
    setState({ phase: 'loading' })
    setAttempt((n) => n + 1)
  }

  return (
    <Card aria-labelledby="health-heading">
      <h2 id="health-heading" className="mb-3 text-lg font-semibold">
        System status
      </h2>

      <ul className="mb-4 divide-y divide-slate-200">
        <li className="flex items-center justify-between py-3">
          <span>Frontend</span>
          <Badge tone="success" data-testid="frontend-status">
            Running
          </Badge>
        </li>
        <li className="flex items-center justify-between py-3">
          <span>Backend API</span>
          {state.phase === 'loading' && (
            <Badge tone="warning" role="status">
              Checking…
            </Badge>
          )}
          {state.phase === 'ok' && (
            <Badge tone="success" data-testid="backend-status">
              Healthy (v{state.health.version})
            </Badge>
          )}
          {state.phase === 'error' && (
            <Badge tone="danger" data-testid="backend-status">
              Unavailable
            </Badge>
          )}
        </li>
      </ul>

      {state.phase === 'error' && (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-red-700/20 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {state.message}
        </p>
      )}

      <Button variant="secondary" onClick={recheck} disabled={state.phase === 'loading'}>
        Re-check
      </Button>
    </Card>
  )
}
