import React from 'react';

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-zinc-950 p-8">
          <div className="max-w-lg rounded-xl border border-rose-500/30 bg-white dark:bg-zinc-900 p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-rose-600 dark:text-rose-400">
              Произошла ошибка интерфейса
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400 font-mono">
              {this.state.errorMessage}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              Перезагрузить интерфейс
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
