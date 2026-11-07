/**
 * Decides, from body landmarks, whether a frame is good enough to capture for a given view.
 *
 * IMPORTANT: this checks that the person is visible, framed, facing the right way and still.
 * It does NOT measure anything and says nothing about how accurate any body measurement will be.
 * Pure functions only (no DOM, no MediaPipe), so every rule is unit-tested with synthetic poses.
 *
 * Landmarks follow MediaPipe's 33-point BlazePose layout: { x, y, z, visibility } with x and y
 * normalised to the frame (0..1). "Left"/"right" are the SUBJECT's left and right, so a person
 * facing the camera has their left shoulder on the right-hand side of the (unmirrored) image.
 */

export const LM = {
  NOSE: 0,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT: 31,
  RIGHT_FOOT: 32,
}

/** Heuristic thresholds. Tuned on synthetic poses only, NOT validated on real people or devices. */
export const THRESHOLDS = {
  minVisibility: 0.5,
  frameMargin: 0.01, // landmarks closer than this to the edge count as cut off
  minBodyFraction: 0.55, // nose-to-foot height as a fraction of frame height
  maxBodyFraction: 0.9,
  centreMin: 0.3,
  centreMax: 0.7,
  frontShoulderRatio: 0.45, // shoulder width / torso length: face-on is ~0.8, side-on is ~0.1-0.3
  sideShoulderRatio: 0.4,
  maxShoulderTiltDeg: 12,
  minArmGap: 0.25, // wrist-to-hip gap as a fraction of shoulder width
  maxMotion: 0.015, // movement over the stillness window, as a fraction of frame height
}

/** Display order of the checklist (also used to show "waiting" rows before a person is found). */
export const CHECK_LABELS = [
  { id: 'person', label: 'Person detected' },
  { id: 'single', label: 'Only one person in view' },
  { id: 'visible', label: 'Whole body in frame' },
  { id: 'distance', label: 'Good distance from the camera' },
  { id: 'centred', label: 'Centred in the frame' },
  { id: 'orientation', label: 'Correct pose direction' },
  { id: 'facing', label: 'Correct way round' },
  { id: 'upright', label: 'Standing straight' },
  { id: 'arms', label: 'Arms clear of the body' },
  { id: 'still', label: 'Holding still' },
]

const GROUPS = [
  { name: 'head', indices: [LM.NOSE] },
  { name: 'shoulders', indices: [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER] },
  { name: 'hips', indices: [LM.LEFT_HIP, LM.RIGHT_HIP] },
  { name: 'knees', indices: [LM.LEFT_KNEE, LM.RIGHT_KNEE] },
  { name: 'feet', indices: [LM.LEFT_ANKLE, LM.RIGHT_ANKLE, LM.LEFT_FOOT, LM.RIGHT_FOOT] },
]

const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

function isFound(point, t = THRESHOLDS) {
  return (
    !!point &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    (point.visibility ?? 0) >= t.minVisibility &&
    point.x >= t.frameMargin &&
    point.x <= 1 - t.frameMargin &&
    point.y >= t.frameMargin &&
    point.y <= 1 - t.frameMargin
  )
}

const check = (id, ok, hint, level = 'error') => ({
  id,
  label: CHECK_LABELS.find((c) => c.id === id).label,
  ok,
  level,
  hint: ok ? null : hint,
})

/** Which body parts are missing, cut off or too uncertain to trust. */
export function missingParts(landmarks, orientation, t = THRESHOLDS) {
  // Side-on, the far shoulder/hip/knee/foot is legitimately hidden: one visible point per pair is enough.
  const needBoth = orientation !== 'side'
  const missing = []
  for (const group of GROUPS) {
    const found = group.indices.filter((i) => isFound(landmarks[i], t)).length
    const required = needBoth && group.indices.length === 2 ? 2 : 1
    if (found < required) missing.push(group.name)
  }
  return missing
}

/** Nose-to-lowest-foot height as a fraction of the frame height, or null when unknown. */
export function bodyFraction(landmarks) {
  const nose = landmarks[LM.NOSE]
  const foot = [
    LM.LEFT_ANKLE,
    LM.RIGHT_ANKLE,
    LM.LEFT_HEEL,
    LM.RIGHT_HEEL,
    LM.LEFT_FOOT,
    LM.RIGHT_FOOT,
  ]
    .map((i) => landmarks[i])
    .filter(Boolean)
  if (!nose || foot.length === 0) return null
  return Math.max(...foot.map((p) => p.y)) - nose.y
}

/** Normalised bounding box of the points that are reliably found, or null. */
export function bodyBox(landmarks, t = THRESHOLDS) {
  const pts = landmarks.filter((p) => p && (p.visibility ?? 0) >= t.minVisibility)
  if (pts.length === 0) return null
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  return {
    x0: Math.max(0, Math.min(...xs)),
    y0: Math.max(0, Math.min(...ys)),
    x1: Math.min(1, Math.max(...xs)),
    y1: Math.min(1, Math.max(...ys)),
  }
}

/**
 * @param {object} input
 * @param {Array|null} input.landmarks  the main person's 33 landmarks, or null when nobody is found
 * @param {number} [input.personCount]  how many people the detector found
 * @param {{orientation: 'front'|'back'|'side', sideOf?: 'left'|'right'}} input.view
 * @param {number} input.aspect         frame width / height (so horizontal and vertical distances compare)
 * @param {number|null} [input.motion]  from PoseStabilityTracker; null = not enough history yet
 * @returns {{checks: object[], ready: boolean, errors: object[], warnings: object[]}}
 */
export function evaluatePose(
  { landmarks, personCount = 1, view, aspect, motion = null },
  t = THRESHOLDS,
) {
  if (!landmarks || landmarks.length < 33) {
    return finish([
      check('person', false, 'No person detected. Step into the frame so the camera can see you.'),
    ])
  }
  const checks = [check('person', true)]
  checks.push(
    check(
      'single',
      personCount <= 1,
      'More than one person is in view. Only you should be in the frame.',
    ),
  )

  const missing = missingParts(landmarks, view.orientation, t)
  checks.push(
    check(
      'visible',
      missing.length === 0,
      `Cannot see your ${missing.join(', ')}. Step back until your whole body, head to feet, fits in the frame.`,
    ),
  )

  const fraction = bodyFraction(landmarks)
  const tooSmall = fraction !== null && fraction < t.minBodyFraction
  const tooBig = fraction !== null && fraction > t.maxBodyFraction
  checks.push(
    check(
      'distance',
      fraction !== null && !tooSmall && !tooBig,
      tooSmall
        ? 'You are too far away. Move closer to the camera.'
        : 'You are too close. Step back from the camera.',
    ),
  )

  const hipMid = mid(landmarks[LM.LEFT_HIP], landmarks[LM.RIGHT_HIP])
  checks.push(
    check(
      'centred',
      hipMid.x >= t.centreMin && hipMid.x <= t.centreMax,
      'Move towards the middle of the frame.',
    ),
  )

  const ls = landmarks[LM.LEFT_SHOULDER]
  const rs = landmarks[LM.RIGHT_SHOULDER]
  const shoulderMid = mid(ls, rs)
  const shoulderSpan = Math.abs(ls.x - rs.x) * aspect
  const torso = Math.hypot((shoulderMid.x - hipMid.x) * aspect, shoulderMid.y - hipMid.y)
  const ratio = torso > 1e-6 ? shoulderSpan / torso : 0

  checks.push(checkOrientation(view, ratio, t))
  const facing = facingCheck(view, ratio, landmarks, shoulderMid, t)
  if (facing) checks.push(facing)

  if (view.orientation !== 'side') {
    const tilt = Math.abs((Math.atan2(rs.y - ls.y, (rs.x - ls.x) * aspect) * 180) / Math.PI)
    const tiltFromFlat = Math.min(tilt, 180 - tilt)
    checks.push(
      check(
        'upright',
        tiltFromFlat <= t.maxShoulderTiltDeg,
        'Stand straight: your shoulders look tilted.',
        'warning',
      ),
    )
    checks.push(armsCheck(landmarks, shoulderSpan, aspect, t))
  }

  checks.push(
    check(
      'still',
      motion !== null && motion <= t.maxMotion,
      motion === null ? 'Hold still…' : 'Hold still. Movement makes the photo blurry.',
    ),
  )
  return finish(checks)
}

function checkOrientation(view, ratio, t) {
  if (view.orientation === 'side') {
    return check(
      'orientation',
      ratio <= t.sideShoulderRatio,
      'Turn side-on: your shoulders should line up behind each other.',
    )
  }
  return check(
    'orientation',
    ratio >= t.frontShoulderRatio,
    view.orientation === 'front'
      ? 'Turn to face the camera squarely.'
      : 'Turn your back squarely to the camera.',
  )
}

/**
 * Front vs back, and which side is towards the camera, from MediaPipe's left/right labels.
 * WARNING ONLY: on a faceless mannequin the model gave identical left/right ordering for front
 * and back, and this has not been verified with real people, so it must never block a capture.
 */
function facingCheck(view, ratio, landmarks, shoulderMid, t) {
  const ls = landmarks[LM.LEFT_SHOULDER]
  const rs = landmarks[LM.RIGHT_SHOULDER]
  if (view.orientation === 'side') {
    const nose = landmarks[LM.NOSE]
    if (!nose || Math.abs(nose.x - shoulderMid.x) < 0.01) return null
    // Left side towards the camera <=> the person faces image-left (geometry, not yet confirmed).
    const facesImageLeft = nose.x < shoulderMid.x
    return check(
      'facing',
      facesImageLeft === (view.sideOf === 'left'),
      `Turn the other way so your ${view.sideOf.toUpperCase()} side faces the camera.`,
      'warning',
    )
  }
  if (ratio < t.frontShoulderRatio) return null // not face-on: the blocking orientation check reports it
  const facingCamera = ls.x > rs.x // subject's left shoulder is on the image's right when facing the camera
  const wantFront = view.orientation === 'front'
  return check(
    'facing',
    facingCamera === wantFront,
    wantFront
      ? 'It looks like your back is towards the camera. Face the camera.'
      : 'It looks like you are facing the camera. Turn around so your back faces it.',
    'warning',
  )
}

function armsCheck(landmarks, shoulderSpan, aspect, t) {
  const pairs = [
    [landmarks[LM.LEFT_WRIST], landmarks[LM.LEFT_HIP]],
    [landmarks[LM.RIGHT_WRIST], landmarks[LM.RIGHT_HIP]],
  ]
  const usable = pairs.filter(([w]) => (w?.visibility ?? 0) >= t.minVisibility)
  if (usable.length === 0 || shoulderSpan <= 1e-6) return check('arms', true)
  const tooClose = usable.some(
    ([w, h]) => Math.abs(w.x - h.x) * aspect < t.minArmGap * shoulderSpan,
  )
  return check(
    'arms',
    !tooClose,
    'Move your arms slightly away from your sides so your torso is visible.',
    'warning',
  )
}

function finish(checks) {
  const errors = checks.filter((c) => !c.ok && c.level === 'error')
  const warnings = checks.filter((c) => !c.ok && c.level === 'warning')
  return {
    checks,
    ready: errors.length === 0 && checks.some((c) => c.id === 'person' && c.ok),
    errors,
    warnings,
  }
}

/**
 * Measures how much the key body points moved over a short window, so "hold still" is based on
 * data. Returns null until it has enough history.
 */
export class PoseStabilityTracker {
  constructor({ windowMs = 700, minSamples = 3, maxAgeMs = 4000, aspect = 4 / 3 } = {}) {
    this.windowMs = windowMs
    this.maxAgeMs = maxAgeMs
    this.minSamples = minSamples
    this.aspect = aspect
    this.samples = []
  }

  push(timestampMs, landmarks) {
    if (!landmarks) {
      this.samples = []
      return
    }
    const keys = [
      LM.NOSE,
      LM.LEFT_SHOULDER,
      LM.RIGHT_SHOULDER,
      LM.LEFT_HIP,
      LM.RIGHT_HIP,
      LM.LEFT_KNEE,
      LM.RIGHT_KNEE,
    ]
    this.samples.push({
      t: timestampMs,
      points: keys.map((i) => ({ x: landmarks[i].x, y: landmarks[i].y })),
    })
    // Normally keep `windowMs` of history. On a slow device (few detections per second) keep at
    // least `minSamples` so "hold still" can still be judged, but never anything older than maxAgeMs.
    const cutoff = timestampMs - this.windowMs
    while (this.samples.length > this.minSamples && this.samples[0].t < cutoff) this.samples.shift()
    while (this.samples.length > 0 && this.samples[0].t < timestampMs - this.maxAgeMs) {
      this.samples.shift()
    }
  }

  /** Mean range of movement of the tracked points over the window (fraction of frame height). */
  motion() {
    if (this.samples.length < this.minSamples) return null
    const span = this.samples[this.samples.length - 1].t - this.samples[0].t
    if (span < this.windowMs * 0.6) return null
    const n = this.samples[0].points.length
    let total = 0
    for (let k = 0; k < n; k++) {
      const xs = this.samples.map((s) => s.points[k].x * this.aspect)
      const ys = this.samples.map((s) => s.points[k].y)
      total += Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
    }
    return total / n
  }

  reset() {
    this.samples = []
  }
}
