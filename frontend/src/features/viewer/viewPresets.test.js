import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CAMERA,
  MAX_DISTANCE,
  MIN_DISTANCE,
  TARGET,
  VIEWS,
  cameraPosition,
  clampDistance,
  degToRad,
  easeFactor,
  goalForCommand,
  nearestView,
  shortestAngleDelta,
  stepToward,
  viewByKey,
  wrapAngle,
  zoomedDistance,
} from './viewPresets'

const close = (a, b, digits = 6) => expect(a).toBeCloseTo(b, digits)

describe('angles', () => {
  it('wraps into (-π, π]', () => {
    close(wrapAngle(3 * Math.PI), Math.PI)
    close(wrapAngle(-3 * Math.PI), Math.PI)
    close(wrapAngle(Math.PI / 2), Math.PI / 2)
    close(wrapAngle(2 * Math.PI), 0)
  })

  it('takes the shortest way round', () => {
    close(shortestAngleDelta(degToRad(170), degToRad(-170)), degToRad(20))
    close(shortestAngleDelta(degToRad(-170), degToRad(170)), degToRad(-20))
    close(shortestAngleDelta(0, Math.PI), Math.PI)
  })
})

describe('cameraPosition', () => {
  const d = 3

  it('front view is on +Z at target height', () => {
    const [x, y, z] = cameraPosition({ azimuth: 0, polar: Math.PI / 2, distance: d })
    close(x, TARGET[0])
    close(y, TARGET[1])
    close(z, d)
  })

  it('back is -Z, left is +X, right is -X', () => {
    const at = (key) =>
      cameraPosition({ azimuth: viewByKey(key).azimuth, polar: Math.PI / 2, distance: d })
    close(at('back')[2], -d)
    close(at('left')[0], d)
    close(at('right')[0], -d)
  })

  it('keeps the requested distance from the target for any orientation', () => {
    for (const azimuth of [0, 1, 2.5, -2]) {
      for (const polar of [0.5, 1.2, 1.7]) {
        const [x, y, z] = cameraPosition({ azimuth, polar, distance: 2.7 })
        close(Math.hypot(x - TARGET[0], y - TARGET[1], z - TARGET[2]), 2.7)
      }
    }
  })
})

describe('views', () => {
  it('defines front, left, back and right', () => {
    expect(VIEWS.map((v) => v.key)).toEqual(['front', 'left', 'back', 'right'])
  })

  it('throws for an unknown view', () => {
    expect(() => viewByKey('top')).toThrow(/Unknown view/)
  })

  it('detects the active view within tolerance and none in between', () => {
    expect(nearestView(0)).toBe('front')
    expect(nearestView(degToRad(8))).toBe('front')
    expect(nearestView(degToRad(90))).toBe('left')
    expect(nearestView(Math.PI)).toBe('back')
    expect(nearestView(-Math.PI + 0.05)).toBe('back') // wraps across ±π
    expect(nearestView(degToRad(-88))).toBe('right')
    expect(nearestView(degToRad(45))).toBeNull()
  })
})

describe('zoom', () => {
  it('clamps to the allowed range', () => {
    expect(clampDistance(0.1)).toBe(MIN_DISTANCE)
    expect(clampDistance(99)).toBe(MAX_DISTANCE)
    expect(clampDistance(3)).toBe(3)
  })

  it('zooming in reduces and zooming out increases the distance, within limits', () => {
    expect(zoomedDistance(3, 1)).toBeLessThan(3)
    expect(zoomedDistance(3, -1)).toBeGreaterThan(3)
    expect(zoomedDistance(MIN_DISTANCE, 1)).toBe(MIN_DISTANCE)
    expect(zoomedDistance(MAX_DISTANCE, -1)).toBe(MAX_DISTANCE)
  })
})

describe('goalForCommand', () => {
  const current = { azimuth: 1, polar: 1.2, distance: 2.5 }

  it('a view command changes only the azimuth', () => {
    expect(goalForCommand({ type: 'view', key: 'back' }, current)).toEqual({
      ...current,
      azimuth: Math.PI,
    })
  })

  it('a zoom command changes only the distance', () => {
    const goal = goalForCommand({ type: 'zoom', direction: 1 }, current)
    expect(goal.azimuth).toBe(current.azimuth)
    expect(goal.polar).toBe(current.polar)
    expect(goal.distance).toBeLessThan(current.distance)
  })

  it('reset restores the defaults', () => {
    expect(goalForCommand({ type: 'reset' }, current)).toEqual(DEFAULT_CAMERA)
  })

  it('an unknown command leaves the camera alone', () => {
    expect(goalForCommand({ type: 'nope' }, current)).toEqual(current)
  })
})

describe('stepToward', () => {
  it('converges to the goal and reports completion', () => {
    const goal = { azimuth: Math.PI, polar: 1.4, distance: 2 }
    let state = { azimuth: 0, polar: 1.0, distance: 4 }
    let done = false
    for (let i = 0; i < 500 && !done; i++)
      ({ state, done } = stepToward(state, goal, easeFactor(1 / 60)))
    expect(done).toBe(true)
    expect(state).toEqual(goal)
  })

  it('rotates the short way round the circle', () => {
    const { state } = stepToward(
      { azimuth: degToRad(170), polar: 1.4, distance: 3 },
      { azimuth: degToRad(-170), polar: 1.4, distance: 3 },
      0.5,
    )
    // halfway along the 20° short arc is 180°; the long way round would pass through 0°
    close(Math.abs(wrapAngle(state.azimuth)), Math.PI, 6)
  })

  it('easeFactor is frame-rate independent and bounded', () => {
    expect(easeFactor(0)).toBe(0)
    expect(easeFactor(-1)).toBe(0)
    expect(easeFactor(10)).toBeLessThanOrEqual(1)
    // two 1/120 s steps ≈ one 1/60 s step
    close(1 - (1 - easeFactor(1 / 120)) ** 2, easeFactor(1 / 60))
  })
})
