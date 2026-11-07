import { useEffect, useReducer } from 'react'
import { Button, Card } from '../../components/ui'
import { CameraStep } from './CameraStep'
import { viewByKey } from './captureConfig'
import { defaultServices } from './defaultServices'
import { HeightStep } from './HeightStep'
import { IntroStep } from './IntroStep'
import { ReviewStep } from './ReviewStep'
import { allCaptured, initialScanState, scanReducer } from './scanReducer'

/**
 * The guided scan: intro and consent -> height -> camera (one view at a time) -> review -> approval.
 *
 * Photos live only in this component's state as Blobs. `onApprove({ heightCm, shots })` is the only
 * way they can leave it, and it is only called after the person ticks the approval box and presses
 * Approve. Phase 3 passes no upload handler, so nothing is ever sent anywhere.
 */
export function ScanFlow({ services = defaultServices, onApprove, onClose }) {
  const [state, dispatch] = useReducer(scanReducer, initialScanState)

  // Drop the photos if the flow is closed or navigated away from.
  useEffect(() => () => dispatch({ type: 'DISCARD' }), [])

  const approve = () => {
    if (!state.approvalChecked || !allCaptured(state)) return
    dispatch({ type: 'APPROVE' })
    onApprove?.({ heightCm: state.heightCm, shots: state.shots })
  }

  switch (state.step) {
    case 'intro':
      return (
        <IntroStep
          consent={state.consent}
          support={services.getCameraSupport()}
          onConsent={(value) => dispatch({ type: 'SET_CONSENT', value })}
          onContinue={() => dispatch({ type: 'CONTINUE_FROM_INTRO' })}
        />
      )
    case 'height':
      return (
        <HeightStep
          initialCm={state.heightCm}
          onSubmit={(cm) => dispatch({ type: 'SET_HEIGHT', cm })}
          onBack={() => dispatch({ type: 'BACK' })}
        />
      )
    case 'camera':
      return (
        <CameraStep
          view={viewByKey(state.viewKey)}
          shots={state.shots}
          services={services}
          onCaptured={(shot) => dispatch({ type: 'SHOT_CAPTURED', shot })}
          onBack={() => dispatch({ type: 'BACK' })}
        />
      )
    case 'review':
      return (
        <ReviewStep
          shots={state.shots}
          heightCm={state.heightCm}
          approvalChecked={state.approvalChecked}
          onApprovalChange={(value) => dispatch({ type: 'SET_APPROVAL_CHECKED', value })}
          onRetake={(viewKey) => dispatch({ type: 'RETAKE', viewKey })}
          onApprove={approve}
          onDiscard={() => dispatch({ type: 'DISCARD' })}
        />
      )
    default:
      return (
        <Card aria-labelledby="scan-approved-heading">
          <h2 id="scan-approved-heading" className="text-lg font-semibold">
            Photos approved
          </h2>
          <p className="mt-1" data-testid="scan-approved-note">
            {onApprove
              ? 'Your approved photos were handed to the next step.'
              : 'Nothing has left this browser. Uploading the photos for 3D reconstruction is built in Phase 4.'}
          </p>
          <div className="mt-4 flex gap-3">
            <Button variant="secondary" onClick={() => dispatch({ type: 'DISCARD' })}>
              Delete photos and start again
            </Button>
            {onClose && (
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
            )}
          </div>
        </Card>
      )
  }
}
