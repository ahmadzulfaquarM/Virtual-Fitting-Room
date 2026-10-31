import { config } from '../config'

/**
 * @typedef {Object} BackendHealth
 * @property {'ok'} status
 * @property {string} service
 * @property {string} version
 */

export class HealthCheckError extends Error {
  constructor(message, options) {
    super(message, options)
    this.name = 'HealthCheckError'
  }
}

function isBackendHealth(value) {
  if (typeof value !== 'object' || value === null) return false
  return (
    value.status === 'ok' && typeof value.service === 'string' && typeof value.version === 'string'
  )
}

/**
 * Calls GET {apiBaseUrl}/health and validates the response shape.
 * Throws HealthCheckError with a user-presentable message on any failure.
 *
 * @param {typeof fetch} [fetchImpl] injectable for tests
 * @param {number} [timeoutMs]
 * @returns {Promise<BackendHealth>}
 */
export async function fetchBackendHealth(fetchImpl = fetch, timeoutMs = config.healthTimeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchImpl(`${config.apiBaseUrl}/health`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) {
      throw new HealthCheckError(`Backend responded with HTTP ${response.status}.`)
    }

    const body = await response.json()
    if (!isBackendHealth(body)) {
      throw new HealthCheckError('Backend returned an unexpected health response.')
    }
    return body
  } catch (error) {
    if (error instanceof HealthCheckError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new HealthCheckError(`Backend did not respond within ${timeoutMs} ms.`, {
        cause: error,
      })
    }
    throw new HealthCheckError('Could not reach the backend. Is it running?', { cause: error })
  } finally {
    clearTimeout(timer)
  }
}
