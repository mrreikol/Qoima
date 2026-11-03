import { Component, Suspense } from "react";
import { Button } from "./ui";

// Reload is explicit: never automatically interrupt a form or stock recovery.
export default class RouteBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <section className="empty-state">
          <h1>Page unavailable</h1>
          <p role="alert">
            This page could not be loaded. Check your connection, then reload.
            Unsaved form entries will be lost.
          </p>
          <Button onClick={() => window.location.reload()}>Reload page</Button>
        </section>
      );
    }
    return (
      <Suspense fallback={<div className="empty-state" role="status">Loading page...</div>}>
        {this.props.children}
      </Suspense>
    );
  }
}
