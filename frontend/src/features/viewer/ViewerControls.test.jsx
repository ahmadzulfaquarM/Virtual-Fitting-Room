import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ViewerControls } from './ViewerControls'

function setup(props = {}) {
  const handlers = {
    onSelectView: vi.fn(),
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onReset: vi.fn(),
    onToggleAutoRotate: vi.fn(),
    onToggleGarment: vi.fn(),
  }
  render(
    <ViewerControls
      activeView="front"
      autoRotate={false}
      garmentAvailable
      showGarment
      {...handlers}
      {...props}
    />,
  )
  return handlers
}

describe('ViewerControls', () => {
  it('lets the user pick each view and marks the active one', async () => {
    const h = setup({ activeView: 'back' })
    expect(screen.getByRole('button', { name: 'Back' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Front' })).toHaveAttribute('aria-pressed', 'false')

    for (const name of ['Front', 'Left', 'Back', 'Right']) {
      await userEvent.click(screen.getByRole('button', { name }))
    }
    expect(h.onSelectView.mock.calls.map((c) => c[0])).toEqual(['front', 'left', 'back', 'right'])
  })

  it('has working zoom, reset and auto-rotate buttons', async () => {
    const h = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    await userEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    await userEvent.click(screen.getByRole('button', { name: 'Reset view' }))
    await userEvent.click(screen.getByRole('button', { name: 'Auto-rotate' }))
    expect(h.onZoomIn).toHaveBeenCalledTimes(1)
    expect(h.onZoomOut).toHaveBeenCalledTimes(1)
    expect(h.onReset).toHaveBeenCalledTimes(1)
    expect(h.onToggleAutoRotate).toHaveBeenCalledTimes(1)
  })

  it('action buttons are not toggles, auto-rotate is', () => {
    setup({ autoRotate: true })
    expect(screen.getByRole('button', { name: 'Zoom in' })).not.toHaveAttribute('aria-pressed')
    expect(screen.getByRole('button', { name: 'Auto-rotate' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('toggles the garment', async () => {
    const h = setup()
    const button = screen.getByRole('button', { name: /show garment/i })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(button)
    expect(h.onToggleGarment).toHaveBeenCalledTimes(1)
  })

  it('disables the garment toggle when there is no usable garment', () => {
    setup({ garmentAvailable: false })
    const button = screen.getByRole('button', { name: /show garment/i })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-pressed', 'false')
  })

  it('disables every control while the model is not ready', () => {
    setup({ disabled: true })
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled()
  })
})
