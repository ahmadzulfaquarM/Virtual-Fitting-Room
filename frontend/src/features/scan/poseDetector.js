/**
 * MediaPipe Pose Landmarker, loaded lazily (the MediaPipe bundle and WASM are only fetched when
 * the camera step starts) and self-hosted (no third-party CDN: body images are private).
 *
 * Returns landmark positions only. It does not measure the body.
 */

const BASE = import.meta.env.BASE_URL ?? '/'

export const POSE_ASSETS = {
  wasmPath: `${BASE}mediapipe/wasm`,
  modelPath: `${BASE}models/pose/pose_landmarker_lite.task`,
}

export class PoseModelError extends Error {
  constructor(message, options) {
    super(message, options)
    this.name = 'PoseModelError'
  }
}

async function assertAssetsReachable(fetchImpl = fetch) {
  const probes = [POSE_ASSETS.modelPath, `${POSE_ASSETS.wasmPath}/vision_wasm_internal.wasm`]
  for (const url of probes) {
    let response
    try {
      response = await fetchImpl(url, { method: 'HEAD' })
    } catch (cause) {
      throw new PoseModelError(
        'The body-detection files could not be downloaded. Check your connection.',
        {
          cause,
        },
      )
    }
    const type = response.headers.get('content-type') ?? ''
    if (!response.ok || type.includes('text/html')) {
      throw new PoseModelError(
        `The body-detection file ${url} is missing from the server (run "npm install" so the WASM files are copied).`,
      )
    }
  }
}

/**
 * @returns {Promise<{ detect(video, timestampMs): {poses: Array<Array<object>>}, close(): void, delegate: string }>}
 */
export async function createPoseDetector({ fetchImpl = fetch } = {}) {
  await assertAssetsReachable(fetchImpl)
  const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision')
  const fileset = await FilesetResolver.forVisionTasks(POSE_ASSETS.wasmPath)

  const make = (delegate) =>
    PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: POSE_ASSETS.modelPath, delegate },
      runningMode: 'VIDEO',
      numPoses: 2, // 2 so that a second person in the frame can be reported
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })

  let landmarker
  let delegate = 'GPU'
  try {
    landmarker = await make('GPU')
  } catch {
    delegate = 'CPU'
    try {
      landmarker = await make('CPU')
    } catch (cause) {
      throw new PoseModelError('The body-detection model could not be started on this device.', {
        cause,
      })
    }
  }

  return {
    delegate,
    detect(video, timestampMs) {
      const result = landmarker.detectForVideo(video, timestampMs)
      return { poses: result.landmarks ?? [] }
    },
    close() {
      landmarker.close()
    },
  }
}

/** The pose with the largest on-screen body: the person the guidance should be about. */
export function pickMainPose(poses) {
  if (!poses || poses.length === 0) return null
  const area = (pose) => {
    const xs = pose.map((p) => p.x)
    const ys = pose.map((p) => p.y)
    return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))
  }
  return poses.reduce((best, pose) => (area(pose) > area(best) ? pose : best))
}
