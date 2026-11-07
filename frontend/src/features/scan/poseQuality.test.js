import { describe, expect, it } from 'vitest'
import { ASPECT, VIEW, frontPose, sidePose, withPoint } from './testPoses'
import {
  CHECK_LABELS,
  LM,
  PoseStabilityTracker,
  bodyBox,
  bodyFraction,
  evaluatePose,
  missingParts,
} from './poseQuality'

const run = (landmarks, view = VIEW.front, extra = {}) =>
  evaluatePose({ landmarks, view, aspect: ASPECT, motion: 0.004, ...extra })
const failing = (result) => result.checks.filter((c) => !c.ok).map((c) => c.id)
const hint = (result, id) => result.checks.find((c) => c.id === id)?.hint

describe('evaluatePose: good poses', () => {
  it('accepts a well-framed front pose that holds still', () => {
    const result = run(frontPose())
    expect(result.ready).toBe(true)
    expect(result.errors).toEqual([])
    expect(failing(result)).toEqual([])
  })

  it('accepts a back pose with the same framing', () => {
    // Face-on geometry but with left/right swapped, as for a back view.
    const pose = frontPose()
    ;[pose[LM.LEFT_SHOULDER], pose[LM.RIGHT_SHOULDER]] = [
      pose[LM.RIGHT_SHOULDER],
      pose[LM.LEFT_SHOULDER],
    ]
    expect(run(pose, VIEW.back).ready).toBe(true)
  })

  it.each([
    ['left', 'left'],
    ['right', 'right'],
  ])('accepts a side-on %s pose even though the far side is hidden', (view, facing) => {
    const result = run(sidePose({ facing: view === 'left' ? 'left' : 'right' }), VIEW[view])
    expect(result.errors).toEqual([])
    expect(result.ready).toBe(true)
    expect(facing).toBeTruthy()
  })

  it('every check has a label from the shared checklist', () => {
    const ids = new Set(CHECK_LABELS.map((c) => c.id))
    for (const c of run(frontPose()).checks) expect(ids.has(c.id)).toBe(true)
  })
})

describe('evaluatePose: invalid poses are rejected with guidance', () => {
  it('no person', () => {
    const result = run(null)
    expect(result.ready).toBe(false)
    expect(failing(result)).toEqual(['person'])
    expect(hint(result, 'person')).toMatch(/No person detected/)
  })

  it('too few landmarks counts as no person', () => {
    expect(run([{ x: 0.5, y: 0.5, visibility: 1 }]).ready).toBe(false)
  })

  it('two people', () => {
    const result = run(frontPose(), VIEW.front, { personCount: 2 })
    expect(result.ready).toBe(false)
    expect(hint(result, 'single')).toMatch(/More than one person/)
  })

  it('feet cut off at the bottom of the frame', () => {
    let pose = frontPose()
    for (const i of [
      LM.LEFT_ANKLE,
      LM.RIGHT_ANKLE,
      LM.LEFT_HEEL,
      LM.RIGHT_HEEL,
      LM.LEFT_FOOT,
      LM.RIGHT_FOOT,
    ]) {
      pose = withPoint(pose, i, 0.5, 1.05, 0.2)
    }
    const result = run(pose)
    expect(result.ready).toBe(false)
    expect(hint(result, 'visible')).toMatch(/feet/)
    expect(hint(result, 'visible')).toMatch(/Step back/)
  })

  it('head cut off at the top', () => {
    const result = run(withPoint(frontPose(), LM.NOSE, 0.5, -0.05, 0.3))
    expect(result.ready).toBe(false)
    expect(hint(result, 'visible')).toMatch(/head/)
  })

  it('one ankle clipped by the edge in a front view', () => {
    const result = run(withPoint(frontPose(), LM.LEFT_ANKLE, 0.55, 0.998, 0.9))
    expect(missingParts(withPoint(frontPose(), LM.LEFT_ANKLE, 0.55, 0.998, 0.9), 'front')).toEqual(
      [],
    )
    // other foot points are still fine, so the feet group counts as found; the body is still usable
    expect(result.errors.map((e) => e.id)).not.toContain('visible')
  })

  it('low-visibility landmarks are not trusted', () => {
    const result = run(withPoint(frontPose(), LM.LEFT_KNEE, 0.55, 0.72, 0.2))
    expect(result.ready).toBe(false)
    expect(hint(result, 'visible')).toMatch(/knees/)
  })

  it('too far from the camera', () => {
    let pose = withPoint(frontPose(), LM.NOSE, 0.5, 0.4)
    for (const i of [
      LM.LEFT_ANKLE,
      LM.RIGHT_ANKLE,
      LM.LEFT_HEEL,
      LM.RIGHT_HEEL,
      LM.LEFT_FOOT,
      LM.RIGHT_FOOT,
    ]) {
      pose = withPoint(pose, i, 0.5, 0.8)
    }
    const result = run(pose)
    expect(result.ready).toBe(false)
    expect(hint(result, 'distance')).toMatch(/too far/)
  })

  it('too close to the camera', () => {
    let pose = withPoint(frontPose(), LM.NOSE, 0.5, 0.03)
    pose = withPoint(pose, LM.LEFT_FOOT, 0.56, 0.97)
    const result = run(pose)
    expect(bodyFraction(pose)).toBeGreaterThan(0.9)
    expect(result.ready).toBe(false)
    expect(hint(result, 'distance')).toMatch(/too close/)
  })

  it('off to one side', () => {
    let pose = frontPose()
    for (const i of [LM.LEFT_HIP, LM.RIGHT_HIP])
      pose = withPoint(pose, i, i === LM.LEFT_HIP ? 0.88 : 0.8, 0.52)
    const result = run(pose)
    expect(result.ready).toBe(false)
    expect(hint(result, 'centred')).toMatch(/middle/)
  })

  it('side-on when the front view is requested', () => {
    const result = run(sidePose(), VIEW.front)
    expect(result.ready).toBe(false)
    expect(hint(result, 'orientation')).toMatch(/face the camera/)
  })

  it('front-on when a side view is requested', () => {
    const result = run(frontPose(), VIEW.left)
    expect(result.ready).toBe(false)
    expect(hint(result, 'orientation')).toMatch(/side-on/)
  })

  it('face-on when the back view is requested is only rejected if it is not squarely back-on', () => {
    expect(run(sidePose(), VIEW.back).ready).toBe(false)
    expect(hint(run(sidePose(), VIEW.back), 'orientation')).toMatch(/back squarely/)
  })

  it('movement blocks capture and asks the person to hold still', () => {
    const moving = run(frontPose(), VIEW.front, { motion: 0.06 })
    expect(moving.ready).toBe(false)
    expect(hint(moving, 'still')).toMatch(/Hold still/)
    const unknown = run(frontPose(), VIEW.front, { motion: null })
    expect(unknown.ready).toBe(false)
  })
})

describe('evaluatePose: warnings flag a shot without blocking it', () => {
  it('arms pressed against the body', () => {
    let pose = withPoint(frontPose(), LM.LEFT_WRIST, 0.55, 0.5)
    pose = withPoint(pose, LM.RIGHT_WRIST, 0.45, 0.5)
    const result = run(pose)
    expect(result.ready).toBe(true)
    expect(result.warnings.map((w) => w.id)).toContain('arms')
  })

  it('tilted shoulders', () => {
    const result = run(withPoint(frontPose(), LM.LEFT_SHOULDER, 0.58, 0.31))
    expect(result.ready).toBe(true)
    expect(result.warnings.map((w) => w.id)).toContain('upright')
  })

  it('back to camera when the front is requested is a warning only (unverified on real people)', () => {
    const swapped = frontPose()
    ;[swapped[LM.LEFT_SHOULDER], swapped[LM.RIGHT_SHOULDER]] = [
      swapped[LM.RIGHT_SHOULDER],
      swapped[LM.LEFT_SHOULDER],
    ]
    const result = run(swapped, VIEW.front)
    expect(result.ready).toBe(true)
    expect(result.warnings.map((w) => w.id)).toContain('facing')
  })

  it('wrong side towards the camera is a warning only', () => {
    const result = run(sidePose({ facing: 'right' }), VIEW.left)
    expect(result.ready).toBe(true)
    expect(hint(result, 'facing')).toMatch(/LEFT side/)
  })
})

describe('geometry helpers', () => {
  it('bodyFraction is nose to lowest foot point', () => {
    expect(bodyFraction(frontPose())).toBeCloseTo(0.93 - 0.12, 5)
  })

  it('bodyBox ignores unreliable points', () => {
    const box = bodyBox(withPoint(frontPose(), LM.LEFT_WRIST, 0.99, 0.5, 0.1))
    expect(box.x1).toBeLessThan(0.7)
    expect(bodyBox([{ x: 0.5, y: 0.5, visibility: 0.1 }])).toBeNull()
  })
})

describe('PoseStabilityTracker', () => {
  const feed = (tracker, count, stepMs, move = 0) => {
    for (let i = 0; i < count; i++) {
      tracker.push(i * stepMs, withPoint(frontPose(), LM.NOSE, 0.5 + (i % 2) * move, 0.12))
    }
  }

  it('has no answer until it has enough history', () => {
    const t = new PoseStabilityTracker()
    expect(t.motion()).toBeNull()
    feed(t, 2, 100)
    expect(t.motion()).toBeNull()
  })

  it('reports ~0 motion for a steady person', () => {
    const t = new PoseStabilityTracker()
    feed(t, 10, 100)
    expect(t.motion()).toBeCloseTo(0, 6)
  })

  it('reports large motion for a moving person', () => {
    const t = new PoseStabilityTracker()
    feed(t, 10, 100, 0.1)
    expect(t.motion()).toBeGreaterThan(0.015)
  })

  it('still judges stillness on a slow device (one detection every 400 ms)', () => {
    const t = new PoseStabilityTracker()
    feed(t, 6, 400)
    expect(t.motion()).toBeCloseTo(0, 6)
    const moving = new PoseStabilityTracker()
    feed(moving, 6, 400, 0.1)
    expect(moving.motion()).toBeGreaterThan(0.015)
  })

  it('does not judge on samples older than maxAgeMs', () => {
    const t = new PoseStabilityTracker()
    feed(t, 3, 100)
    t.push(10_000, frontPose())
    expect(t.motion()).toBeNull()
  })

  it('forgets history when the person disappears', () => {
    const t = new PoseStabilityTracker()
    feed(t, 10, 100)
    t.push(2000, null)
    expect(t.motion()).toBeNull()
  })
})
