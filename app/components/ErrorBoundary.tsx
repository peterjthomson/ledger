import { Component, ErrorInfo, ReactNode } from 'react'
import { Button } from './ui/button'
import { Badge } from './ui/badge'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {
    // Error is already captured in state and displayed to user
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <div className="max-w-md w-full space-y-6">
              {/* Error Icon */}
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-destructive"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                    />
                  </svg>
                </div>
              </div>

              {/* Error Content */}
              <div className="text-center space-y-4">
                <div className="space-y-2">
                  <h1 className="text-2xl font-semibold text-foreground">Something went wrong</h1>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    An unexpected error occurred in the application. Please try refreshing the page or contact support
                    if the problem persists.
                  </p>
                </div>

                {/* Error Details */}
                {this.state.error && (
                  <details className="group">
                    <summary className="cursor-pointer list-none">
                      <Badge variant="outline" className="hover:bg-accent border-border/50">
                        <svg
                          className="w-4 h-4 mr-1 transition-transform group-open:rotate-180"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                        Error Details
                      </Badge>
                    </summary>
                    <div className="mt-3 p-4 bg-muted/50 rounded-lg border border-border/50 text-left">
                      <div className="space-y-2">
                        <div>
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Error Message
                          </span>
                          <pre className="mt-1 text-sm text-foreground bg-background p-2 rounded border border-border/50 overflow-x-auto">
                            {this.state.error.message}
                          </pre>
                        </div>
                        {this.state.error.stack && (
                          <div>
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Stack Trace
                            </span>
                            <pre className="mt-1 text-xs text-muted-foreground bg-background p-2 rounded border border-border/50 overflow-x-auto max-h-32">
                              {this.state.error.stack}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  </details>
                )}

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <Button onClick={() => window.location.reload()} className="flex-1" size="lg">
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    Reload Page
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => this.setState({ hasError: false, error: undefined })}
                    className="flex-1"
                    size="lg"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 19l-7-7m0 0l7-7m-7 7h18"
                      />
                    </svg>
                    Try Again
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )
      )
    }

    return this.props.children
  }
}
