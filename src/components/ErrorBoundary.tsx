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

  private resetLocalData = () => {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key?.startsWith('pomodoro_')) localStorage.removeItem(key);
    }
    window.location.reload();
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="min-h-screen flex items-center justify-center p-6 font-pixel">
        <div className="dialog max-w-lg p-6 text-center">
          <h1 className="text-2xl font-bold">Pomoflow could not load</h1>
          <p className="mt-2 text-lg">
            The data saved in this browser is invalid, or the app hit an unexpected error. Resetting the local data clears tasks and stats stored on this device.
          </p>
          <button type="button" onClick={this.resetLocalData} className="btn btn-default mt-5">
            Reset local data
          </button>
        </div>
      </main>
    );
  }
}
