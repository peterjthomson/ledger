/**
 * Error Helpers
 *
 * Pure functions for safe error serialization and logging in IPC handlers.
 * Handles all error types: Error objects, strings, unknown values.
 *
 * ## Error Logging Patterns
 *
 * Ledger uses two error logging patterns in IPC handlers:
 *
 * ### 1. `logHandlerError()` - For operations that return error status
 *
 * Use when the handler returns an error object to the caller:
 * ```typescript
 * handle('operation', async () => {
 *   try {
 *     return await doSomething()
 *   } catch (error) {
 *     logHandlerError('operation', error)  // Structured logging
 *     return { success: false, error: serializeError(error) }
 *   }
 * })
 * ```
 *
 * **When to use**: PR operations, plugin install, commit, push - operations
 * where the user needs to see the error message in the UI.
 *
 * ### 2. `console.error()` with prefix - For silent degradation
 *
 * Use when the handler returns empty data instead of an error:
 * ```typescript
 * handle('get-items', async () => {
 *   try {
 *     return await fetchItems()
 *   } catch (error) {
 *     console.error('[handler] get-items error:', error)  // For debugging
 *     return []  // Silent degradation - return empty instead of error
 *   }
 * })
 * ```
 *
 * **When to use**: Data fetching operations (branches, worktrees, commits)
 * where empty results are acceptable and the UI can handle missing data.
 *
 * ## Guidelines
 *
 * - Always use `serializeError()` when including error in response objects
 * - Never expose stack traces to the renderer (security risk)
 * - Use handler name as prefix for traceability in logs
 */

/**
 * Safely serialize any error type to a string message.
 * Pure function - no side effects.
 */
export function serializeError(error: unknown): string {
  if (error === null || error === undefined) {
    return 'Unknown error'
  }
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return String(error)
}

/**
 * Create a standardized error response object.
 * Use this for consistent error returns from IPC handlers.
 */
export function errorResponse(error: unknown): { success: false; error: string } {
  return {
    success: false,
    error: serializeError(error),
  }
}

/**
 * Log error with handler context.
 * Includes stack trace in debug output when available.
 */
export function logHandlerError(handler: string, error: unknown): void {
  console.error(`[${handler}] Error:`, serializeError(error))
  if (error instanceof Error && error.stack) {
    console.debug(`[${handler}] Stack:`, error.stack)
  }
}
