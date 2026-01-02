/**
 * Safe Shell Execution Helper
 *
 * Provides type-safe command execution that prevents shell injection.
 * Uses spawn with shell=false to ensure arguments are not interpreted.
 */

import { spawn } from 'child_process'

export interface ExecResult {
  success: boolean
  stdout: string
  stderr: string
  code: number
}

/**
 * Execute a command safely with array arguments (no shell interpolation)
 * Uses spawn with shell=false to prevent command injection.
 *
 * @param command - The command to execute (e.g., 'git', 'npm', 'gh')
 * @param args - Array of arguments (each argument is a separate string)
 * @param options - Optional execution options
 * @returns Promise resolving to execution result
 */
export const safeExec = async (
  command: string,
  args: string[],
  options?: { cwd?: string; timeout?: number }
): Promise<ExecResult> => {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd: options?.cwd,
      timeout: options?.timeout ?? 30000,
      shell: false,  // Critical: no shell interpolation
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      resolve({
        success: code === 0,
        stdout,
        stderr,
        code: code ?? 1,
      })
    })

    proc.on('error', (err) => {
      resolve({
        success: false,
        stdout: '',
        stderr: err.message,
        code: 1,
      })
    })
  })
}

/**
 * Validate npm package name follows npm naming rules
 * @see https://docs.npmjs.com/cli/v9/configuring-npm/package-json#name
 */
export function isValidNpmPackageName(name: string): boolean {
  // Scoped: @scope/name or unscoped: name
  // Only allows lowercase letters, numbers, hyphens, dots, underscores, and tildes
  return /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(name)
}
