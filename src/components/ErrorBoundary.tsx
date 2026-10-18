import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Pomoflow render failure', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="min-h-screen flex items-center justify-center p-6 font-pixel">
        <div className="dialog max-w-lg p-6 text-center">
          <h1 className="text-2xl font-bold">Pomoflow could not load</h1>
          <p className="mt-2 text-lg">
            The app hit an unexpected error. Your saved tasks and stats are still on this device. Try reloading.
          </p>
          <button type="button" onClick={() => window.location.reload()} className="btn btn-default mt-5">
            Reload
          </button>
        </div>
      </main>
    );
  }
}
