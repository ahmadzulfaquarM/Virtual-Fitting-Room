/**
 * Small shared building blocks so every screen (viewer, scanner, clothing selector,
 * measurements) uses the same card, button and badge styling as the shopping cart.
 * Class names are plain Tailwind utilities on purpose: they can be moved into the cart as-is.
 */

export function Card({ as: Tag = 'section', className = '', children, ...rest }) {
  return (
    <Tag
      className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  )
}

const buttonVariants = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 border-transparent',
  secondary: 'bg-white text-blue-600 border-blue-600 hover:bg-blue-50',
}

export function Button({ variant = 'primary', className = '', children, ...rest }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center rounded-lg border px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${buttonVariants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

/**
 * A button with an on/off state (selected size, active view, toggled option).
 * Selected = solid blue-600, as the store shows its selected sizes; exposed via aria-pressed.
 */
export function ToggleButton({ pressed, className = '', children, ...rest }) {
  // `pressed` undefined = a plain action button (no on/off state, no aria-pressed).
  const tone = pressed
    ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
    : 'border-slate-200 bg-white text-gray-600 hover:border-blue-600 hover:bg-blue-50 hover:text-blue-600'
  return (
    <button
      type="button"
      aria-pressed={pressed === undefined ? undefined : pressed}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${tone} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Spinner({ className = '' }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-5 w-5 animate-spin rounded-full border-2 border-blue-100 border-t-blue-600 ${className}`}
    />
  )
}

const badgeTones = {
  success: 'bg-green-50 text-green-700',
  danger: 'bg-red-50 text-red-700',
  warning: 'bg-amber-50 text-amber-700',
  info: 'bg-blue-50 text-blue-600',
}

export function Badge({ tone = 'info', className = '', children, ...rest }) {
  return (
    <strong
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeTones[tone]} ${className}`}
      {...rest}
    >
      {children}
    </strong>
  )
}
