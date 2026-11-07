import { SCAN_VIEWS } from './captureConfig'

/**
 * State machine for the whole scan flow. Pure: no camera, no timers, no object URLs.
 * Invalid transitions return the same state, so the UI cannot skip a step (for example it cannot
 * approve a scan that is missing a view or that has not been explicitly confirmed).
 *
 * steps: intro -> height -> camera -> review -> approved
 *
 * A shot is { viewKey, blob, width, height, capturedAt, warnings: [{id,hint}] }. Shots with
 * blocking errors are never created: the camera step refuses to capture them.
 */
export const initialScanState = {
  step: 'intro',
  consent: false,
  heightCm: null,
  shots: {},
  viewKey: SCAN_VIEWS[0].key,
  approvalChecked: false,
}

const keys = SCAN_VIEWS.map((v) => v.key)
const firstMissing = (shots) => keys.find((k) => !shots[k]) ?? null

export function scanReducer(state, action) {
  switch (action.type) {
    case 'SET_CONSENT':
      return state.step === 'intro' ? { ...state, consent: !!action.value } : state

    case 'CONTINUE_FROM_INTRO':
      return state.step === 'intro' && state.consent ? { ...state, step: 'height' } : state

    case 'SET_HEIGHT': {
      const cm = action.cm
      if (state.step !== 'height' || !Number.isFinite(cm)) return state
      return {
        ...state,
        heightCm: cm,
        step: 'camera',
        viewKey: firstMissing(state.shots) ?? keys[0],
      }
    }

    case 'SHOT_CAPTURED': {
      const { shot } = action
      if (state.step !== 'camera' || !shot || !keys.includes(shot.viewKey)) return state
      if (shot.viewKey !== state.viewKey) return state // only the view currently being asked for
      const shots = { ...state.shots, [shot.viewKey]: shot }
      const next = firstMissing(shots)
      return next
        ? { ...state, shots, viewKey: next }
        : { ...state, shots, step: 'review', approvalChecked: false }
    }

    case 'RETAKE': {
      if (state.step !== 'review' || !keys.includes(action.viewKey)) return state
      const { [action.viewKey]: _removed, ...rest } = state.shots
      return {
        ...state,
        shots: rest,
        step: 'camera',
        viewKey: action.viewKey,
        approvalChecked: false,
      }
    }

    case 'SET_APPROVAL_CHECKED':
      return state.step === 'review' ? { ...state, approvalChecked: !!action.value } : state

    case 'APPROVE':
      if (state.step !== 'review' || !state.approvalChecked || firstMissing(state.shots) !== null)
        return state
      return { ...state, step: 'approved' }

    case 'BACK':
      if (state.step === 'height') return { ...state, step: 'intro' }
      if (state.step === 'camera') return { ...state, step: 'height' }
      if (state.step === 'review') return { ...state, step: 'height', approvalChecked: false }
      return state

    case 'DISCARD':
      return initialScanState

    default:
      return state
  }
}

export const capturedCount = (state) => keys.filter((k) => state.shots[k]).length
export const allCaptured = (state) => firstMissing(state.shots) === null
