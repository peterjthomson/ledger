/**
 * Shell Escape Utility
 *
 * Provides safe escaping for shell command arguments to prevent command injection.
 */

/**
 * Escape a string for safe use in shell commands
 *
 * Uses POSIX single-quote escaping: wrap in single quotes and escape embedded single quotes.
 * This is the safest method for arbitrary strings as single quotes prevent all shell expansion.
 *
 * @example
 * shellEscape("hello world") // "'hello world'"
 * shellEscape("it's here")   // "'it'\\''s here'"
 */
export function shellEscape(arg: string): string {
  return "'" + arg.replace(/'/g, "'\\''") + "'"
}
