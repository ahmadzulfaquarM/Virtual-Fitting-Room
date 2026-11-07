/**
 * Image-level checks (light, contrast, sharpness, backlight) on a small downscaled frame.
 * Independent of pose detection, so a dark or blurry camera is reported even when nobody is found.
 *
 * Thresholds are heuristics checked on synthetic images only. They are NOT validated across real
 * phones, webcams and rooms, and "passes the checks" never means "measurements will be accurate".
 */

export const IMAGE_THRESHOLDS = {
  darkError: 45, // mean luma 0..255
  darkWarning: 70,
  brightWarning: 215,
  brightError: 238,
  minContrast: 28, // standard deviation of luma
  minSharpness: 25, // variance of the Laplacian of luma
  backlitBackground: 160,
  backlitRatio: 0.55,
}

const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b

/**
 * @param {{data: Uint8ClampedArray, width: number, height: number}} image  RGBA pixels
 * @param {{x0:number,y0:number,x1:number,y1:number}|null} [region] normalised subject box
 */
export function analyseImage(image, region = null) {
  const { data, width, height } = image
  const grey = new Float32Array(width * height)
  let sum = 0
  for (let i = 0; i < grey.length; i++) {
    const v = luma(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])
    grey[i] = v
    sum += v
  }
  const mean = sum / grey.length
  let varSum = 0
  for (let i = 0; i < grey.length; i++) varSum += (grey[i] - mean) ** 2
  const contrast = Math.sqrt(varSum / grey.length)

  // Variance of the 4-neighbour Laplacian: low values mean few sharp edges (blur, lens smudge).
  let lapSum = 0
  let lapSq = 0
  let lapN = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      const lap = 4 * grey[i] - grey[i - 1] - grey[i + 1] - grey[i - width] - grey[i + width]
      lapSum += lap
      lapSq += lap * lap
      lapN++
    }
  }
  const sharpness = lapN > 0 ? lapSq / lapN - (lapSum / lapN) ** 2 : 0

  let subject = null
  let background = null
  if (region && region.x1 > region.x0 && region.y1 > region.y0) {
    let sIn = 0
    let nIn = 0
    let sOut = 0
    let nOut = 0
    const x0 = Math.floor(region.x0 * width)
    const x1 = Math.ceil(region.x1 * width)
    const y0 = Math.floor(region.y0 * height)
    const y1 = Math.ceil(region.y1 * height)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const inside = x >= x0 && x < x1 && y >= y0 && y < y1
        if (inside) {
          sIn += grey[y * width + x]
          nIn++
        } else {
          sOut += grey[y * width + x]
          nOut++
        }
      }
    }
    if (nIn > 0 && nOut > 0) {
      subject = sIn / nIn
      background = sOut / nOut
    }
  }
  return { brightness: mean, contrast, sharpness, subject, background, width, height }
}

const item = (id, label, ok, hint, level) => ({ id, label, ok, level, hint: ok ? null : hint })

export function evaluateImage(metrics, t = IMAGE_THRESHOLDS) {
  const b = metrics.brightness
  const dark = b < t.darkError
  const dim = !dark && b < t.darkWarning
  const blown = b > t.brightError
  const bright = !blown && b > t.brightWarning
  const checks = [
    item(
      'light',
      'Enough light',
      !dark && !dim && !blown && !bright,
      dark
        ? 'Too dark. Turn on more lights or face a window.'
        : dim
          ? 'A little dim. More light will give a better result.'
          : blown
            ? 'Overexposed. Reduce direct light on the camera.'
            : 'Very bright. Avoid direct light into the camera.',
      dark || blown ? 'error' : 'warning',
    ),
    item(
      'contrast',
      'Clear contrast with the background',
      metrics.contrast >= t.minContrast,
      'The image looks flat. Stand in front of a plainer, contrasting background.',
      'warning',
    ),
    item(
      'sharp',
      'Sharp image',
      metrics.sharpness >= t.minSharpness,
      'The image looks blurry. Hold still, wipe the camera lens and make sure the room is bright.',
      'warning',
    ),
  ]
  if (metrics.subject !== null && metrics.background !== null) {
    const backlit =
      metrics.background > t.backlitBackground &&
      metrics.subject < metrics.background * t.backlitRatio
    checks.push(
      item(
        'backlight',
        'No strong light behind you',
        !backlit,
        'Strong light is behind you, so your body looks dark. Move away from the window or lamp.',
        'warning',
      ),
    )
  }
  const errors = checks.filter((c) => !c.ok && c.level === 'error')
  const warnings = checks.filter((c) => !c.ok && c.level === 'warning')
  return { checks, ready: errors.length === 0, errors, warnings }
}
