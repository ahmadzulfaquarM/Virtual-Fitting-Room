import { describe, expect, it, vi } from 'vitest'
import {
  CameraError,
  classifyCameraError,
  describeCameraError,
  getCameraSupport,
  startCamera,
  watchCameraPermission,
  watchStream,
} from './cameraService'

const domError = (name, message = name) => Object.assign(new Error(message), { name })

function fakeStream({ tracks = 1 } = {}) {
  const list = Array.from({ length: tracks }, () => {
    const listeners = new Set()
    return {
      stop: vi.fn(),
      addEventListener: (_t, fn) => listeners.add(fn),
      removeEventListener: (_t, fn) => listeners.delete(fn),
      fire: () => listeners.forEach((fn) => fn()),
      listeners,
    }
  })
  return { getVideoTracks: () => list, getTracks: () => list, list }
}

const envWith = (getUserMedia, extra = {}) => ({
  isSecureContext: true,
  navigator: { mediaDevices: { getUserMedia }, ...extra },
})

describe('getCameraSupport', () => {
  it('supported with a secure context and getUserMedia', () => {
    expect(getCameraSupport(envWith(vi.fn()))).toMatchObject({ supported: true })
  })
  it('insecure context is reported first, with the https hint', () => {
    const r = getCameraSupport({ ...envWith(vi.fn()), isSecureContext: false })
    expect(r).toMatchObject({ supported: false, code: 'insecure' })
    expect(r.message).toMatch(/https/)
  })
  it.each([
    ['no navigator', { isSecureContext: true, navigator: undefined }],
    ['no mediaDevices', { isSecureContext: true, navigator: {} }],
    ['no getUserMedia', { isSecureContext: true, navigator: { mediaDevices: {} } }],
  ])('unsupported browser: %s', (_n, env) => {
    expect(getCameraSupport(env)).toMatchObject({ supported: false, code: 'unsupported' })
  })
})

describe('classifyCameraError', () => {
  it.each([
    ['NotAllowedError', 'denied'],
    ['PermissionDeniedError', 'denied'],
    ['SecurityError', 'denied'],
    ['NotFoundError', 'not-found'],
    ['DevicesNotFoundError', 'not-found'],
    ['OverconstrainedError', 'not-found'],
    ['NotReadableError', 'in-use'],
    ['TrackStartError', 'in-use'],
    ['AbortError', 'aborted'],
    ['WeirdError', 'unknown'],
  ])('%s -> %s', (name, code) => expect(classifyCameraError(domError(name))).toBe(code))
  it('handles non-errors', () => {
    expect(classifyCameraError(undefined)).toBe('unknown')
    expect(classifyCameraError(null)).toBe('unknown')
  })
})

describe('startCamera', () => {
  it('opens the camera with preferred constraints and returns a stoppable handle', async () => {
    const stream = fakeStream()
    const gum = vi.fn().mockResolvedValue(stream)
    const cam = await startCamera({ facingMode: 'environment', env: envWith(gum) })
    expect(gum).toHaveBeenCalledOnce()
    expect(gum.mock.calls[0][0]).toMatchObject({
      audio: false,
      video: { facingMode: { ideal: 'environment' } },
    })
    expect(cam.track).toBe(stream.list[0])
    cam.stop()
    expect(stream.list[0].stop).toHaveBeenCalled()
  })

  it('never asks for audio', async () => {
    const gum = vi.fn().mockResolvedValue(fakeStream())
    await startCamera({ env: envWith(gum) })
    expect(gum.mock.calls[0][0].audio).toBe(false)
  })

  it.each([
    ['NotAllowedError', 'denied'],
    ['NotFoundError', 'not-found'],
    ['NotReadableError', 'in-use'],
    ['AbortError', 'aborted'],
    ['Strange', 'unknown'],
  ])('%s becomes CameraError(%s)', async (name, code) => {
    const gum = vi.fn().mockRejectedValue(domError(name))
    const error = await startCamera({ env: envWith(gum) }).catch((e) => e)
    expect(error).toBeInstanceOf(CameraError)
    expect(error.code).toBe(code)
    expect(gum).toHaveBeenCalledOnce() // only overconstrained errors are retried
  })

  it('retries once with plain video when constraints cannot be met', async () => {
    const stream = fakeStream()
    const gum = vi
      .fn()
      .mockRejectedValueOnce(domError('OverconstrainedError'))
      .mockResolvedValueOnce(stream)
    const cam = await startCamera({ env: envWith(gum) })
    expect(gum).toHaveBeenCalledTimes(2)
    expect(gum.mock.calls[1][0]).toEqual({ video: true, audio: false })
    expect(cam.stream).toBe(stream)
  })

  it('reports the retry failure if the fallback is also refused', async () => {
    const gum = vi
      .fn()
      .mockRejectedValueOnce(domError('OverconstrainedError'))
      .mockRejectedValueOnce(domError('NotAllowedError'))
    const error = await startCamera({ env: envWith(gum) }).catch((e) => e)
    expect(error.code).toBe('denied')
  })

  it('throws unsupported/insecure without touching getUserMedia', async () => {
    const gum = vi.fn()
    const insecure = await startCamera({ env: { ...envWith(gum), isSecureContext: false } }).catch(
      (e) => e,
    )
    expect(insecure.code).toBe('insecure')
    const none = await startCamera({ env: { isSecureContext: true, navigator: {} } }).catch(
      (e) => e,
    )
    expect(none.code).toBe('unsupported')
    expect(gum).not.toHaveBeenCalled()
  })

  it('stops the stream and fails if there is no video track', async () => {
    const stream = fakeStream({ tracks: 0 })
    const stop = vi.fn()
    stream.getTracks = () => [{ stop }]
    const error = await startCamera({ env: envWith(vi.fn().mockResolvedValue(stream)) }).catch(
      (e) => e,
    )
    expect(error.code).toBe('not-found')
    expect(stop).toHaveBeenCalled()
  })
})

describe('describeCameraError', () => {
  it('gives denied guidance that tells the user how to recover', () => {
    const d = describeCameraError(new CameraError('denied', 'x'))
    expect(d).toMatchObject({ code: 'denied', canRetry: true })
    expect(d.detail).toMatch(/browser settings/)
  })
  it('classifies raw DOM errors too', () => {
    expect(describeCameraError(domError('NotFoundError')).title).toBe('No camera found')
  })
  it('does not offer retry when retry cannot help', () => {
    expect(describeCameraError(new CameraError('unsupported', 'msg'))).toMatchObject({
      canRetry: false,
      detail: 'msg',
    })
    expect(describeCameraError(new CameraError('insecure', 'msg')).canRetry).toBe(false)
  })
})

describe('watchStream', () => {
  it('calls back when the camera track ends and can be unsubscribed', () => {
    const stream = fakeStream()
    const onEnded = vi.fn()
    const off = watchStream(stream, onEnded)
    stream.list[0].fire()
    expect(onEnded).toHaveBeenCalledOnce()
    off()
    expect(stream.list[0].listeners.size).toBe(0)
    stream.list[0].fire()
    expect(onEnded).toHaveBeenCalledOnce()
  })
})

describe('watchCameraPermission', () => {
  const setup = (state = 'granted') => {
    const listeners = new Set()
    const status = {
      state,
      addEventListener: (_t, fn) => listeners.add(fn),
      removeEventListener: (_t, fn) => listeners.delete(fn),
    }
    const env = { navigator: { permissions: { query: vi.fn().mockResolvedValue(status) } } }
    const change = (next) => {
      status.state = next
      listeners.forEach((fn) => fn())
    }
    return { env, listeners, change }
  }
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

  it('reports permission changes, for example revoked in browser settings', async () => {
    const { env, change } = setup()
    const onChange = vi.fn()
    watchCameraPermission(onChange, env)
    await flush()
    change('denied')
    expect(onChange).toHaveBeenCalledWith('denied')
    change('granted')
    expect(onChange).toHaveBeenLastCalledWith('granted')
    expect(env.navigator.permissions.query).toHaveBeenCalledWith({ name: 'camera' })
  })

  it('stops listening when unsubscribed, even before the query resolves', async () => {
    const a = setup()
    const off = watchCameraPermission(vi.fn(), a.env)
    await flush()
    off()
    expect(a.listeners.size).toBe(0)

    const b = setup()
    const onChange = vi.fn()
    const offEarly = watchCameraPermission(onChange, b.env)
    offEarly()
    await flush()
    expect(b.listeners.size).toBe(0)
  })

  it('is a harmless no-op where the Permissions API is missing or rejects "camera"', async () => {
    expect(() => watchCameraPermission(vi.fn(), { navigator: {} })()).not.toThrow()
    const env = {
      navigator: { permissions: { query: vi.fn().mockRejectedValue(new TypeError('bad name')) } },
    }
    const off = watchCameraPermission(vi.fn(), env)
    await flush()
    expect(() => off()).not.toThrow()
  })
})
