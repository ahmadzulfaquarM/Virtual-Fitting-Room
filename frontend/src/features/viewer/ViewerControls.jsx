import { FaSearchMinus, FaSearchPlus, FaSyncAlt, FaTshirt, FaUndo } from 'react-icons/fa'
import { ToggleButton } from '../../components/ui'
import { VIEWS } from './viewPresets'

/**
 * Toolbar under the 3D canvas. Purely presentational: it reports intent through callbacks and
 * never touches the camera itself, so it can be tested without WebGL.
 */
export function ViewerControls({
  activeView,
  onSelectView,
  onZoomIn,
  onZoomOut,
  onReset,
  autoRotate,
  onToggleAutoRotate,
  garmentAvailable,
  showGarment,
  onToggleGarment,
  disabled = false,
}) {
  return (
    <div
      role="toolbar"
      aria-label="3D viewer controls"
      className="mt-4 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between"
    >
      <div role="group" aria-label="Camera view" className="grid grid-cols-4 gap-2 lg:flex">
        {VIEWS.map((view) => (
          <ToggleButton
            key={view.key}
            pressed={activeView === view.key}
            disabled={disabled}
            onClick={() => onSelectView(view.key)}
          >
            {view.label}
          </ToggleButton>
        ))}
      </div>

      <div role="group" aria-label="Zoom and reset" className="grid grid-cols-4 gap-2 lg:flex">
        <ToggleButton aria-label="Zoom in" title="Zoom in" disabled={disabled} onClick={onZoomIn}>
          <FaSearchPlus aria-hidden="true" />
        </ToggleButton>
        <ToggleButton
          aria-label="Zoom out"
          title="Zoom out"
          disabled={disabled}
          onClick={onZoomOut}
        >
          <FaSearchMinus aria-hidden="true" />
        </ToggleButton>
        <ToggleButton
          aria-label="Reset view"
          title="Reset view"
          disabled={disabled}
          onClick={onReset}
        >
          <FaUndo aria-hidden="true" />
        </ToggleButton>
        <ToggleButton
          pressed={autoRotate}
          aria-label="Auto-rotate"
          title="Auto-rotate"
          disabled={disabled}
          onClick={onToggleAutoRotate}
        >
          <FaSyncAlt aria-hidden="true" />
        </ToggleButton>
      </div>

      <ToggleButton
        pressed={showGarment && garmentAvailable}
        disabled={disabled || !garmentAvailable}
        onClick={onToggleGarment}
      >
        <FaTshirt aria-hidden="true" />
        Show garment
      </ToggleButton>
    </div>
  )
}
