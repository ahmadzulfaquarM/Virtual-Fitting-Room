import { describe, expect, it } from 'vitest'
import { SCAN_VIEWS } from './captureConfig'
import { allCaptured, capturedCount, initialScanState, scanReducer } from './scanReducer'

const shot = (viewKey) => ({
  viewKey,
  blob: new Blob(['x']),
  width: 640,
  height: 480,
  warnings: [],
})
const reduce = (...actions) => actions.reduce(scanReducer, initialScanState)
const toCamera = () =>
  reduce(
    { type: 'SET_CONSENT', value: true },
    { type: 'CONTINUE_FROM_INTRO' },
    { type: 'SET_HEIGHT', cm: 172 },
  )
const toReview = () =>
  SCAN_VIEWS.reduce(
    (s, v) => scanReducer(s, { type: 'SHOT_CAPTURED', shot: shot(v.key) }),
    toCamera(),
  )

describe('scanReducer', () => {
  it('starts on the intro and cannot continue without consent', () => {
    expect(initialScanState.step).toBe('intro')
    expect(reduce({ type: 'CONTINUE_FROM_INTRO' }).step).toBe('intro')
    expect(reduce({ type: 'SET_CONSENT', value: true }, { type: 'CONTINUE_FROM_INTRO' }).step).toBe(
      'height',
    )
  })

  it('needs a valid height before the camera step', () => {
    const atHeight = reduce({ type: 'SET_CONSENT', value: true }, { type: 'CONTINUE_FROM_INTRO' })
    expect(scanReducer(atHeight, { type: 'SET_HEIGHT', cm: NaN })).toBe(atHeight)
    expect(scanReducer(initialScanState, { type: 'SET_HEIGHT', cm: 170 })).toBe(initialScanState)
    expect(scanReducer(atHeight, { type: 'SET_HEIGHT', cm: 172 })).toMatchObject({
      step: 'camera',
      heightCm: 172,
    })
  })

  it('walks through the views in order and then reviews', () => {
    let s = toCamera()
    expect(s.viewKey).toBe(SCAN_VIEWS[0].key)
    for (const [i, v] of SCAN_VIEWS.entries()) {
      expect(s.viewKey).toBe(v.key)
      s = scanReducer(s, { type: 'SHOT_CAPTURED', shot: shot(v.key) })
      expect(capturedCount(s)).toBe(i + 1)
    }
    expect(s.step).toBe('review')
    expect(allCaptured(s)).toBe(true)
  })

  it('ignores a shot for a view that is not being captured, or outside the camera step', () => {
    const s = toCamera()
    expect(scanReducer(s, { type: 'SHOT_CAPTURED', shot: shot('back') })).toBe(s)
    expect(scanReducer(s, { type: 'SHOT_CAPTURED', shot: shot('nonsense') })).toBe(s)
    expect(scanReducer(initialScanState, { type: 'SHOT_CAPTURED', shot: shot('front') })).toBe(
      initialScanState,
    )
  })

  it('cannot approve without the explicit confirmation', () => {
    const s = toReview()
    expect(scanReducer(s, { type: 'APPROVE' })).toBe(s)
    const checked = scanReducer(s, { type: 'SET_APPROVAL_CHECKED', value: true })
    expect(scanReducer(checked, { type: 'APPROVE' }).step).toBe('approved')
  })

  it('cannot approve while a view is missing', () => {
    const s = scanReducer(toReview(), { type: 'RETAKE', viewKey: 'back' })
    expect(s.step).toBe('camera')
    expect(
      scanReducer({ ...s, step: 'review', approvalChecked: true }, { type: 'APPROVE' }).step,
    ).toBe('review')
  })

  it('retake removes only that shot, returns to the camera for that view and clears approval', () => {
    let s = scanReducer(toReview(), { type: 'SET_APPROVAL_CHECKED', value: true })
    s = scanReducer(s, { type: 'RETAKE', viewKey: 'left' })
    expect(s).toMatchObject({ step: 'camera', viewKey: 'left', approvalChecked: false })
    expect(Object.keys(s.shots).sort()).toEqual(['back', 'front', 'right'])
    s = scanReducer(s, { type: 'SHOT_CAPTURED', shot: shot('left') })
    expect(s.step).toBe('review')
    expect(s.approvalChecked).toBe(false)
  })

  it('back moves one step and drops approval', () => {
    expect(
      reduce(
        { type: 'SET_CONSENT', value: true },
        { type: 'CONTINUE_FROM_INTRO' },
        { type: 'BACK' },
      ).step,
    ).toBe('intro')
    expect(scanReducer(toCamera(), { type: 'BACK' }).step).toBe('height')
    expect(
      scanReducer(scanReducer(toReview(), { type: 'SET_APPROVAL_CHECKED', value: true }), {
        type: 'BACK',
      }),
    ).toMatchObject({ step: 'height', approvalChecked: false })
  })

  it('discard returns to a clean start with no shots, height or consent', () => {
    expect(scanReducer(toReview(), { type: 'DISCARD' })).toEqual(initialScanState)
  })

  it('ignores unknown actions', () => {
    expect(scanReducer(initialScanState, { type: 'NOPE' })).toBe(initialScanState)
  })
})
