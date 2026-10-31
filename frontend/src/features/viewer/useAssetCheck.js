import { useCallback, useEffect, useState } from 'react'
import { validateGlbAsset } from './assetCheck'

/**
 * Runs the pre-flight check for one asset URL.
 * status: 'idle' (no url) | 'checking' | 'ready' | 'error'.
 * Results are keyed by url + attempt so a changed url or a retry never shows a stale outcome.
 */
export function useAssetCheck(url, { validate = validateGlbAsset } = {}) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState({ key: null, status: 'checking', error: null })
  const key = `${url}#${attempt}`

  useEffect(() => {
    if (!url) return undefined
    const controller = new AbortController()
    validate(url, { signal: controller.signal }).then(
      () => {
        if (!controller.signal.aborted) setResult({ key, status: 'ready', error: null })
      },
      (error) => {
        if (!controller.signal.aborted) setResult({ key, status: 'error', error })
      },
    )
    return () => controller.abort()
  }, [url, key, validate])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  if (!url) return { status: 'idle', error: null, retry }
  if (result.key !== key) return { status: 'checking', error: null, retry }
  return { status: result.status, error: result.error, retry }
}
