import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/** Contains render errors to the active view instead of unmounting the app. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("View error:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="placeholder">
          <div>
            <div style={{ marginBottom: 8 }}>This view hit an error.</div>
            <div style={{ color: "var(--t-removed)", fontSize: 12, marginBottom: 12 }}>
              {this.state.error.message}
            </div>
            <button className="btn" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
