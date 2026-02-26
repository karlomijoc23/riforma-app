import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { captureException } from "../shared/sentry";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });

    // Log to console in development
    if (process.env.NODE_ENV === "development") {
      console.error("ErrorBoundary caught:", error, errorInfo);
    }

    // Send to Sentry error tracking
    captureException(error, { componentStack: errorInfo.componentStack });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          role="alert"
          aria-live="assertive"
          className="flex min-h-[300px] sm:min-h-[400px] flex-col items-center justify-center gap-4 p-8"
        >
          <div className="rounded-full bg-destructive/10 p-4">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <div className="text-center">
            <h2 className="text-lg font-semibold">Nešto je pošlo po krivu</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Došlo je do neočekivane greške. Pokušajte osvježiti stranicu.
            </p>
            {process.env.NODE_ENV === "development" && this.state.error && (
              <details className="mt-4 max-w-lg text-left">
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  Detalji greške
                </summary>
                <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted p-3 text-xs">
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={this.handleReset}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Pokušaj ponovo
            </button>
            <button
              onClick={this.handleReload}
              className="inline-flex items-center gap-2 rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              <RefreshCw className="h-4 w-4" />
              Osvježi stranicu
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
