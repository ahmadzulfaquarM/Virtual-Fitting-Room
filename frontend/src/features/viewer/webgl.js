/** True when the browser can create a WebGL context. Releases the probe context immediately. */
export function isWebGLAvailable(doc = document) {
  try {
    const canvas = doc.createElement('canvas')
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    if (!gl) return false
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}
