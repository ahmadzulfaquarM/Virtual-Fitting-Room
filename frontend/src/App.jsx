import { HealthStatus } from './components/HealthStatus'
import { Badge, Card } from './components/ui'
import { Viewer } from './features/viewer/Viewer'
import { SAMPLE_ASSETS, resolveAssetUrls } from './features/viewer/sampleAssets'

// Read once. `?avatar=` / `?garment=` are a dev/test hook (same-origin .glb paths only).
const { avatarUrl, garmentUrl } = resolveAssetUrls(window.location.search)

export default function App() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <span className="text-xl font-bold text-blue-600">3D Fitting Room</span>
          <Badge tone="info">Phase 2 · Viewer</Badge>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-4 px-4 py-8">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">3D Virtual Fitting Room</h1>
          <p className="mt-1">
            Standalone development build · Phase 2: interactive 3D visualization
          </p>
        </div>

        <Viewer
          avatarUrl={avatarUrl}
          garmentUrl={garmentUrl}
          avatarLabel={SAMPLE_ASSETS.avatar.label}
          garmentLabel={SAMPLE_ASSETS.garment.label}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <HealthStatus />

          <Card aria-labelledby="roadmap-heading" className="bg-blue-50!">
            <h2 id="roadmap-heading" className="mb-2 text-lg font-semibold">
              Not built yet
            </h2>
            <p>
              Camera scanning, AI body reconstruction, garment try-on and size recommendation are
              later phases. Nothing on this page performs a body scan or fit estimate.
            </p>
          </Card>
        </div>
      </main>
    </div>
  )
}
