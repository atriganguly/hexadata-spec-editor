import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { HexaProvider } from '@hexadata/brand/react';
import { App } from './app/App.tsx';
import './styles/app.css';

/** Last line of defence: a render error never leaves a blank page, and never loses saved drafts. */
class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  override state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="boot" role="alert">
        <h1>Something went wrong</h1>
        <p className="hd-alert hd-alert--danger" style={{ maxInlineSize: '32rem' }}>
          {this.state.error.message}
        </p>
        <p className="hd-help">
          Your drafts are saved in this browser. Reloading the page is safe.
        </p>
        <button type="button" className="hd-btn" onClick={() => location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}

// `live={false}`: no brand-update requests; the pinned, vendored brand is used (strict CSP, offline).
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <HexaProvider live={false}>
        <App />
      </HexaProvider>
    </ErrorBoundary>
  </StrictMode>,
);
