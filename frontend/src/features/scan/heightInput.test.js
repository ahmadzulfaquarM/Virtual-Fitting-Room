import { describe, expect, it } from 'vitest'
import { MAX_HEIGHT_CM, MIN_HEIGHT_CM, cmToFeetInches, parseHeight } from './heightInput'

const cm = (value) => parseHeight({ unit: 'cm', cm: value })
const ftin = (ft, inch) => parseHeight({ unit: 'ftin', ft, inch })

describe('parseHeight (cm)', () => {
  it.each([
    ['172', 172],
    [' 172 ', 172],
    ['172,5', 172.5],
    ['172.54', 172.5],
    [165, 165],
    [String(MIN_HEIGHT_CM), MIN_HEIGHT_CM],
    [String(MAX_HEIGHT_CM), MAX_HEIGHT_CM],
  ])('accepts %s', (input, expected) => {
    expect(cm(input)).toEqual({ ok: true, cm: expected })
  })

  it.each([
    ['empty', ''],
    ['words', 'tall'],
    ['scientific notation', '1e3'],
    ['negative', '-170'],
    ['two numbers', '170 180'],
    ['infinity', Infinity],
    ['null', null],
  ])('rejects %s as not a number', (_name, input) => {
    const result = cm(input)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/centimetres/)
  })

  it.each(['99', '99.9', '231', '5000', '0'])('rejects implausible height %s', (input) => {
    const result = cm(input)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/between 100 and 230/)
  })
})

describe('parseHeight (feet and inches)', () => {
  it('converts 5 ft 9 in', () => {
    expect(ftin('5', '9')).toEqual({ ok: true, cm: 175.3 })
  })

  it('treats empty inches as 0', () => {
    expect(ftin('6', '')).toEqual({ ok: true, cm: 182.9 })
  })

  it('rejects bad input', () => {
    expect(ftin('', '9').ok).toBe(false)
    expect(ftin('5.5', '0').error).toMatch(/whole feet/)
    expect(ftin('5', '12').error).toMatch(/between 0 and 11.9/)
    expect(ftin('5', 'x').ok).toBe(false)
    expect(ftin('2', '0').error).toMatch(/between 100 and 230/)
    expect(ftin('9', '0').error).toMatch(/between 100 and 230/)
  })
})

describe('cmToFeetInches', () => {
  it('round-trips common heights', () => {
    expect(cmToFeetInches(175.3)).toEqual({ ft: 5, inch: 9 })
    expect(cmToFeetInches(182.88)).toEqual({ ft: 6, inch: 0 })
  })

  it('never returns 12 inches', () => {
    expect(cmToFeetInches(182.8).inch).toBeLessThan(12)
  })
})
