import { Suspense, lazy, useState } from 'react'
import { HealthStatus } from './components/HealthStatus'
import { Badge, Button, Card, Spinner } from './components/ui'
import { Viewer } from './features/viewer/Viewer'
import { SAMPLE_ASSETS, resolveAssetUrls } from './features/viewer/sampleAssets'

// The scanner (and MediaPipe behind it) is only downloaded when the person opens it.
const ScanFlow = lazy(() =>
  import('./features/scan/ScanFlow').then((m) => ({ default: m.ScanFlow })),
)

// Read once. `?avatar=` / `?garment=` are a dev/test hook (same-origin .glb paths only).
const { avatarUrl, garmentUrl } = resolveAssetUrls(window.location.search)

export default function App() {
  const [scanOpen, setScanOpen] = useState(false)
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <span className="text-xl font-bold text-blue-600">3D Fitting Room</span>
          <Badge tone="info">Phase 3 · Scan</Badge>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-4 px-4 py-8">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">3D Virtual Fitting Room</h1>
          <p className="mt-1">Standalone development build · Phase 3: guided camera scanning</p>
        </div>

        <Viewer
          avatarUrl={avatarUrl}
          garmentUrl={garmentUrl}
          avatarLabel={SAMPLE_ASSETS.avatar.label}
          garmentLabel={SAMPLE_ASSETS.garment.label}
        />

        {scanOpen ? (
          <Suspense
            fallback={
              <Card className="flex items-center gap-3">
                <Spinner /> <span role="status">Loading scanner…</span>
              </Card>
            }
          >
            <ScanFlow onClose={() => setScanOpen(false)} />
          </Suspense>
        ) : (
          <Card aria-labelledby="scan-heading">
            <h2 id="scan-heading" className="text-lg font-semibold">
              Body scan
            </h2>
            <p className="mt-1">
              Take guided photos with your camera. The camera stays off until you start.
            </p>
            <div className="mt-4">
              <Button onClick={() => setScanOpen(true)}>Start body scan</Button>
            </div>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <HealthStatus />

          <Card aria-labelledby="roadmap-heading" className="bg-blue-50!">
            <h2 id="roadmap-heading" className="mb-2 text-lg font-semibold">
              Not built yet
            </h2>
            <p>
              AI body reconstruction, garment try-on and size recommendation are later phases.
              Nothing on this page reconstructs your body or estimates a fit; the scan only takes
              photos.
            </p>
          </Card>
        </div>
      </main>
    </div>
  )
}
