import { getCameraSupport, startCamera, watchCameraPermission, watchStream } from './cameraService'
import { captureFrame, sampleFrame } from './frameCapture'
import { createPoseDetector } from './poseDetector'

/**
 * Everything the scan flow needs from the outside world. The flow takes this as a prop so tests
 * can supply a fake camera, detector and frame source; production uses the real ones.
 */
export const defaultServices = {
  getCameraSupport: () => getCameraSupport(),
  startCamera: (options) => startCamera(options),
  watchStream,
  watchCameraPermission: (onChange) => watchCameraPermission(onChange),
  createPoseDetector: () => createPoseDetector(),
  sampleFrame: (video) => sampleFrame(video),
  captureFrame: (video) => captureFrame(video),
  now: () => performance.now(),
  intervalMs: 100,
}
