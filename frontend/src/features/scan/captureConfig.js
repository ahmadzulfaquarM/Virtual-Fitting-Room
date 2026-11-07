/**
 * Which views the guided scan captures, and what each one asks of the customer.
 *
 * PROVISIONAL: the views a 3D body-reconstruction model actually needs are only decided in
 * Phase 4, when a provider is selected and its input requirements are verified. Change this one
 * list (and nothing else) when that happens; the flow, checks and review screen all follow it.
 *
 * orientation: 'front' | 'back' | 'side' -- what the body should look like to the camera.
 * sideOf:      'left' | 'right'           -- for side views, which side of the body faces the camera.
 */
export const SCAN_VIEWS = [
  {
    key: 'front',
    label: 'Front',
    orientation: 'front',
    instruction: 'Face the camera. Feet shoulder-width apart, arms slightly away from your body.',
  },
  {
    key: 'left',
    label: 'Left side',
    orientation: 'side',
    sideOf: 'left',
    instruction: 'Turn so your LEFT side faces the camera. Stand straight, arms relaxed.',
  },
  {
    key: 'back',
    label: 'Back',
    orientation: 'back',
    instruction: 'Turn your back to the camera. Feet shoulder-width apart, arms slightly away.',
  },
  {
    key: 'right',
    label: 'Right side',
    orientation: 'side',
    sideOf: 'right',
    instruction: 'Turn so your RIGHT side faces the camera. Stand straight, arms relaxed.',
  },
]

export const VIEWS_ARE_PROVISIONAL = true

export function viewByKey(key) {
  const view = SCAN_VIEWS.find((v) => v.key === key)
  if (!view) throw new Error(`Unknown scan view "${key}"`)
  return view
}

/** Setup advice shown before the camera starts. */
export const SETUP_TIPS = [
  'Wear fitted clothing (or the clothes you want to try on over), not a loose coat or dress.',
  'Place the device upright on a stable surface at about waist height, 2 to 3 metres away.',
  'Stand in even, bright lighting with a plain background. Avoid a window or lamp behind you.',
  'Keep your whole body in the frame, head to feet, and stand still for each photo.',
  'Pull long hair back so your neck and shoulders are visible.',
]
