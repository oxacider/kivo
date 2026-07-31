'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex min-h-dvh w-screen flex-col items-center justify-center bg-background px-6 text-center">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute left-1/3 top-1/4 h-80 w-80 rounded-full bg-destructive/5 blur-3xl" />
          </div>

          <div className="relative z-10 flex w-full max-w-sm flex-col items-center">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>

            <h1 className="mb-2 text-xl font-semibold tracking-tight text-foreground">
              Something went wrong
            </h1>
            <p className="mb-8 max-w-xs text-sm text-muted-foreground leading-relaxed">
              {this.state.error?.message || 'An unexpected error occurred. Please try again.'}
            </p>

            <button
              onClick={this.handleRetry}
              className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <RefreshCw className="h-4 w-4" />
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
