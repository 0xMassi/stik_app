import { Component, type ErrorInfo, type ReactNode } from "react";
import { t } from "@/i18n";

/// App-level error boundary.
///
/// Without this a render error unmounts the tree and leaves an empty window,
/// which on a frameless always-on-top post-it looks identical to the app
/// having vanished. Notes are already on disk by the time anything renders, so
/// recovery is just a reload.
interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Kept as console output rather than analytics: crash contents can include
    // note text, and Stik never sends note content anywhere.
    console.error("Unhandled render error:", error, info.componentStack);
  }

  /// Clearing the captured error re-renders the tree in place. A full
  /// window.location.reload() also works, but throws away in-memory state the
  /// user may still be able to recover, so try the cheap path first.
  private resetErrorBoundary = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        role="alert"
        className="w-full h-full flex flex-col items-center justify-center gap-3 p-6 bg-bg text-center"
      >
        <p className="text-[14px] font-semibold text-ink">
          {t("app.errorTitle")}
        </p>
        <p className="text-[12px] text-stone max-w-[280px] leading-relaxed">
          {t("app.errorBody")}
        </p>
        <button
          type="button"
          onClick={this.resetErrorBoundary}
          className="mt-1 px-4 py-2 text-[12px] bg-coral text-white rounded-lg hover:bg-coral/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral"
        >
          {t("app.reload")}
        </button>
      </div>
    );
  }
}
