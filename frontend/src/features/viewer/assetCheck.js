/**
 * Pre-flight check for 3D assets, run BEFORE the WebGL loader touches them.
 *
 * Why: a missing file on a Vite/SPA host usually answers 200 with index.html, which the glTF loader
 * would report as a confusing JSON parse error. Reading the first 12 bytes lets us give a precise,
 * human-readable reason instead (missing / not a GLB / wrong version / network / timeout).
 */

export class AssetError extends Error {
  /**
   * @param {'missing'|'invalid'|'network'|'timeout'|'http'} code
   * @param {string} message
   * @param {{url?: string, status?: number, cause?: unknown}} [details]
   */
  constructor(code, message, details = {}) {
    super(message, details.cause ? { cause: details.cause } : undefined)
    this.name = 'AssetError'
    this.code = code
    this.url = details.url
    this.status = details.status
  }
}

const GLB_MAGIC = 0x46546c67 // "glTF" read as a little-endian uint32
const HEADER_BYTES = 12

async function readHead(response, bytes) {
  if (!response.body || typeof response.body.getReader !== 'function') {
    return new Uint8Array(await response.arrayBuffer()).slice(0, bytes)
  }
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  try {
    while (total < bytes) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      total += value.length
    }
  } finally {
    // We only need the header; stop downloading the rest.
    reader.cancel().catch(() => {})
  }
  const head = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    head.set(chunk, offset)
    offset += chunk.length
  }
  return head.slice(0, bytes)
}

/**
 * Resolves `{ ok: true }` for a fetchable binary glTF 2.0 file, otherwise throws AssetError.
 *
 * @param {string} url
 * @param {{ fetchImpl?: typeof fetch, signal?: AbortSignal, timeoutMs?: number }} [options]
 */
export async function validateGlbAsset(url, options = {}) {
  const { fetchImpl = fetch, signal, timeoutMs = 8000 } = options
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const forwardAbort = () => controller.abort()
  signal?.addEventListener('abort', forwardAbort)

  const failTransport = (cause) => {
    if (timedOut) {
      return new AssetError('timeout', `The server did not respond within ${timeoutMs} ms.`, {
        url,
        cause,
      })
    }
    return new AssetError('network', 'The file could not be downloaded.', { url, cause })
  }

  try {
    let response
    try {
      response = await fetchImpl(url, {
        signal: controller.signal,
        headers: { Range: `bytes=0-${HEADER_BYTES - 1}` },
      })
    } catch (cause) {
      if (signal?.aborted) throw cause
      throw failTransport(cause)
    }

    if (response.status === 404 || response.status === 410) {
      throw new AssetError('missing', 'The file does not exist on the server.', {
        url,
        status: response.status,
      })
    }
    if (response.status === 416) {
      throw new AssetError('invalid', 'The file is empty.', { url, status: 416 })
    }
    if (!response.ok) {
      throw new AssetError('http', `The server responded with HTTP ${response.status}.`, {
        url,
        status: response.status,
      })
    }
    const contentType = response.headers.get('content-type') ?? ''
    if (contentType.includes('text/html')) {
      throw new AssetError(
        'missing',
        'The server returned a web page instead of a 3D model, so the file is probably missing.',
        { url, status: response.status },
      )
    }

    let head
    try {
      head = await readHead(response, HEADER_BYTES)
    } catch (cause) {
      if (signal?.aborted) throw cause
      throw failTransport(cause)
    }

    if (head.length < HEADER_BYTES) {
      throw new AssetError('invalid', 'The file is empty or truncated.', { url })
    }
    const view = new DataView(head.buffer, head.byteOffset, head.byteLength)
    if (view.getUint32(0, true) !== GLB_MAGIC) {
      throw new AssetError('invalid', 'This file is not a binary glTF (.glb) model.', { url })
    }
    const version = view.getUint32(4, true)
    if (version !== 2) {
      throw new AssetError(
        'invalid',
        `Unsupported glTF version ${version}; only glTF 2.0 is supported.`,
        { url },
      )
    }
    return { ok: true }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', forwardAbort)
  }
}

/** Short, user-presentable explanation of an asset check failure. */
export function describeAssetError(error, label = '3D model') {
  const code = error instanceof AssetError ? error.code : undefined
  switch (code) {
    case 'missing':
      return {
        title: `${label} not found`,
        detail: `The file${error.url ? ` ${error.url}` : ''} is missing from the server. Check the path or upload the asset.`,
      }
    case 'invalid':
      return { title: `${label} is not a valid 3D model`, detail: error.message }
    case 'network':
      return {
        title: `Could not download the ${label.toLowerCase()}`,
        detail: 'Check your internet connection and try again.',
      }
    case 'timeout':
      return {
        title: `The ${label.toLowerCase()} took too long to download`,
        detail: error.message,
      }
    case 'http':
      return { title: `The ${label.toLowerCase()} could not be loaded`, detail: error.message }
    default:
      return {
        title: `The ${label.toLowerCase()} could not be loaded`,
        detail: error instanceof Error ? error.message : 'Unknown error.',
      }
  }
}

/** Explanation for an error thrown while parsing or rendering a model that passed the check. */
export function describeRuntimeError(error) {
  return {
    title: 'The 3D model could not be displayed',
    detail: error instanceof Error && error.message ? error.message : 'Unknown rendering error.',
  }
}
