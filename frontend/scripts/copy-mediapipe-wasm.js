// Copies the MediaPipe WASM runtime from node_modules into public/mediapipe/wasm so it is served
// from our own origin. Body images are private data: nothing is loaded from a third-party CDN.
// Runs automatically after `npm install` / `npm ci` and before `dev` / `build`.
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs'

const source = new URL('../node_modules/@mediapipe/tasks-vision/wasm/', import.meta.url)
const target = new URL('../public/mediapipe/wasm/', import.meta.url)

if (!existsSync(source)) {
  console.warn('copy-mediapipe-wasm: @mediapipe/tasks-vision is not installed yet, skipping.')
  process.exit(0)
}
mkdirSync(target, { recursive: true })
cpSync(source, target, { recursive: true })
console.log(`copy-mediapipe-wasm: ${readdirSync(target).length} files -> public/mediapipe/wasm`)
