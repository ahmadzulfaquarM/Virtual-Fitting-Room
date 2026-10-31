import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CanvasTexture, DefaultLoadingManager, SRGBColorSpace } from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { computeFit } from './fit'
import { ViewerErrorBoundary } from './ViewerErrorBoundary'
import {
  AVATAR_HEIGHT,
  DEFAULT_CAMERA,
  MAX_DISTANCE,
  MAX_POLAR,
  MIN_DISTANCE,
  MIN_POLAR,
  TARGET,
  cameraPosition,
  easeFactor,
  goalForCommand,
  stepToward,
} from './viewPresets'

/**
 * The WebGL part of the viewer, loaded lazily (React.lazy in Viewer.jsx) so three.js is only
 * downloaded when the viewer is shown.
 *
 * Deliberately uses three's own OrbitControls / GLTFLoader instead of @react-three/drei: it keeps
 * the bundle smaller and avoids a large dependency tree. Draco and Meshopt decoders are NOT
 * configured, so compressed models fail with a clear error; add self-hosted decoders when needed
 * (never a third-party CDN, because scan-derived models are private data).
 */

const INITIAL_CAMERA_POSITION = cameraPosition(DEFAULT_CAMERA)

function GroundShadow() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 128
    const ctx = canvas.getContext('2d')
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
    gradient.addColorStop(0, 'rgba(30, 41, 59, 0.30)')
    gradient.addColorStop(1, 'rgba(30, 41, 59, 0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 128, 128)
    const t = new CanvasTexture(canvas)
    t.colorSpace = SRGBColorSpace
    return t
  }, [])
  useEffect(() => () => texture.dispose(), [texture])

  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.002, 0.03]}>
      <planeGeometry args={[1.5, 1.5]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  )
}

function Garment({ url, visible }) {
  const { scene } = useLoader(GLTFLoader, url)
  const object = useMemo(() => clone(scene), [scene])
  return <primitive object={object} visible={visible} />
}

function SceneContent({ avatarUrl, garmentUrl, showGarment, onReady, onGarmentError }) {
  const { scene } = useLoader(GLTFLoader, avatarUrl)
  const avatar = useMemo(() => clone(scene), [scene])
  // Throws (caught by the viewer's error boundary) when the file has no usable geometry.
  const fit = useMemo(() => computeFit(avatar, AVATAR_HEIGHT), [avatar])

  useEffect(() => {
    onReady?.()
  }, [onReady])

  return (
    <group position={fit.position} scale={fit.scale}>
      <primitive object={avatar} />
      {garmentUrl && (
        <ViewerErrorBoundary resetKey={garmentUrl} onError={onGarmentError} fallback={() => null}>
          <Suspense fallback={null}>
            <Garment url={garmentUrl} visible={showGarment} />
          </Suspense>
        </ViewerErrorBoundary>
      )}
    </group>
  )
}

/** Orbit limits and feel. Module-level so the controls object is configured outside React hooks. */
function configureControls(controls) {
  controls.target.set(...TARGET)
  controls.enablePan = false
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.rotateSpeed = 0.8
  controls.minDistance = MIN_DISTANCE
  controls.maxDistance = MAX_DISTANCE
  controls.minPolarAngle = MIN_POLAR
  controls.maxPolarAngle = MAX_POLAR
  controls.autoRotateSpeed = 1.5
  controls.update()
}

function setAutoRotate(controls, on) {
  controls.autoRotate = on
}

/**
 * Orbit controls plus the animated camera moves for toolbar commands. Reports every camera change
 * through onCameraChange (drag, zoom, damping, tween).
 */
function OrbitRig({ autoRotate, command, onCameraChange }) {
  const camera = useThree((state) => state.camera)
  const domElement = useThree((state) => state.gl.domElement)
  const invalidate = useThree((state) => state.invalidate)
  const controls = useMemo(() => new OrbitControls(camera, domElement), [camera, domElement])
  const goal = useRef(null)

  const reducedMotion = useMemo(
    () =>
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )

  const readState = useCallback(
    () => ({
      azimuth: controls.getAzimuthalAngle(),
      polar: controls.getPolarAngle(),
      distance: controls.getDistance(),
    }),
    [controls],
  )

  const place = useCallback(
    (state) => {
      camera.position.set(...cameraPosition(state, TARGET))
      controls.update()
    },
    [camera, controls],
  )

  useEffect(() => {
    configureControls(controls)
    return () => controls.dispose()
  }, [controls])

  useEffect(() => {
    setAutoRotate(controls, autoRotate)
    invalidate()
  }, [controls, autoRotate, invalidate])

  useEffect(() => {
    const cancelMove = () => {
      goal.current = null
    }
    const onChange = () => {
      invalidate()
      onCameraChange?.(readState())
    }
    controls.addEventListener('start', cancelMove)
    controls.addEventListener('change', onChange)
    onCameraChange?.(readState())
    return () => {
      controls.removeEventListener('start', cancelMove)
      controls.removeEventListener('change', onChange)
    }
  }, [controls, invalidate, onCameraChange, readState])

  useEffect(() => {
    if (!command) return
    const next = goalForCommand(command, readState())
    if (reducedMotion) {
      place(next)
      return
    }
    goal.current = next
    invalidate()
  }, [command, readState, place, invalidate, reducedMotion])

  useFrame((_, delta) => {
    if (goal.current) {
      const { state, done } = stepToward(readState(), goal.current, easeFactor(delta))
      place(state)
      if (done) goal.current = null
      else invalidate()
    } else {
      controls.update() // damping and auto-rotate; dispatches "change" while still moving
    }
  })

  return null
}

/** DOM overlay shown until the model has been added to the scene. */
function LoadingOverlay() {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const manager = DefaultLoadingManager
    const previous = manager.onProgress
    manager.onProgress = (_url, loaded, total) => setProgress(total ? (loaded / total) * 100 : 0)
    return () => {
      manager.onProgress = previous
    }
  }, [])

  return (
    <div
      role="status"
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
    >
      <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold whitespace-nowrap text-gray-900 shadow-sm">
        Loading model… {Math.round(progress)}%
      </div>
    </div>
  )
}

export default function ViewerCanvas({
  avatarUrl,
  garmentUrl,
  showGarment,
  autoRotate,
  command,
  onCameraChange,
  onReady,
  onGarmentError,
  onContextLost,
}) {
  const [sceneReady, setSceneReady] = useState(false)
  // Tearing a canvas down (error boundary, Retry, unmount) makes the browser fire
  // `webglcontextlost`. That is not a driver reset, so it must not be reported as one.
  // A layout-effect cleanup runs synchronously during unmount, before that event is dispatched.
  const unmounted = useRef(false)
  useLayoutEffect(() => {
    unmounted.current = false
    return () => {
      unmounted.current = true
    }
  }, [])
  const handleReady = useCallback(() => {
    setSceneReady(true)
    onReady?.()
  }, [onReady])

  return (
    <>
      <Canvas
        aria-label="Interactive 3D avatar viewer"
        frameloop="demand"
        flat
        dpr={[1, 1.75]}
        camera={{ position: INITIAL_CAMERA_POSITION, fov: 35, near: 0.1, far: 50 }}
        gl={{ antialias: true }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener('webglcontextlost', (event) => {
            event.preventDefault()
            if (!unmounted.current) onContextLost?.()
          })
        }}
      >
        <color attach="background" args={['#f8fafc']} />
        <hemisphereLight args={['#ffffff', '#cbd5e1', 1.0]} />
        <directionalLight position={[2.5, 4, 3.5]} intensity={1.6} />
        <directionalLight position={[-3, 2, -2.5]} intensity={0.6} />

        <Suspense fallback={null}>
          <SceneContent
            avatarUrl={avatarUrl}
            garmentUrl={garmentUrl}
            showGarment={showGarment}
            onReady={handleReady}
            onGarmentError={onGarmentError}
          />
        </Suspense>
        <GroundShadow />
        <OrbitRig autoRotate={autoRotate} command={command} onCameraChange={onCameraChange} />
      </Canvas>
      {!sceneReady && <LoadingOverlay />}
    </>
  )
}
