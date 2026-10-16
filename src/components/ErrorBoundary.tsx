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
      <main className="min-h-screen flex items-center justify-center p-6 bg-[#e4e4e4] text-neutral-900 font-pixel">
        <div className="max-w-lg border-2 border-neutral-700 bg-[#cfcfcf] p-6 shadow-[6px_6px_0px_rgba(0,0,0,0.25)] text-center">
          <h1 className="text-3xl uppercase">Pomoflow could not load</h1>
          <p className="mt-2 font-mono-tech">
            Saved browser data is invalid or the app hit an unexpected error. Reset local Pomoflow data to recover.
          </p>
          <button type="button" onClick={this.resetLocalData} className="mt-5 px-4 py-2 bg-neutral-800 text-white uppercase cursor-pointer">
            Reset local data
          </button>
        </div>
      </main>
    );
  }
}
