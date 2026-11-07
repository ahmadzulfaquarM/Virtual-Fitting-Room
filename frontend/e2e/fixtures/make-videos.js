// Builds the fake-camera videos used by the scan e2e tests, from renders of the SAMPLE MANNEQUIN
// (synthetic: no photograph of a person is used). Needs ffmpeg on PATH. Output: e2e/.generated/*.y4m
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
export const GENERATED = join(here, '..', '.generated')
const img = (view) => join(here, `mannequin-${view}.png`)

// The renders have a near-white page background, which a real room would not: grade down to a
// normal indoor exposure so the image-quality checks are tested against a plausible scene.
const fit = (w, h, brightness = -0.25) =>
  `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=0xE2E8F0,eq=brightness=${brightness},format=yuv420p`

function ffmpeg(args) {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' })
}

const fresh = (file) => existsSync(file) && statSync(file).size > 0

/** One still image looped for 2 s at 10 fps (Chromium loops the file), optionally filtered. */
function still(name, view, extraFilter) {
  const out = join(GENERATED, name)
  if (fresh(out)) return out
  const filter = extraFilter ?? fit(640, 480)
  ffmpeg(['-loop', '1', '-i', img(view), '-t', '2', '-r', '10', '-vf', filter, out])
  return out
}

export function makeVideos() {
  mkdirSync(GENERATED, { recursive: true })
  return {
    front: still('front.y4m', 'front'),
    dark: still('dark.y4m', 'front', fit(640, 480, -0.85)),
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(makeVideos())
