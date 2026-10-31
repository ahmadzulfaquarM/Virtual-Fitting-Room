import { useLoader } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

/**
 * Drops cached models, including cached FAILURES, so a Retry really downloads them again.
 * Lives in its own module (imported lazily with the canvas) so Viewer.jsx does not pull in three.js.
 */
export function clearModelCache(urls) {
  urls.filter(Boolean).forEach((url) => useLoader.clear(GLTFLoader, url))
}
