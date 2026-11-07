// Synthetic poses for tests: 33 BlazePose landmarks, normalised x/y, visibility 1 unless stated.
import { LM } from './poseQuality'

export const ASPECT = 4 / 3

export function blankPose() {
  return Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }))
}

const set = (pose, index, x, y, visibility = 1) => {
  pose[index] = { x, y, z: 0, visibility }
}

/** A person standing face-on (or with their back to the camera), nicely framed, arms out a little. */
export function frontPose(overrides = {}) {
  const p = blankPose()
  set(p, LM.NOSE, 0.5, 0.12)
  set(p, LM.LEFT_EAR, 0.53, 0.11)
  set(p, LM.RIGHT_EAR, 0.47, 0.11)
  // Subject's LEFT is on the image's right when facing the camera.
  set(p, LM.LEFT_SHOULDER, 0.58, 0.25)
  set(p, LM.RIGHT_SHOULDER, 0.42, 0.25)
  set(p, LM.LEFT_WRIST, 0.68, 0.5)
  set(p, LM.RIGHT_WRIST, 0.32, 0.5)
  set(p, LM.LEFT_HIP, 0.54, 0.52)
  set(p, LM.RIGHT_HIP, 0.46, 0.52)
  set(p, LM.LEFT_KNEE, 0.55, 0.72)
  set(p, LM.RIGHT_KNEE, 0.45, 0.72)
  set(p, LM.LEFT_ANKLE, 0.55, 0.9)
  set(p, LM.RIGHT_ANKLE, 0.45, 0.9)
  set(p, LM.LEFT_HEEL, 0.55, 0.92)
  set(p, LM.RIGHT_HEEL, 0.45, 0.92)
  set(p, LM.LEFT_FOOT, 0.56, 0.93)
  set(p, LM.RIGHT_FOOT, 0.44, 0.93)
  return Object.assign(p, overrides)
}

/** Side-on: shoulders and hips stack up; the person faces image-left (their left side to camera). */
export function sidePose({ facing = 'left' } = {}) {
  const p = frontPose()
  const noseX = facing === 'left' ? 0.46 : 0.54
  set(p, LM.NOSE, noseX, 0.12)
  set(p, LM.LEFT_SHOULDER, 0.51, 0.25)
  set(p, LM.RIGHT_SHOULDER, 0.49, 0.25, 0.3) // far shoulder is hidden: low visibility is normal
  set(p, LM.LEFT_HIP, 0.505, 0.52)
  set(p, LM.RIGHT_HIP, 0.495, 0.52, 0.3)
  set(p, LM.LEFT_KNEE, 0.51, 0.72)
  set(p, LM.RIGHT_KNEE, 0.49, 0.72, 0.3)
  set(p, LM.LEFT_ANKLE, 0.51, 0.9)
  set(p, LM.RIGHT_ANKLE, 0.49, 0.9, 0.3)
  set(p, LM.LEFT_FOOT, 0.55, 0.93)
  set(p, LM.RIGHT_FOOT, 0.53, 0.93, 0.3)
  set(p, LM.LEFT_WRIST, 0.51, 0.5)
  set(p, LM.RIGHT_WRIST, 0.49, 0.5, 0.3)
  return p
}

export const withPoint = (pose, index, x, y, visibility = 1) => {
  const copy = pose.map((pt) => ({ ...pt }))
  set(copy, index, x, y, visibility)
  return copy
}

export const VIEW = {
  front: { key: 'front', orientation: 'front' },
  back: { key: 'back', orientation: 'back' },
  left: { key: 'left', orientation: 'side', sideOf: 'left' },
  right: { key: 'right', orientation: 'side', sideOf: 'right' },
}
