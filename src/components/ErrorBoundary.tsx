import React from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || "An unexpected error occurred.",
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("Application error boundary caught:", error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, message: "" });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-paper dark:bg-obsidian text-ink dark:text-parchment flex items-center justify-center p-6">
          <div className="max-w-lg w-full border border-limestone dark:border-charcoal-border bg-linen dark:bg-soot rounded-lg p-8 space-y-5">
            <p className="text-xs font-mono tracking-wider uppercase text-sienna dark:text-brass">
              Error
            </p>
            <h1 className="font-serif text-2xl font-semibold">
              Something went wrong
            </h1>
            <p className="text-sm text-ink-muted dark:text-ash leading-relaxed break-words">
              {this.state.message}
            </p>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="px-4 py-2 text-sm font-medium rounded-md bg-lapis text-white hover:bg-blue-800 dark:bg-lapis-dark dark:text-obsidian dark:hover:bg-blue-300 transition-colors"
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2 text-sm font-medium rounded-md border border-limestone dark:border-charcoal-border hover:bg-paper dark:hover:bg-obsidian transition-colors"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
