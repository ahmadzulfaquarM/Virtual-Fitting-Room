import { useState } from 'react'
import { Button, Card, ToggleButton } from '../../components/ui'
import { cmToFeetInches, parseHeight } from './heightInput'

const inputClass =
  'w-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-gray-900 focus:border-blue-600 focus:outline-2 focus:outline-blue-600'

export function HeightStep({ initialCm, onSubmit, onBack }) {
  const initialImperial = initialCm ? cmToFeetInches(initialCm) : null
  const [unit, setUnit] = useState('cm')
  const [cm, setCm] = useState(initialCm ? String(initialCm) : '')
  const [ft, setFt] = useState(initialImperial ? String(initialImperial.ft) : '')
  const [inch, setInch] = useState(initialImperial ? String(initialImperial.inch) : '')
  const [error, setError] = useState(null)

  const submit = (event) => {
    event.preventDefault()
    const result = parseHeight({ unit, cm, ft, inch })
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    onSubmit(result.cm)
  }

  return (
    <Card aria-labelledby="scan-height-heading">
      <h2 id="scan-height-heading" className="text-lg font-semibold">
        Your height
      </h2>
      <p className="mt-1 text-sm">
        Your height gives later steps a scale reference. We take your word for it: it is not checked
        against the photos.
      </p>

      <form onSubmit={submit} noValidate className="mt-4">
        <div className="flex gap-2" role="group" aria-label="Height unit">
          <ToggleButton pressed={unit === 'cm'} onClick={() => setUnit('cm')}>
            cm
          </ToggleButton>
          <ToggleButton pressed={unit === 'ftin'} onClick={() => setUnit('ftin')}>
            ft / in
          </ToggleButton>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          {unit === 'cm' ? (
            <label className="text-sm">
              <span className="mb-1 block font-medium text-gray-900">Height (cm)</span>
              <input
                className={inputClass}
                inputMode="decimal"
                value={cm}
                onChange={(e) => setCm(e.target.value)}
                aria-invalid={error ? 'true' : undefined}
                aria-describedby={error ? 'height-error' : undefined}
              />
            </label>
          ) : (
            <>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-900">Feet</span>
                <input
                  className={inputClass}
                  inputMode="numeric"
                  value={ft}
                  onChange={(e) => setFt(e.target.value)}
                  aria-invalid={error ? 'true' : undefined}
                  aria-describedby={error ? 'height-error' : undefined}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-900">Inches</span>
                <input
                  className={inputClass}
                  inputMode="decimal"
                  value={inch}
                  onChange={(e) => setInch(e.target.value)}
                />
              </label>
            </>
          )}
        </div>

        {error && (
          <p id="height-error" role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-3">
          <Button variant="secondary" onClick={onBack}>
            Back
          </Button>
          <Button type="submit">Start camera</Button>
        </div>
      </form>
    </Card>
  )
}
