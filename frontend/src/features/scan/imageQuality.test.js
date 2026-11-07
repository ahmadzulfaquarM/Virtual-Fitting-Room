import { describe, expect, it } from 'vitest'
import { analyseImage, evaluateImage } from './imageQuality'

const W = 64
const H = 48

function image(fn) {
  const data = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = fn(x, y)
      const i = (y * W + x) * 4
      data[i] = data[i + 1] = data[i + 2] = v
      data[i + 3] = 255
    }
  }
  return { data, width: W, height: H }
}

const checker = (lo, hi) => image((x, y) => ((x + y) % 2 ? hi : lo))
const ids = (result) => result.checks.filter((c) => !c.ok).map((c) => c.id)
const run = (img, region) => evaluateImage(analyseImage(img, region))

describe('image quality', () => {
  it('accepts a bright, contrasty, sharp image', () => {
    const result = run(checker(60, 190))
    expect(result.ready).toBe(true)
    expect(ids(result)).toEqual([])
  })

  it('rejects a dark image', () => {
    const result = run(checker(5, 40))
    expect(result.ready).toBe(false)
    expect(result.checks.find((c) => c.id === 'light').hint).toMatch(/Too dark/)
  })

  it('warns, without blocking, about a dim image', () => {
    const result = run(checker(40, 90))
    expect(result.ready).toBe(true)
    expect(result.warnings.map((w) => w.id)).toContain('light')
  })

  it('rejects an overexposed image', () => {
    const result = run(checker(235, 255))
    expect(result.ready).toBe(false)
    expect(result.checks.find((c) => c.id === 'light').hint).toMatch(/Overexposed/)
  })

  it('warns about a very bright image', () => {
    const result = run(checker(200, 240))
    expect(result.ready).toBe(true)
    expect(result.checks.find((c) => c.id === 'light').hint).toMatch(/Very bright/)
  })

  it('flags a flat, featureless image (low contrast and no edges)', () => {
    const result = run(image(() => 128))
    expect(ids(result)).toEqual(expect.arrayContaining(['contrast', 'sharp']))
  })

  it('flags a blurry image: smooth gradient has contrast but no sharp edges', () => {
    const result = run(image((x) => 40 + (x / W) * 160))
    expect(ids(result)).toEqual(['sharp'])
    expect(result.ready).toBe(true) // blur is a flag, not a hard block
  })

  it('measures what it claims to measure', () => {
    const m = analyseImage(image(() => 100))
    expect(m.brightness).toBeCloseTo(100, 5)
    expect(m.contrast).toBeCloseTo(0, 5)
    expect(m.sharpness).toBeCloseTo(0, 5)
    expect(analyseImage(checker(0, 255)).sharpness).toBeGreaterThan(1000)
  })

  describe('backlight', () => {
    const region = { x0: 0.3, y0: 0.1, x1: 0.7, y1: 0.9 }
    const scene = (inside, outside) =>
      image(
        (x, y) =>
          (x >= W * 0.3 && x < W * 0.7 && y >= H * 0.1 && y < H * 0.9 ? inside : outside) +
          ((x + y) % 2) * 10,
      )

    it('flags a dark subject against a bright background', () => {
      expect(ids(run(scene(50, 230), region))).toContain('backlight')
    })

    it('does not flag an evenly lit scene', () => {
      expect(ids(run(scene(130, 140), region))).not.toContain('backlight')
    })

    it('skips the check without a subject region', () => {
      expect(run(scene(50, 230)).checks.some((c) => c.id === 'backlight')).toBe(false)
    })
  })
})
