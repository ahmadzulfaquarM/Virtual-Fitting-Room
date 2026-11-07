export const MIN_HEIGHT_CM = 100
export const MAX_HEIGHT_CM = 230
const CM_PER_INCH = 2.54

const round1 = (n) => Math.round(n * 10) / 10

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN
  if (typeof value !== 'string') return NaN
  const trimmed = value.trim().replace(',', '.')
  // Number('') is 0 and Number('1e3') is 1000: accept plain decimal numbers only.
  return /^\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : NaN
}

const fail = (error) => ({ ok: false, error })

/**
 * Validates a self-reported height. Returns { ok: true, cm } or { ok: false, error }.
 * The height is only a calibration hint for later phases; it is never verified here.
 *
 * @param {{unit: 'cm'|'ftin', cm?: string|number, ft?: string|number, inch?: string|number}} input
 */
export function parseHeight(input) {
  let cm
  if (input.unit === 'ftin') {
    const ft = toNumber(input.ft)
    const inch = input.inch === '' || input.inch == null ? 0 : toNumber(input.inch)
    if (Number.isNaN(ft)) return fail('Enter your height in feet, for example 5.')
    if (!Number.isInteger(ft)) return fail('Enter whole feet, then inches in the next box.')
    if (Number.isNaN(inch)) return fail('Enter inches as a number, for example 9.')
    if (inch < 0 || inch >= 12) return fail('Inches must be between 0 and 11.9.')
    cm = round1((ft * 12 + inch) * CM_PER_INCH)
  } else {
    const value = toNumber(input.cm)
    if (Number.isNaN(value)) return fail('Enter your height in centimetres, for example 172.')
    cm = round1(value)
  }
  if (!Number.isFinite(cm) || cm < MIN_HEIGHT_CM || cm > MAX_HEIGHT_CM) {
    return fail(
      `Height must be between ${MIN_HEIGHT_CM} and ${MAX_HEIGHT_CM} cm (about 3'3" to 7'7").`,
    )
  }
  return { ok: true, cm }
}

export function cmToFeetInches(cm) {
  const totalInches = cm / CM_PER_INCH
  let ft = Math.floor(totalInches / 12)
  let inch = Math.round((totalInches - ft * 12) * 10) / 10
  if (inch >= 12) {
    ft += 1
    inch = 0
  }
  return { ft, inch }
}
