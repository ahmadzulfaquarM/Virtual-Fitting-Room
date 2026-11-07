import { describe, expect, it, vi } from 'vitest'
import { PoseModelError, createPoseDetector, pickMainPose } from './poseDetector'

const box = (x0, y0, x1, y1) => [
  { x: x0, y: y0 },
  { x: x1, y: y1 },
]

describe('pickMainPose', () => {
  it('returns null when nobody is detected', () => {
    expect(pickMainPose([])).toBeNull()
    expect(pickMainPose(null)).toBeNull()
  })
  it('returns the only pose', () => {
    const only = box(0.4, 0.1, 0.6, 0.9)
    expect(pickMainPose([only])).toBe(only)
  })
  it('prefers the larger body, regardless of order', () => {
    const near = box(0.3, 0.05, 0.7, 0.95)
    const far = box(0.8, 0.4, 0.9, 0.6)
    expect(pickMainPose([far, near])).toBe(near)
    expect(pickMainPose([near, far])).toBe(near)
  })
})

describe('createPoseDetector preflight', () => {
  const response = (ok, type = 'application/octet-stream') => ({
    ok,
    headers: { get: () => type },
  })

  it('fails with a clear message when the network is down', async () => {
    const error = await createPoseDetector({
      fetchImpl: vi.fn().mockRejectedValue(new TypeError('offline')),
    }).catch((e) => e)
    expect(error).toBeInstanceOf(PoseModelError)
    expect(error.message).toMatch(/could not be downloaded/)
  })

  it('fails when the model is missing (404)', async () => {
    const error = await createPoseDetector({
      fetchImpl: vi.fn().mockResolvedValue(response(false)),
    }).catch((e) => e)
    expect(error).toBeInstanceOf(PoseModelError)
    expect(error.message).toMatch(/missing from the server/)
  })

  it('treats the SPA fallback page (HTML with 200) as missing', async () => {
    const error = await createPoseDetector({
      fetchImpl: vi.fn().mockResolvedValue(response(true, 'text/html')),
    }).catch((e) => e)
    expect(error).toBeInstanceOf(PoseModelError)
    expect(error.message).toMatch(/npm install/)
  })
})
