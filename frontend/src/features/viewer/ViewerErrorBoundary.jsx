import { Component } from 'react'

/**
 * Catches errors thrown while a model loads or renders (corrupt file, unsupported extension, ...).
 * `children` is a function-free subtree; `fallback({ error, retry })` renders the error UI.
 * Used in two places: around the whole canvas (avatar errors are fatal) and around each garment
 * (a broken garment must not take the avatar down).
 */
export class ViewerErrorBoundary extends Component {
  state = { error: null, resetKey: this.props.resetKey }

  static getDerivedStateFromError(error) {
    return { error }
  }

  static getDerivedStateFromProps(props, state) {
    // A new resetKey (for example a different garment url) clears a previous error.
    if (props.resetKey !== state.resetKey) return { error: null, resetKey: props.resetKey }
    return null
  }

  componentDidCatch(error) {
    this.props.onError?.(error)
  }

  retry = () => {
    this.setState({ error: null })
    this.props.onRetry?.()
  }

  render() {
    if (this.state.error) return this.props.fallback({ error: this.state.error, retry: this.retry })
    return this.props.children
  }
}
