/**
 * Timing for hands-free capture: the frame must be ready continuously for `holdMs`, then a
 * `countdownMs` countdown runs, and the photo is taken when it ends. Any failed check cancels it.
 * Pure (time is passed in), so it is tested with a fake clock.
 */
export function createAutoCapture({ holdMs = 1000, countdownMs = 3000 } = {}) {
  let readySince = null
  let countdownStart = null

  return {
    /**
     * @param {boolean} ready  all blocking checks pass right now
     * @param {number} now     timestamp in ms
     * @returns {{phase: 'idle'|'hold'|'countdown'|'fire', secondsLeft: number|null, cancelled: boolean}}
     */
    update(ready, now) {
      if (!ready) {
        const cancelled = countdownStart !== null
        readySince = null
        countdownStart = null
        return { phase: 'idle', secondsLeft: null, cancelled }
      }
      if (readySince === null) readySince = now
      if (countdownStart === null) {
        if (now - readySince < holdMs) return { phase: 'hold', secondsLeft: null, cancelled: false }
        countdownStart = now
      }
      const elapsed = now - countdownStart
      if (elapsed >= countdownMs) {
        readySince = null
        countdownStart = null
        return { phase: 'fire', secondsLeft: 0, cancelled: false }
      }
      return {
        phase: 'countdown',
        secondsLeft: Math.ceil((countdownMs - elapsed) / 1000),
        cancelled: false,
      }
    },
    reset() {
      readySince = null
      countdownStart = null
    },
  }
}
