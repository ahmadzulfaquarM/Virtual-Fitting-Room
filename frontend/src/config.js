/**
 * Central runtime configuration for the frontend.
 *
 * Only values prefixed with VITE_ are exposed to the browser bundle.
 * NEVER put API keys or secrets in a VITE_ variable: they are shipped to
 * every visitor. Secrets belong in the backend environment only.
 */
export const config = {
  /** Base path for backend calls. In dev, Vite proxies /api to the FastAPI service. */
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api',
  /** How long to wait for the backend before reporting it as unreachable. */
  healthTimeoutMs: 4000,
}
