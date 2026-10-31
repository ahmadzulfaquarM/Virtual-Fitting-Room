import { Suspense, lazy, useCallback, useMemo, useRef, useState } from 'react'
import { Badge, Button, Card, Spinner } from '../../components/ui'
import { describeAssetError, describeRuntimeError } from './assetCheck'
import { useAssetCheck } from './useAssetCheck'
import { ViewerControls } from './ViewerControls'
import { ViewerErrorBoundary } from './ViewerErrorBoundary'
import { nearestView } from './viewPresets'
import { isWebGLAvailable } from './webgl'

// three.js + react-three-fiber live in their own chunk, fetched only when the viewer is shown.
const ViewerCanvas = lazy(() => import('./ViewerCanvas'))

function Overlay({ children }) {
  return (
    <div
      role="status"
      className="absolute inset-0 flex items-center justify-center gap-3 text-sm font-semibold text-gray-900"
    >
      {children}
    </div>
  )
}

/** Blocking message that fills the viewer surface (missing avatar, no WebGL, render failure). */
function Notice({ title, detail, children }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-6">
      <div role="alert" className="max-w-md text-center">
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        <p className="mt-1 text-sm break-words">{detail}</p>
        {children && <div className="mt-4">{children}</div>}
      </div>
    </div>
  )
}

/**
 * Interactive 3D viewer: an avatar plus an optional garment, with rotate / zoom / reset and
 * front / left / back / right views.
 *
 * Failure handling, from cheapest to latest:
 *  1. no WebGL            -> explanatory notice, nothing is downloaded;
 *  2. avatar pre-flight   -> missing / not a GLB / network / timeout, with Retry;
 *  3. avatar render error -> error boundary (corrupt file that passed the header check), with Retry;
 *  4. garment problems    -> non-blocking warning; the avatar stays usable.
 */
export function Viewer({
  avatarUrl,
  garmentUrl = null,
  avatarLabel = 'Avatar',
  garmentLabel = 'Garment',
}) {
  const webglOk = useMemo(() => isWebGLAvailable(), [])
  const avatar = useAssetCheck(webglOk ? avatarUrl : null)
  const garment = useAssetCheck(webglOk ? garmentUrl : null)

  const [command, setCommand] = useState(null)
  const [activeView, setActiveView] = useState('front')
  const [autoRotate, setAutoRotate] = useState(false)
  const [showGarment, setShowGarment] = useState(true)
  const [garmentRuntimeError, setGarmentRuntimeError] = useState(null)
  const [contextLost, setContextLost] = useState(false)
  const [canvasKey, setCanvasKey] = useState(0)
  const [ready, setReady] = useState(false)

  const surfaceRef = useRef(null)
  const commandId = useRef(0)

  const send = useCallback((payload) => {
    commandId.current += 1
    setCommand({ id: commandId.current, ...payload })
  }, [])

  const handleCamera = useCallback(({ azimuth, distance }) => {
    const el = surfaceRef.current
    if (el) {
      el.dataset.azimuth = azimuth.toFixed(3)
      el.dataset.distance = distance.toFixed(2)
    }
    setActiveView(nearestView(azimuth))
  }, [])

  const handleReady = useCallback(() => setReady(true), [])
  const handleGarmentError = useCallback((error) => setGarmentRuntimeError(error), [])
  const handleContextLost = useCallback(() => setContextLost(true), [])

  const retry = useCallback(async () => {
    try {
      // Failed loads are cached too; clear them so Retry really downloads the files again.
      const { clearModelCache } = await import('./modelCache')
      clearModelCache([avatarUrl, garmentUrl])
    } catch {
      // The 3D chunk itself could not be loaded; nothing to clear.
    }
    avatar.retry()
    garment.retry()
    setGarmentRuntimeError(null)
    setContextLost(false)
    setReady(false)
    setCanvasKey((key) => key + 1)
  }, [avatar, garment, avatarUrl, garmentUrl])

  const garmentProblem =
    garment.status === 'error'
      ? describeAssetError(garment.error, garmentLabel)
      : garmentRuntimeError
        ? describeRuntimeError(garmentRuntimeError)
        : null
  const garmentAvailable = garment.status === 'ready' && !garmentRuntimeError

  let body
  if (!webglOk) {
    body = (
      <Notice
        title="3D view is not supported here"
        detail="Your browser or device cannot create a WebGL context, which the 3D viewer needs. Try an up-to-date Chrome, Edge, Safari or Firefox and make sure hardware acceleration is on."
      />
    )
  } else if (avatar.status === 'error') {
    const { title, detail } = describeAssetError(avatar.error, avatarLabel)
    body = (
      <Notice title={title} detail={detail}>
        <Button onClick={retry}>Try again</Button>
      </Notice>
    )
  } else if (avatar.status !== 'ready') {
    body = (
      <Overlay>
        <Spinner />
        Checking 3D assets…
      </Overlay>
    )
  } else if (contextLost) {
    body = (
      <Notice
        title="The 3D view was interrupted"
        detail="The graphics driver reset the 3D view, which can happen when the device is under memory pressure."
      >
        <Button onClick={retry}>Reload viewer</Button>
      </Notice>
    )
  } else {
    body = (
      <>
        <ViewerErrorBoundary
          resetKey={canvasKey}
          onRetry={retry}
          fallback={({ error, retry: boundaryRetry }) => {
            const { title, detail } = describeRuntimeError(error)
            return (
              <Notice title={title} detail={detail}>
                <Button onClick={boundaryRetry}>Try again</Button>
              </Notice>
            )
          }}
        >
          <Suspense
            fallback={
              <Overlay>
                <Spinner />
                Loading 3D engine…
              </Overlay>
            }
          >
            <div className="absolute inset-0">
              <ViewerCanvas
                key={canvasKey}
                avatarUrl={avatarUrl}
                garmentUrl={garmentAvailable ? garmentUrl : null}
                showGarment={showGarment}
                autoRotate={autoRotate}
                command={command}
                onCameraChange={handleCamera}
                onReady={handleReady}
                onGarmentError={handleGarmentError}
                onContextLost={handleContextLost}
              />
            </div>
          </Suspense>
        </ViewerErrorBoundary>
        {ready && (
          <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-xs text-gray-600">
            Drag to rotate · Scroll or pinch to zoom
          </p>
        )}
      </>
    )
  }

  return (
    <Card aria-labelledby="viewer-heading">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="viewer-heading" className="text-lg font-semibold">
          3D viewer
        </h2>
        <Badge tone="warning">Sample assets · not a body scan</Badge>
      </div>

      <div
        ref={surfaceRef}
        data-testid="viewer-surface"
        data-ready={ready}
        className="relative h-[min(70vh,600px)] min-h-80 overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
      >
        {body}
      </div>

      {garmentProblem && (
        <p
          role="status"
          className="mt-3 rounded-lg border border-amber-700/20 bg-amber-50 px-3 py-2 text-sm text-amber-700"
        >
          {garmentProblem.title}. The avatar is shown without it. {garmentProblem.detail}
        </p>
      )}

      <ViewerControls
        disabled={!ready}
        activeView={activeView}
        onSelectView={(key) => send({ type: 'view', key })}
        onZoomIn={() => send({ type: 'zoom', direction: 1 })}
        onZoomOut={() => send({ type: 'zoom', direction: -1 })}
        onReset={() => send({ type: 'reset' })}
        autoRotate={autoRotate}
        onToggleAutoRotate={() => setAutoRotate((on) => !on)}
        garmentAvailable={garmentAvailable}
        showGarment={showGarment}
        onToggleGarment={() => setShowGarment((on) => !on)}
      />

      <p className="mt-3 text-xs">
        {avatarLabel}
        {garmentUrl ? ` and ${garmentLabel.toLowerCase()}` : ''} are generated placeholder shapes
        for testing the viewer. They are not a scan of you and say nothing about fit.
      </p>
    </Card>
  )
}
