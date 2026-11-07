import { useCallback, useEffect, useRef, useState } from 'react'
import { FiAlertTriangle, FiCheckCircle, FiXCircle } from 'react-icons/fi'
import { Badge, Button, Card, Spinner, ToggleButton } from '../../components/ui'
import { SCAN_VIEWS } from './captureConfig'
import { createAutoCapture } from './autoCapture'
import { describeCameraError } from './cameraService'
import { analyseImage, evaluateImage } from './imageQuality'
import { PoseStabilityTracker, bodyBox, evaluatePose } from './poseQuality'
import { pickMainPose } from './poseDetector'
import { SKELETON } from './skeleton'

const REVOKED = {
  code: 'revoked',
  title: 'The camera stopped',
  detail:
    'Camera access was removed or the camera was disconnected. Allow camera access again in your browser settings, then press Try again. Photos already taken are kept.',
  canRetry: true,
}

const MODEL_ERROR = (message) => ({
  code: 'model',
  title: 'Body detection could not start',
  detail: message,
  canRetry: true,
})

function CheckRow({ check }) {
  const warning = !check.ok && check.level === 'warning'
  const Icon = check.ok ? FiCheckCircle : warning ? FiAlertTriangle : FiXCircle
  const tone = check.ok ? 'text-green-700' : warning ? 'text-amber-700' : 'text-red-700'
  return (
    <li className={`flex items-start gap-2 text-sm ${tone}`}>
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        <span className="sr-only">
          {check.ok ? 'Passed: ' : warning ? 'Warning: ' : 'Needs fixing: '}
        </span>
        {check.label}
      </span>
    </li>
  )
}

export function CameraStep({ view, shots, services, onCaptured, onBack }) {
  const videoRef = useRef(null)
  const detectorRef = useRef(null)
  const latest = useRef({ ready: false, warnings: [] })
  const capturing = useRef(false)

  const [facingMode, setFacingMode] = useState('user')
  const [attempt, setAttempt] = useState(0)
  const [camera, setCamera] = useState('starting') // starting | running | error
  const [model, setModel] = useState('loading') // loading | ready | error
  const [problem, setProblem] = useState(null)
  const [aspect, setAspect] = useState(4 / 3)
  const [state, setState] = useState({
    checks: [],
    ready: false,
    landmarks: null,
    motion: null,
    frames: 0,
    phase: 'idle',
    secondsLeft: null,
    cancelled: false,
  })
  const [captureError, setCaptureError] = useState(null)
  const modelFailed = model === 'error'

  // The body-detection model loads once for the whole camera step.
  useEffect(() => {
    let cancelled = false
    let detector = null
    // Deferred one tick so React StrictMode's throw-away first effect run never starts a download.
    const timer = setTimeout(() => {
      services
        .createPoseDetector()
        .then((created) => {
          if (cancelled) return created.close()
          detector = created
          detectorRef.current = created
          setModel('ready')
          return undefined
        })
        .catch((error) => {
          if (cancelled) return
          setProblem(MODEL_ERROR(error?.message ?? 'The model failed to load.'))
          setModel('error')
        })
    }, 0)
    return () => {
      clearTimeout(timer)
      cancelled = true
      detectorRef.current = null
      detector?.close()
    }
  }, [services, attempt])

  // The camera: only started because the person pressed Start camera, stopped on any exit.
  useEffect(() => {
    let cancelled = false
    let cam = null
    let offStream = () => {}
    let offPermission = () => {}
    const fail = (error) => {
      if (cancelled) return
      cam?.stop()
      setProblem(error)
      setCamera('error')
    }
    if (modelFailed) return undefined
    const video = videoRef.current
    // Deferred one tick so React StrictMode's throw-away first effect run never asks for the camera.
    const timer = setTimeout(() => {
      services
        .startCamera({ facingMode })
        .then(async (started) => {
          if (cancelled) return started.stop()
          cam = started
          video.srcObject = started.stream
          video.muted = true
          await video.play?.().catch(() => {})
          if (cancelled) return undefined
          offStream = services.watchStream(started.stream, () => fail(REVOKED))
          offPermission = services.watchCameraPermission((permission) => {
            if (permission === 'denied') fail(REVOKED)
          })
          setCamera('running')
          return undefined
        })
        .catch((error) => fail(describeCameraError(error)))
    }, 0)
    return () => {
      clearTimeout(timer)
      cancelled = true
      offStream()
      offPermission()
      cam?.stop()
      if (video) video.srcObject = null
    }
  }, [services, facingMode, attempt, modelFailed])

  const capture = useCallback(
    async (warnings) => {
      if (capturing.current) return
      capturing.current = true
      try {
        const { blob, width, height } = await services.captureFrame(videoRef.current)
        onCaptured({
          viewKey: view.key,
          blob,
          width,
          height,
          capturedAt: Date.now(),
          warnings: warnings.map(({ id, hint }) => ({ id, hint })),
        })
      } catch (error) {
        setCaptureError(error?.message ?? 'Could not take the photo. Try again.')
        capturing.current = false
      }
    },
    [services, onCaptured, view.key],
  )

  // Analysis loop.
  useEffect(() => {
    if (camera !== 'running' || model !== 'ready') return undefined
    const tracker = new PoseStabilityTracker()
    const auto = createAutoCapture()
    capturing.current = false
    let frames = 0
    const tick = () => {
      const video = videoRef.current
      const detector = detectorRef.current
      if (!video || !detector || capturing.current) return
      const frame = services.sampleFrame(video)
      if (!frame) return
      const now = services.now()
      const { poses } = detector.detect(video, now)
      const main = pickMainPose(poses)
      tracker.push(now, main)
      const frameAspect =
        video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : aspect
      const motion = tracker.motion()
      const pose = evaluatePose({
        landmarks: main,
        personCount: poses.length,
        view,
        aspect: frameAspect,
        motion,
      })
      const image = evaluateImage(analyseImage(frame, main ? bodyBox(main) : null))
      const ready = pose.ready && image.ready
      const warnings = [...pose.warnings, ...image.warnings]
      latest.current = { ready, warnings }
      const step = auto.update(ready, now)
      setState({
        checks: [...pose.checks, ...image.checks],
        ready,
        landmarks: main,
        motion,
        frames: ++frames,
        phase: step.phase,
        secondsLeft: step.secondsLeft,
        cancelled: step.cancelled,
      })
      if (step.phase === 'fire') capture(warnings)
    }
    const timer = setInterval(tick, services.intervalMs)
    return () => {
      clearInterval(timer)
      latest.current = { ready: false, warnings: [] }
    }
  }, [camera, model, services, view, aspect, capture])

  const retry = () => {
    setCamera('starting')
    setModel('loading')
    setProblem(null)
    setCaptureError(null)
    setAttempt((n) => n + 1)
  }

  const index = SCAN_VIEWS.findIndex((v) => v.key === view.key)
  // Lighting first: in the dark the detector finds nobody, and "no person" would hide the real cause.
  const blocking = state.checks.filter((c) => !c.ok && c.level === 'error')
  const firstError = blocking.find((c) => c.id === 'light') ?? blocking[0]
  const guidance =
    state.phase === 'countdown' ? 'Hold still…' : (firstError?.hint ?? view.instruction)
  const mirrored = facingMode === 'user'
  const stateColour = state.ready ? '#16A34A' : '#D97706'

  return (
    <Card aria-labelledby="scan-camera-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="scan-camera-heading" className="text-lg font-semibold">
          {view.label} photo ({index + 1} of {SCAN_VIEWS.length})
        </h2>
        <ol className="flex gap-1.5" aria-label="Progress">
          {SCAN_VIEWS.map((v, i) => (
            <li
              key={v.key}
              aria-label={`${v.label}: ${shots[v.key] ? 'taken' : i === index ? 'current' : 'to do'}`}
              className={`h-2.5 w-8 rounded-full ${shots[v.key] ? 'bg-blue-600' : i === index ? 'bg-blue-100 ring-2 ring-blue-600' : 'bg-slate-200'}`}
            />
          ))}
        </ol>
      </div>

      <p className="mt-2 text-sm">{view.instruction}</p>

      {camera === 'error' || model === 'error' ? (
        <div role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">
          <p className="font-semibold">{problem?.title}</p>
          <p className="mt-1">{problem?.detail}</p>
          <div className="mt-3 flex gap-3">
            {problem?.canRetry && <Button onClick={retry}>Try again</Button>}
            <Button variant="secondary" onClick={onBack}>
              Back
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem]">
          <div>
            <div
              className="relative overflow-hidden rounded-xl bg-gray-900"
              style={{ aspectRatio: aspect }}
            >
              <div className={`absolute inset-0 ${mirrored ? '-scale-x-100' : ''}`}>
                <video
                  ref={videoRef}
                  data-testid="scan-video"
                  className="h-full w-full"
                  playsInline
                  muted
                  onLoadedMetadata={(e) => {
                    const { videoWidth: w, videoHeight: h } = e.currentTarget
                    if (w && h) setAspect(w / h)
                  }}
                />
                {state.landmarks && (
                  <svg
                    viewBox="0 0 1 1"
                    preserveAspectRatio="none"
                    className="absolute inset-0 h-full w-full"
                    aria-hidden="true"
                    data-testid="scan-skeleton"
                  >
                    {SKELETON.map(([a, b]) => {
                      const p = state.landmarks[a]
                      const q = state.landmarks[b]
                      if (!p || !q) return null
                      return (
                        <line
                          key={`${a}-${b}`}
                          x1={p.x}
                          y1={p.y}
                          x2={q.x}
                          y2={q.y}
                          stroke={stateColour}
                          strokeWidth="0.008"
                          strokeLinecap="round"
                        />
                      )
                    })}
                  </svg>
                )}
              </div>
              {(camera === 'starting' || model === 'loading') && (
                <div className="absolute inset-0 flex items-center justify-center gap-3 bg-gray-900/70 text-sm text-white">
                  <Spinner />
                  <span role="status">
                    {camera === 'starting' ? 'Starting camera…' : 'Loading body detection…'}
                  </span>
                </div>
              )}
              {state.phase === 'countdown' && (
                <div
                  data-testid="scan-countdown"
                  className="absolute inset-0 flex items-center justify-center text-7xl font-bold text-white drop-shadow"
                >
                  {state.secondsLeft}
                </div>
              )}
            </div>

            <p
              role="status"
              className="mt-3 rounded-lg bg-blue-50 p-3 text-sm font-medium text-gray-900"
            >
              {guidance}
            </p>
            {state.cancelled && (
              <p className="mt-2 text-sm text-amber-700">
                Countdown cancelled: a check no longer passes.
              </p>
            )}
            {captureError && (
              <p role="alert" className="mt-2 text-sm text-red-700">
                {captureError}
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-3">
              <Button onClick={() => capture(latest.current.warnings)} disabled={!state.ready}>
                Capture now
              </Button>
              <ToggleButton
                onClick={() => {
                  setCamera('starting')
                  setFacingMode((m) => (m === 'user' ? 'environment' : 'user'))
                }}
              >
                Switch camera
              </ToggleButton>
              <Button variant="secondary" onClick={onBack}>
                Back
              </Button>
            </div>
          </div>

          <aside aria-label="Checks" data-motion={state.motion ?? ''} data-frames={state.frames}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Live checks</h3>
              {state.ready ? (
                <Badge tone="success">Ready</Badge>
              ) : (
                <Badge tone="warning">Not ready</Badge>
              )}
            </div>
            <ul className="mt-2 space-y-1.5">
              {state.checks.map((c) => (
                <CheckRow key={c.id} check={c} />
              ))}
            </ul>
            <p className="mt-3 text-xs">
              The photo is taken automatically after all checks pass for a moment. Photos stay in
              this browser until you approve them.
            </p>
          </aside>
        </div>
      )}
    </Card>
  )
}
