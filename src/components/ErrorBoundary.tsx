import { Component, type ReactNode } from 'react';
import { logger } from '../utils/logger';

interface Props {
  children: ReactNode;
  /** Rendered in place of the children after a caught error. */
  fallback?: ReactNode;
  /** Notified once when an error is caught (e.g. to close the failed panel). */
  onError?: (error: unknown) => void;
}

interface State {
  failed: boolean;
}

/**
 * Contains a render/lifecycle crash to its subtree so it can never white-screen
 * the whole app. Used around the lazy sound editor: if anything throws while
 * shaping a sound, the panel bows out quietly and the mix keeps playing.
 *
 * Reset by giving the boundary a `key` that changes (e.g. the sound id), so a
 * fresh subtree mounts clean rather than staying stuck in the failed state.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // Keep a breadcrumb in the console without taking the app down.
    logger.error('Contained UI error:', error);
    this.props.onError?.(error);
  }

  render() {
    if (this.state.failed) return this.props.fallback ?? null;
    return this.props.children;
  }
}
