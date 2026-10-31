import { describe, expect, it, vi } from 'vitest'
import {
  AssetError,
  describeAssetError,
  describeRuntimeError,
  validateGlbAsset,
} from './assetCheck'

function glbHeader({ magic = 'glTF', version = 2, length = 100 } = {}) {
  const bytes = new Uint8Array(12)
  const view = new DataView(bytes.buffer)
  for (let i = 0; i < 4; i++) bytes[i] = magic.charCodeAt(i)
  view.setUint32(4, version, true)
  view.setUint32(8, length, true)
  return bytes
}

const response = (body, init = {}) =>
  new Response(body, { status: 200, headers: { 'content-type': 'model/gltf-binary' }, ...init })

const run = (fetchImpl, options) => validateGlbAsset('/models/x.glb', { fetchImpl, ...options })

describe('validateGlbAsset', () => {
  it('accepts a binary glTF 2.0 header', async () => {
    await expect(run(vi.fn().mockResolvedValue(response(glbHeader())))).resolves.toEqual({
      ok: true,
    })
  })

  it('only requests the first 12 bytes', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(glbHeader()))
    await run(fetchImpl)
    expect(fetchImpl.mock.calls[0][1].headers.Range).toBe('bytes=0-11')
  })

  it('reports a 404 as missing', async () => {
    const error = await run(vi.fn().mockResolvedValue(response('nope', { status: 404 }))).catch(
      (e) => e,
    )
    expect(error).toBeInstanceOf(AssetError)
    expect(error.code).toBe('missing')
    expect(error.status).toBe(404)
  })

  it('treats an HTML fallback page as a missing file (SPA hosts answer 200)', async () => {
    const html = response('<!doctype html>', { headers: { 'content-type': 'text/html' } })
    const error = await run(vi.fn().mockResolvedValue(html)).catch((e) => e)
    expect(error.code).toBe('missing')
    expect(error.message).toMatch(/web page/)
  })

  it('rejects a file that is not a GLB', async () => {
    const error = await run(
      vi.fn().mockResolvedValue(response(glbHeader({ magic: 'PK\u0003\u0004' }))),
    ).catch((e) => e)
    expect(error.code).toBe('invalid')
    expect(error.message).toMatch(/not a binary glTF/)
  })

  it('rejects glTF 1.0', async () => {
    const error = await run(vi.fn().mockResolvedValue(response(glbHeader({ version: 1 })))).catch(
      (e) => e,
    )
    expect(error.code).toBe('invalid')
    expect(error.message).toMatch(/version 1/)
  })

  it('rejects an empty or truncated file', async () => {
    const error = await run(vi.fn().mockResolvedValue(response(new Uint8Array(5)))).catch((e) => e)
    expect(error.code).toBe('invalid')
    expect(error.message).toMatch(/empty or truncated/)
  })

  it('maps HTTP 416 (empty file on a range request) to invalid', async () => {
    const error = await run(vi.fn().mockResolvedValue(response('', { status: 416 }))).catch(
      (e) => e,
    )
    expect(error.code).toBe('invalid')
  })

  it('reports other HTTP failures', async () => {
    const error = await run(vi.fn().mockResolvedValue(response('', { status: 503 }))).catch(
      (e) => e,
    )
    expect(error.code).toBe('http')
    expect(error.status).toBe(503)
  })

  it('reports network failures', async () => {
    const error = await run(vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))).catch(
      (e) => e,
    )
    expect(error.code).toBe('network')
  })

  it('times out when the server never answers', async () => {
    const hang = (_url, init) =>
      new Promise((_resolve, reject) =>
        init.signal.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        ),
      )
    const error = await run(hang, { timeoutMs: 20 }).catch((e) => e)
    expect(error.code).toBe('timeout')
  })

  it('propagates a caller abort instead of reporting an asset error', async () => {
    const controller = new AbortController()
    const hang = (_url, init) =>
      new Promise((_resolve, reject) =>
        init.signal.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        ),
      )
    const promise = run(hang, { signal: controller.signal })
    controller.abort()
    const error = await promise.catch((e) => e)
    expect(error).not.toBeInstanceOf(AssetError)
    expect(error.name).toBe('AbortError')
  })
})

describe('error descriptions', () => {
  it('give specific, readable messages per failure type', () => {
    const missing = describeAssetError(
      new AssetError('missing', 'x', { url: '/models/a.glb' }),
      'Avatar',
    )
    expect(missing.title).toBe('Avatar not found')
    expect(missing.detail).toContain('/models/a.glb')

    expect(describeAssetError(new AssetError('invalid', 'Bad header.'), 'Avatar').title).toMatch(
      /not a valid 3D model/,
    )
    expect(describeAssetError(new AssetError('network', 'x'), 'Avatar').detail).toMatch(
      /internet connection/,
    )
    expect(describeAssetError(new AssetError('timeout', 'Too slow.'), 'Garment').title).toMatch(
      /too long/,
    )
    expect(describeAssetError(new AssetError('http', 'HTTP 500.'), 'Garment').title).toMatch(
      /could not be loaded/,
    )
  })

  it('handles unexpected errors', () => {
    expect(describeAssetError(new Error('boom')).detail).toBe('boom')
    expect(describeAssetError('weird').detail).toBe('Unknown error.')
    expect(describeRuntimeError(new Error('bad mesh')).detail).toBe('bad mesh')
    expect(describeRuntimeError(null).detail).toBe('Unknown rendering error.')
  })
})
