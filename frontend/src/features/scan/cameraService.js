/**
 * Camera access with every failure mode turned into a specific, actionable message.
 * The browser environment is injectable (`env`), so each case is unit-tested without a camera.
 *
 * The camera is NEVER requested on page load: startCamera() is only called from a user action.
 */

export class CameraError extends Error {
  /** @param {'unsupported'|'insecure'|'denied'|'not-found'|'in-use'|'aborted'|'unknown'} code */
  constructor(code, message, options) {
    super(message, options)
    this.name = 'CameraError'
    this.code = code
  }
}

const defaultEnv = () => ({
  navigator: typeof navigator === 'undefined' ? undefined : navigator,
  isSecureContext: typeof window === 'undefined' ? true : window.isSecureContext,
})

/** Whether this browser/page can use a camera at all, and if not, why. */
export function getCameraSupport(env = defaultEnv()) {
  if (!env.isSecureContext) {
    return {
      supported: false,
      code: 'insecure',
      message:
        'Camera access needs a secure connection. Open this page over https:// (or on localhost).',
    }
  }
  if (
    !env.navigator?.mediaDevices ||
    typeof env.navigator.mediaDevices.getUserMedia !== 'function'
  ) {
    return {
      supported: false,
      code: 'unsupported',
      message:
        'This browser cannot access a camera. Try an up-to-date Chrome, Edge, Safari or Firefox.',
    }
  }
  return { supported: true, code: null, message: null }
}

/** Map a DOMException from getUserMedia onto our error codes. */
export function classifyCameraError(error) {
  const name = error?.name
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'denied'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return 'not-found'
    case 'NotReadableError':
    case 'TrackStartError':
      return 'in-use'
    case 'AbortError':
      return 'aborted'
    default:
      return 'unknown'
  }
}

const MESSAGES = {
  denied: {
    title: 'Camera access was blocked',
    detail:
      'Allow camera access for this site in your browser settings (usually the camera icon next to the address bar), then press Try again. Nothing is recorded until you start.',
  },
  'not-found': {
    title: 'No camera found',
    detail: 'Connect a camera or use a device that has one, then press Try again.',
  },
  'in-use': {
    title: 'The camera could not be started',
    detail:
      'Another app or browser tab may be using it. Close other apps that use the camera and press Try again.',
  },
  aborted: {
    title: 'The camera request was interrupted',
    detail: 'Press Try again to start the camera.',
  },
  unsupported: { title: 'Camera not supported', detail: null },
  insecure: { title: 'Secure connection required', detail: null },
  unknown: {
    title: 'The camera could not be started',
    detail: 'Something unexpected went wrong. Reload the page and try again.',
  },
}

/** Title and detail for any camera failure, plus whether pressing Try again can help. */
export function describeCameraError(error) {
  const code = error instanceof CameraError ? error.code : classifyCameraError(error)
  const base = MESSAGES[code] ?? MESSAGES.unknown
  return {
    code,
    title: base.title,
    detail: base.detail ?? (error instanceof CameraError ? error.message : MESSAGES.unknown.detail),
    canRetry: code !== 'unsupported' && code !== 'insecure',
  }
}

const preferred = (facingMode) => ({
  audio: false,
  video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
})

/**
 * Opens the camera. Retries once with plain `video: true` if the preferred constraints cannot be
 * met (older devices). Returns { stream, track, stop }.
 */
export async function startCamera({ facingMode = 'user', env = defaultEnv() } = {}) {
  const support = getCameraSupport(env)
  if (!support.supported) throw new CameraError(support.code, support.message)

  const { mediaDevices } = env.navigator
  let stream
  try {
    stream = await mediaDevices.getUserMedia(preferred(facingMode))
  } catch (error) {
    if (error?.name === 'OverconstrainedError' || error?.name === 'ConstraintNotSatisfiedError') {
      try {
        stream = await mediaDevices.getUserMedia({ video: true, audio: false })
      } catch (retryError) {
        throw new CameraError(
          classifyCameraError(retryError),
          retryError?.message ?? 'Camera failed',
          {
            cause: retryError,
          },
        )
      }
    } else {
      throw new CameraError(classifyCameraError(error), error?.message ?? 'Camera failed', {
        cause: error,
      })
    }
  }

  const track = stream.getVideoTracks()[0]
  if (!track) {
    stream.getTracks().forEach((t) => t.stop())
    throw new CameraError('not-found', 'The camera did not provide a video track.')
  }
  return {
    stream,
    track,
    stop: () => stream.getTracks().forEach((t) => t.stop()),
  }
}

/** Calls onEnded when the camera stops (unplugged, permission revoked, another app took it). */
export function watchStream(stream, onEnded) {
  const tracks = stream.getVideoTracks()
  const handler = () => onEnded()
  tracks.forEach((t) => t.addEventListener('ended', handler))
  return () => tracks.forEach((t) => t.removeEventListener('ended', handler))
}

/**
 * Calls onChange('granted' | 'denied' | 'prompt') when the camera permission changes while the
 * page is open. Not every browser supports querying the camera permission (Safari, Firefox);
 * there this is a no-op and watchStream's "ended" event is the only signal.
 */
export function watchCameraPermission(onChange, env = defaultEnv()) {
  let status = null
  let cancelled = false
  const handler = () => status && onChange(status.state)
  const permissions = env.navigator?.permissions
  if (!permissions?.query) return () => {}
  permissions
    .query({ name: 'camera' })
    .then((result) => {
      if (cancelled) return
      status = result
      status.addEventListener?.('change', handler)
    })
    .catch(() => {
      /* permission name not supported here */
    })
  return () => {
    cancelled = true
    status?.removeEventListener?.('change', handler)
  }
}
