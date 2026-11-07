// Compares the self-hosted pose model with Google's official download, byte for byte (SHA-256).
//
//   npm run verify:pose-model
//
// Why: the model file in this repository was obtained from an npm package that re-bundles Google's
// model, not from Google directly. Run this once on a machine with normal internet access. If the
// hashes differ, replace public/models/pose/pose_landmarker_lite.task with the official download.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const OFFICIAL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task'
const LOCAL = new URL('../public/models/pose/pose_landmarker_lite.task', import.meta.url)

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const local = readFileSync(LOCAL)
console.log(`local    ${sha256(local)}  (${local.length} bytes)`)

try {
  const response = await fetch(OFFICIAL_URL)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const official = new Uint8Array(await response.arrayBuffer())
  console.log(`official ${sha256(official)}  (${official.length} bytes)`)
  if (sha256(official) === sha256(local)) {
    console.log('MATCH: the self-hosted model is byte-identical to the official download.')
  } else {
    console.error('MISMATCH: replace the local file with the official download:')
    console.error(`  curl -L -o public/models/pose/pose_landmarker_lite.task "${OFFICIAL_URL}"`)
    process.exit(1)
  }
} catch (error) {
  console.error(`Could not download the official model (${error.message}). Run this on a machine`)
  console.error('with internet access to storage.googleapis.com.')
  process.exit(2)
}
