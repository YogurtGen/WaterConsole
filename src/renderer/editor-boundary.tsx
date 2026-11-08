import { Component, type ReactNode } from "react";
export class EditorBoundary extends Component<
  { children: ReactNode; onClose: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="builder-modal-overlay">
        <section className="builder-panel" role="alert">
          <h2>This tool could not be displayed.</h2>
          <p>
            Your controller draft is still here. Close and reopen the tool, or
            save and restart WaterConsole.
          </p>
          <button onClick={this.props.onClose}>Close tool</button>
        </section>
      </div>
    ) : (
      this.props.children
    );
  }
}
