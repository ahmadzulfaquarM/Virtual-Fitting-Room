/**
 * Reading frames from a <video>. Frames are taken from the raw (unmirrored) video, never from the
 * mirrored preview, so a saved photo shows the body exactly as the camera saw it.
 */

/** Small RGBA sample for image-quality analysis. */
export function sampleFrame(video, width = 192, doc = document) {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh) return null
  const height = Math.max(1, Math.round((width * vh) / vw))
  const canvas = doc.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(video, 0, 0, width, height)
  return ctx.getImageData(0, 0, width, height)
}

/** Full-resolution JPEG of the current frame. */
export function captureFrame(video, { quality = 0.92, doc = document } = {}) {
  const width = video.videoWidth
  const height = video.videoHeight
  if (!width || !height)
    return Promise.reject(new Error('The camera has not produced a picture yet.'))
  const canvas = doc.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d').drawImage(video, 0, 0, width, height)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve({ blob, width, height }) : reject(new Error('Could not save the photo.')),
      'image/jpeg',
      quality,
    )
  })
}
