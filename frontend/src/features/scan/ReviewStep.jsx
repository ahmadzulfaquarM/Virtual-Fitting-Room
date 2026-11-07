import { Badge, Button, Card } from '../../components/ui'
import { SCAN_VIEWS } from './captureConfig'
import { BlobImage } from './BlobImage'

function Thumbnail({ view, shot, onRetake }) {
  return (
    <li className="rounded-xl border border-slate-200 p-3">
      <div className="aspect-[3/4] overflow-hidden rounded-lg bg-slate-50">
        <BlobImage
          blob={shot.blob}
          alt={`${view.label} photo`}
          className="h-full w-full object-contain"
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="font-semibold text-gray-900">{view.label}</span>
        <Button
          variant="secondary"
          className="px-3 py-1"
          onClick={() => onRetake(view.key)}
          aria-label={`Retake ${view.label} photo`}
        >
          Retake
        </Button>
      </div>
      {shot.warnings.length > 0 && (
        <div className="mt-2 space-y-1">
          <Badge tone="warning">Flagged</Badge>
          <ul className="list-disc pl-5 text-xs text-amber-700">
            {shot.warnings.map((w) => (
              <li key={w.id}>{w.hint}</li>
            ))}
          </ul>
        </div>
      )}
    </li>
  )
}

export function ReviewStep({
  shots,
  heightCm,
  approvalChecked,
  onApprovalChange,
  onRetake,
  onApprove,
  onDiscard,
}) {
  return (
    <Card aria-labelledby="scan-review-heading">
      <h2 id="scan-review-heading" className="text-lg font-semibold">
        Review your photos
      </h2>
      <p className="mt-1 text-sm">
        Height entered: {heightCm} cm. Retake any photo you are not happy with. Nothing has been
        uploaded.
      </p>

      <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {SCAN_VIEWS.map((view) =>
          shots[view.key] ? (
            <Thumbnail key={view.key} view={view} shot={shots[view.key]} onRetake={onRetake} />
          ) : null,
        )}
      </ul>

      <p className="mt-4 rounded-lg bg-blue-50 p-3 text-sm">
        Passing the camera checks does not guarantee accurate measurements. Flagged photos can still
        be used, but may give less reliable results.
      </p>

      <label className="mt-5 flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 h-5 w-5 accent-blue-600"
          checked={approvalChecked}
          onChange={(e) => onApprovalChange(e.target.checked)}
        />
        <span>I have looked at these photos and approve using them for my body scan.</span>
      </label>

      <div className="mt-5 flex flex-wrap gap-3">
        <Button onClick={onApprove} disabled={!approvalChecked}>
          Approve photos
        </Button>
        <Button variant="secondary" onClick={onDiscard}>
          Delete photos
        </Button>
      </div>
    </Card>
  )
}
