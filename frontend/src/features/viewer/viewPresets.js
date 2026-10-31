/**
 * Pure camera maths for the 3D viewer. No three.js or DOM imports, so it is fully unit-testable.
 *
 * Conventions (match three.js `Spherical` and the sample assets):
 *  - the avatar stands on y = 0, faces +Z, and is orbited around TARGET;
 *  - azimuth 0 = camera on +Z (looking at the front), positive azimuth moves the camera towards +X
 *    (the avatar's left side), polar is measured from +Y (90° = horizontal).
 */

export const TARGET = [0, 0.9, 0]
export const AVATAR_HEIGHT = 1.75

export const degToRad = (deg) => (deg * Math.PI) / 180

export const DEFAULT_POLAR = degToRad(82)
export const DEFAULT_DISTANCE = 3.4
export const MIN_DISTANCE = 1.2
export const MAX_DISTANCE = 6
export const MIN_POLAR = degToRad(20)
export const MAX_POLAR = degToRad(100)
export const ZOOM_FACTOR = 1.25
/** How close (radians) the camera must be to a preset azimuth for that view to count as active. */
export const VIEW_TOLERANCE = degToRad(12)

export const VIEWS = [
  { key: 'front', label: 'Front', azimuth: 0 },
  { key: 'left', label: 'Left', azimuth: degToRad(90) },
  { key: 'back', label: 'Back', azimuth: Math.PI },
  { key: 'right', label: 'Right', azimuth: degToRad(-90) },
]

export const DEFAULT_CAMERA = { azimuth: 0, polar: DEFAULT_POLAR, distance: DEFAULT_DISTANCE }

/** Wrap an angle into (-π, π]. */
export function wrapAngle(angle) {
  const twoPi = Math.PI * 2
  let a = angle % twoPi
  if (a <= -Math.PI) a += twoPi
  if (a > Math.PI) a -= twoPi
  return a
}

/** Signed shortest rotation from `from` to `to`, in (-π, π]. */
export function shortestAngleDelta(from, to) {
  return wrapAngle(to - from)
}

export function viewByKey(key) {
  const view = VIEWS.find((v) => v.key === key)
  if (!view) throw new Error(`Unknown view "${key}"`)
  return view
}

/** The preset whose azimuth is within `tolerance` of `azimuth`, or null while between views. */
export function nearestView(azimuth, tolerance = VIEW_TOLERANCE) {
  let best = null
  let bestDelta = Infinity
  for (const view of VIEWS) {
    const delta = Math.abs(shortestAngleDelta(azimuth, view.azimuth))
    if (delta <= tolerance && delta < bestDelta) {
      best = view.key
      bestDelta = delta
    }
  }
  return best
}

export function clampDistance(distance, min = MIN_DISTANCE, max = MAX_DISTANCE) {
  return Math.min(max, Math.max(min, distance))
}

/** direction: +1 zooms in (closer), -1 zooms out. */
export function zoomedDistance(current, direction) {
  const factor = direction > 0 ? 1 / ZOOM_FACTOR : ZOOM_FACTOR
  return clampDistance(current * factor)
}

/** World position of the camera for an orbit state around `target`. */
export function cameraPosition({ azimuth, polar, distance }, target = TARGET) {
  const sinPolar = Math.sin(polar)
  return [
    target[0] + distance * sinPolar * Math.sin(azimuth),
    target[1] + distance * Math.cos(polar),
    target[2] + distance * sinPolar * Math.cos(azimuth),
  ]
}

/**
 * Where a UI command wants the camera to end up, given where it is now.
 * View and zoom commands keep the user's other settings; reset restores the defaults.
 */
export function goalForCommand(command, current) {
  switch (command.type) {
    case 'view':
      return { ...current, azimuth: viewByKey(command.key).azimuth }
    case 'zoom':
      return { ...current, distance: zoomedDistance(current.distance, command.direction) }
    case 'reset':
      return { ...DEFAULT_CAMERA }
    default:
      return { ...current }
  }
}

/** Exponential-smoothing factor for a frame of `deltaSeconds` (frame-rate independent). */
export function easeFactor(deltaSeconds, rate = 10) {
  return 1 - Math.exp(-Math.max(0, deltaSeconds) * rate)
}

/**
 * One animation step from `current` towards `goal`. Returns the new state and whether it arrived.
 * Azimuth always takes the shortest way round.
 */
export function stepToward(current, goal, factor, epsilon = 0.002) {
  const dAz = shortestAngleDelta(current.azimuth, goal.azimuth)
  const dPolar = goal.polar - current.polar
  const dDist = goal.distance - current.distance
  if (Math.abs(dAz) < epsilon && Math.abs(dPolar) < epsilon && Math.abs(dDist) < epsilon) {
    return { state: { ...goal }, done: true }
  }
  return {
    state: {
      azimuth: wrapAngle(current.azimuth + dAz * factor),
      polar: current.polar + dPolar * factor,
      distance: current.distance + dDist * factor,
    },
    done: false,
  }
}
