/**
 * components/ui/ErrorBoundary.tsx
 * -----------------------------------------------------------------------------
 * React error boundary wrapping every major dashboard section so a crash in
 * AG Grid or a PayPal button can never take down the whole page.
 * -----------------------------------------------------------------------------
 */
'use client';
import { Component, type ReactNode } from 'react';

interface Props {
  fallback: ReactNode;
  componentName: string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error): void {
    console.error(`[ErrorBoundary::${this.props.componentName}]`, error.message);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}
