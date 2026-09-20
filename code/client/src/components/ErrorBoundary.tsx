import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ResQ ErrorBoundary] Uncaught runtime exception:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 m-4 bg-paper-raised border border-slate-line border-l-4 border-l-rust font-sans text-ink space-y-3 shadow-xs">
          <div className="font-mono text-xs text-rust font-bold uppercase">
            {this.props.fallbackTitle || 'FIELD CONSOLE EXCEPTION CAUGHT'}
          </div>
          <p className="text-sm text-ink leading-relaxed">
            A rendering error occurred in this view. The application caught the exception to prevent a complete interface crash.
          </p>
          {this.state.error && (
            <pre className="p-3 bg-paper border border-slate-line font-mono text-xs text-rust overflow-x-auto">
              {this.state.error.message}
            </pre>
          )}
          <div>
            <button
              type="button"
              onClick={this.handleReset}
              className="bg-ink text-white font-sans text-xs font-semibold px-4 py-2 rounded-[3px] hover:bg-ink-soft cursor-pointer"
            >
              Reload console
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
