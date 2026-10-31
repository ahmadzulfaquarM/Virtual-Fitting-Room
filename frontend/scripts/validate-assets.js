// Validates every .glb in public/models with the Khronos glTF Validator.
// Usage: npm run validate:assets   (exits non-zero on any error or warning)
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateBytes } from 'gltf-validator'

import { fileURLToPath } from 'node:url'

const dir = fileURLToPath(new URL('../public/models/', import.meta.url))
const files = readdirSync(dir).filter((f) => f.endsWith('.glb'))
if (files.length === 0) {
  console.error('No .glb files found in public/models')
  process.exit(1)
}

let failed = false
for (const file of files) {
  const report = await validateBytes(new Uint8Array(readFileSync(join(dir, file))))
  const { numErrors, numWarnings, messages } = report.issues
  console.log(`${file}: ${numErrors} errors, ${numWarnings} warnings`)
  for (const m of messages.filter((x) => x.severity <= 1)) console.log(`  ${m.code}: ${m.message}`)
  if (numErrors > 0 || numWarnings > 0) failed = true
}
process.exit(failed ? 1 : 0)
