import { Box3, Vector3 } from 'three'

/**
 * Transform that stands a model on y = 0, centres it on x/z and scales it to `targetHeight`.
 * Applied ONCE to a group holding the avatar and its garments, so garments authored in the
 * avatar's coordinate frame stay aligned however the avatar file was scaled (m, cm, ...).
 *
 * @param {import('three').Object3D} object
 * @param {number} targetHeight metres
 * @returns {{ scale: number, position: [number, number, number] }}
 */
export function computeFit(object, targetHeight) {
  object.updateWorldMatrix(true, true)
  const box = new Box3().setFromObject(object)
  const size = box.getSize(new Vector3())
  if (box.isEmpty() || !Number.isFinite(size.y) || size.y <= 1e-6) {
    throw new Error('The avatar model contains no visible geometry.')
  }
  const scale = targetHeight / size.y
  const center = box.getCenter(new Vector3())
  return {
    scale,
    position: [-center.x * scale, -box.min.y * scale, -center.z * scale],
  }
}
