import { describe, expect, it } from 'vitest'
import { createAutoCapture } from './autoCapture'

describe('createAutoCapture', () => {
  it('stays idle while the frame is not ready', () => {
    const a = createAutoCapture()
    expect(a.update(false, 0)).toEqual({ phase: 'idle', secondsLeft: null, cancelled: false })
  })

  it('holds for 1 s, counts down 3-2-1, then fires', () => {
    const a = createAutoCapture()
    expect(a.update(true, 0).phase).toBe('hold')
    expect(a.update(true, 999).phase).toBe('hold')
    expect(a.update(true, 1000)).toMatchObject({ phase: 'countdown', secondsLeft: 3 })
    expect(a.update(true, 2100)).toMatchObject({ phase: 'countdown', secondsLeft: 2 })
    expect(a.update(true, 3100)).toMatchObject({ phase: 'countdown', secondsLeft: 1 })
    expect(a.update(true, 4000).phase).toBe('fire')
  })

  it('cancels the countdown the moment a check fails and reports it', () => {
    const a = createAutoCapture()
    a.update(true, 0)
    a.update(true, 1000)
    const result = a.update(false, 2000)
    expect(result).toEqual({ phase: 'idle', secondsLeft: null, cancelled: true })
    expect(a.update(true, 2100).phase).toBe('hold') // starts over, not mid-countdown
  })

  it('does not report cancellation when only holding', () => {
    const a = createAutoCapture()
    a.update(true, 0)
    expect(a.update(false, 500).cancelled).toBe(false)
  })

  it('starts again after firing', () => {
    const a = createAutoCapture({ holdMs: 0, countdownMs: 1000 })
    a.update(true, 0)
    expect(a.update(true, 1000).phase).toBe('fire')
    expect(a.update(true, 1001).phase).not.toBe('fire')
  })
})
