import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 text-center" style={{ background: 'var(--bg, #0a0a0f)', color: '#f0e6d0' }}>
          <div className="max-w-md p-6 rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border, rgba(255,255,255,0.08))' }}>
            <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
            <p className="text-sm mb-4" style={{ color: '#a09880' }}>
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <button
              onClick={this.handleReload}
              className="px-4 py-2 rounded-xl text-sm font-semibold transition"
              style={{ background: 'var(--gold, #d4a843)', color: '#0a0a0f' }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
