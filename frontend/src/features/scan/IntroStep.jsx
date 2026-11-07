import { Button, Card } from '../../components/ui'
import { SETUP_TIPS } from './captureConfig'

export function IntroStep({ consent, onConsent, onContinue, support }) {
  return (
    <Card aria-labelledby="scan-intro-heading">
      <h2 id="scan-intro-heading" className="text-lg font-semibold">
        Guided body scan
      </h2>
      <p className="mt-1">
        We will take a few photos of you with your camera, one view at a time, checking each one as
        you go. The camera is switched on only after you press Start camera on the next screen.
      </p>

      {!support.supported && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {support.message}
        </p>
      )}

      <h3 className="mt-5 font-semibold text-gray-900">Before you start</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        {SETUP_TIPS.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>

      <h3 className="mt-5 font-semibold text-gray-900">Your privacy</h3>
      <p className="mt-1 text-sm">
        Photos are held in this browser tab only. Nothing is uploaded until you review the photos
        and approve them yourself, and you can delete them at any time.
      </p>

      <p className="mt-4 rounded-lg bg-blue-50 p-3 text-sm">
        Passing these camera checks only means the photo is usable. It does not mean any later
        measurement or size suggestion will be accurate.
      </p>

      <label className="mt-5 flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 h-5 w-5 accent-blue-600"
          checked={consent}
          onChange={(e) => onConsent(e.target.checked)}
        />
        <span>I understand that my camera will take photos of my body for this fitting room.</span>
      </label>

      <div className="mt-5">
        <Button onClick={onContinue} disabled={!consent || !support.supported}>
          Continue
        </Button>
      </div>
    </Card>
  )
}
