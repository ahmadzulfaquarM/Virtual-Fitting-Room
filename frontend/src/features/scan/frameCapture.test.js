import { describe, expect, it, vi } from 'vitest'
import { captureFrame, sampleFrame } from './frameCapture'

function fakeDoc({ blob = new Blob(['jpg']) } = {}) {
  const ctx = {
    drawImage: vi.fn(),
    getImageData: vi.fn((x, y, w, h) => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(w * h * 4),
    })),
  }
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ctx),
    toBlob: vi.fn((cb, type, q) => cb(blob, type, q)),
  }
  return { doc: { createElement: vi.fn(() => canvas) }, canvas, ctx }
}

describe('sampleFrame', () => {
  it('returns null before the video has dimensions', () => {
    expect(sampleFrame({ videoWidth: 0, videoHeight: 0 }, 192, fakeDoc().doc)).toBeNull()
  })
  it('downscales keeping the aspect ratio', () => {
    const { doc, ctx } = fakeDoc()
    const video = { videoWidth: 1280, videoHeight: 720 }
    const image = sampleFrame(video, 192, doc)
    expect(image.width).toBe(192)
    expect(image.height).toBe(108)
    expect(ctx.drawImage).toHaveBeenCalledWith(video, 0, 0, 192, 108)
  })
})

describe('captureFrame', () => {
  it('rejects before the video has dimensions', async () => {
    await expect(
      captureFrame({ videoWidth: 0, videoHeight: 0 }, { doc: fakeDoc().doc }),
    ).rejects.toThrow(/not produced a picture/)
  })
  it('draws the raw video at full size (no mirroring) and returns a JPEG blob', async () => {
    const { doc, canvas, ctx } = fakeDoc()
    const video = { videoWidth: 1280, videoHeight: 720 }
    const result = await captureFrame(video, { quality: 0.8, doc })
    expect(canvas.width).toBe(1280)
    expect(canvas.height).toBe(720)
    expect(ctx.drawImage).toHaveBeenCalledWith(video, 0, 0, 1280, 720)
    expect(ctx).not.toHaveProperty('scale')
    expect(canvas.toBlob.mock.calls[0].slice(1)).toEqual(['image/jpeg', 0.8])
    expect(result).toMatchObject({ width: 1280, height: 720 })
    expect(result.blob).toBeInstanceOf(Blob)
  })
  it('rejects if the browser cannot encode', async () => {
    await expect(
      captureFrame({ videoWidth: 10, videoHeight: 10 }, { doc: fakeDoc({ blob: null }).doc }),
    ).rejects.toThrow(/Could not save/)
  })
})
