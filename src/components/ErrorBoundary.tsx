import React from 'react';
import { AlertTriangle, Play, RotateCcw } from 'lucide-react';
import { formatFriendlyErrorMessage, logAppError } from '../utils/errorHandler';

interface State {
  hasError: boolean;
  errorMessage: string;
  errorId: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '', errorId: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: formatFriendlyErrorMessage(error),
      errorId: '',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    const entry = logAppError({
      source: 'ui_render',
      action: 'ErrorBoundary',
      severity: 'critical',
      code: 'REACT_RENDER_ERROR',
      error,
      context: {
        componentStack: (info.componentStack || '').slice(0, 300),
      },
    });
    this.setState({ errorId: entry.id, errorMessage: entry.userMessage });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#F7F7F8] dark:bg-[#0B0B0D] p-6">
          <div className="max-w-md w-full rounded-2xl bg-white dark:bg-[#141418] border border-neutral-200 dark:border-neutral-800 p-6 alquia-card text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-red-50 dark:bg-red-950/50 text-[#C81E1E] mx-auto flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-display font-bold text-[#111114] dark:text-white">
              Se capturó un error inesperado
            </h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 break-words">
              {this.state.errorMessage}
            </p>
            {this.state.errorId && (
              <p className="text-[11px] font-mono text-zinc-500 bg-zinc-100 dark:bg-zinc-900 px-3 py-1.5 rounded-lg inline-block">
                Folio de registro automático: {this.state.errorId}
              </p>
            )}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, errorMessage: '', errorId: '' })}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl alquia-gold-outline-btn text-xs font-bold w-full sm:w-auto"
              >
                <Play className="w-3.5 h-3.5" />
                Continuar sin recargar
              </button>
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false, errorMessage: '', errorId: '' });
                  window.location.reload();
                }}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl alquia-gold-btn text-xs font-bold w-full sm:w-auto"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Recargar sistema
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
