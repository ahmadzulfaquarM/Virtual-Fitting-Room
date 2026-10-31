import { describe, expect, it, vi } from 'vitest'
import { fetchBackendHealth, HealthCheckError } from './health'

const okBody = { status: 'ok', service: 'fitting-room-api', version: '0.1.0' }

function jsonResponse(body, init) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

describe('fetchBackendHealth', () => {
  it('returns the parsed body for a valid response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(okBody))
    await expect(fetchBackendHealth(fetchMock)).resolves.toEqual(okBody)
    expect(fetchMock).toHaveBeenCalledWith('/api/health', expect.any(Object))
  })

  it('throws a HealthCheckError on a non-2xx status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, { status: 503 }))
    await expect(fetchBackendHealth(fetchMock)).rejects.toThrow(/HTTP 503/)
  })

  it('rejects a response with an unexpected shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: 'ok' }))
    await expect(fetchBackendHealth(fetchMock)).rejects.toThrow(/unexpected health response/)
  })

  it('reports an unreachable backend on network failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const promise = fetchBackendHealth(fetchMock)
    await expect(promise).rejects.toBeInstanceOf(HealthCheckError)
    await expect(promise).rejects.toThrow(/Could not reach the backend/)
  })

  it('reports a timeout when the request is aborted', async () => {
    const fetchMock = vi.fn(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          )
        }),
    )
    await expect(fetchBackendHealth(fetchMock, 20)).rejects.toThrow(/did not respond within 20 ms/)
  })
})
