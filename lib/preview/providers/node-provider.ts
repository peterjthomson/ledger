/**
 * Node Provider - Universal JavaScript/TypeScript Project Preview
 *
 * The fallback provider for any Node.js project with a `dev` script.
 * Works with all major JS frameworks:
 *
 * - Vite (React, Vue, Svelte)
 * - Next.js
 * - Nuxt
 * - Create React App
 * - Astro
 * - SvelteKit
 * - Remix
 * - Any project with `npm run dev`
 *
 * Note: This provider is intentionally LAST in priority.
 * Laravel/Rails apps also have package.json, but we want their
 * native servers (PHP/Ruby), not a Node dev server.
 *
 * How it works:
 * 1. Detects package.json with "dev" script
 * 2. Runs `npm run dev` (or yarn/pnpm/bun)
 * 3. Parses stdout to find the local URL
 * 4. Opens in browser
 * 5. Tracks running processes for cleanup
 */

import { spawn, ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { shell } from 'electron'

// ============================================================================
// Types
// ============================================================================

export interface PreviewResult {
  success: boolean
  message: string
  url?: string
  warnings?: string[]
}

export interface ProviderAvailability {
  available: boolean
  compatible: boolean
  reason?: string
}

interface RunningServer {
  process: ChildProcess
  url: string
  port: number
  startedAt: Date
}

// ============================================================================
// State
// ============================================================================

// Track running dev servers by worktree path
const runningServers = new Map<string, RunningServer>()

// Port allocation - start at 3001 to avoid conflicts with user's main dev server
let nextPort = 3001

// Common URL patterns in dev server output
const URL_PATTERNS = [
  // Vite: "Local:   http://localhost:5173/"
  /Local:\s+(https?:\/\/[^\s]+)/i,
  // Next.js: "- Local: http://localhost:3000"
  /-\s*Local:\s*(https?:\/\/[^\s]+)/i,
  // CRA/generic: "http://localhost:3000"
  /(https?:\/\/localhost:\d+)/,
  // With network URL fallback
  /(https?:\/\/127\.0\.0\.1:\d+)/,
  // Nuxt: "Listening on http://localhost:3000"
  /Listening on\s+(https?:\/\/[^\s]+)/i,
  // Astro: "Local    http://localhost:4321/"
  /Local\s+(https?:\/\/[^\s]+)/i,
]

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Read and parse package.json from a directory
 */
function readPackageJson(dirPath: string): Record<string, unknown> | null {
  try {
    const pkgPath = path.join(dirPath, 'package.json')
    if (!fs.existsSync(pkgPath)) return null
    const content = fs.readFileSync(pkgPath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return null
  }
}

/**
 * Check if package.json has a dev script
 */
function hasDevScript(dirPath: string): boolean {
  const pkg = readPackageJson(dirPath)
  if (!pkg) return false
  const scripts = pkg.scripts as Record<string, string> | undefined
  return !!scripts?.dev
}

/**
 * Get the dev script command (for display/debugging)
 */
function _getDevScript(dirPath: string): string | null {
  const pkg = readPackageJson(dirPath)
  if (!pkg) return null
  const scripts = pkg.scripts as Record<string, string> | undefined
  return scripts?.dev || null
}

/**
 * Detect the framework from package.json dependencies
 */
function detectFramework(dirPath: string): string {
  const pkg = readPackageJson(dirPath)
  if (!pkg) return 'Unknown'

  const deps = {
    ...(pkg.dependencies as Record<string, string> || {}),
    ...(pkg.devDependencies as Record<string, string> || {}),
  }

  if (deps['next']) return 'Next.js'
  if (deps['nuxt']) return 'Nuxt'
  if (deps['@sveltejs/kit']) return 'SvelteKit'
  if (deps['astro']) return 'Astro'
  if (deps['remix']) return 'Remix'
  if (deps['vite']) return 'Vite'
  if (deps['react-scripts']) return 'Create React App'
  if (deps['vue']) return 'Vue'
  if (deps['react']) return 'React'
  if (deps['svelte']) return 'Svelte'

  return 'Node.js'
}

/**
 * Check if node_modules exists (dependencies installed)
 */
function hasNodeModules(dirPath: string): boolean {
  return fs.existsSync(path.join(dirPath, 'node_modules'))
}

/**
 * Parse server output to find the local URL
 */
function parseUrlFromOutput(output: string): string | null {
  for (const pattern of URL_PATTERNS) {
    const match = output.match(pattern)
    if (match) {
      return match[1]
    }
  }
  return null
}

/**
 * Find an available port
 */
function getNextPort(): number {
  const port = nextPort
  nextPort++
  // Wrap around if we get too high
  if (nextPort > 9999) {
    nextPort = 3001
  }
  return port
}

// ============================================================================
// Provider Implementation
// ============================================================================

/**
 * Check if npm dev preview is available for a project
 */
export async function checkAvailability(
  repoPath: string,
  targetPath?: string
): Promise<ProviderAvailability> {
  const checkPath = targetPath || repoPath

  // Check for package.json with dev script
  const hasDev = hasDevScript(checkPath)

  if (!hasDev) {
    // Check if package.json exists at all
    const pkg = readPackageJson(checkPath)
    if (!pkg) {
      return {
        available: true, // npm is generally available
        compatible: false,
        reason: 'No package.json found',
      }
    }
    return {
      available: true,
      compatible: false,
      reason: 'No "dev" script in package.json',
    }
  }

  // Check if dependencies are installed
  const hasDeps = hasNodeModules(checkPath)
  const framework = detectFramework(checkPath)

  return {
    available: true,
    compatible: true,
    reason: hasDeps ? undefined : `${framework} project (run npm install first)`,
  }
}

/**
 * Preview a worktree by running npm run dev
 */
export async function previewWorktree(
  worktreePath: string,
  mainRepoPath: string
): Promise<PreviewResult> {
  const warnings: string[] = []

  // Check if already running
  const existing = runningServers.get(worktreePath)
  if (existing) {
    // Server already running - just open the URL
    await shell.openExternal(existing.url)
    return {
      success: true,
      message: `Already running at ${existing.url}`,
      url: existing.url,
    }
  }

  // Check for package.json
  if (!hasDevScript(worktreePath)) {
    return {
      success: false,
      message: 'No "dev" script found in package.json',
    }
  }

  // Check/setup node_modules
  if (!hasNodeModules(worktreePath)) {
    // Try to symlink from main repo
    const mainNodeModules = path.join(mainRepoPath, 'node_modules')
    const worktreeNodeModules = path.join(worktreePath, 'node_modules')

    if (fs.existsSync(mainNodeModules)) {
      try {
        await fs.promises.symlink(mainNodeModules, worktreeNodeModules)
        warnings.push('Symlinked node_modules from main repo')
      } catch (err) {
        // Symlink failed, suggest npm install
        return {
          success: false,
          message: 'node_modules not found. Run "npm install" in the worktree first.',
          warnings: [`Symlink failed: ${(err as Error).message}`],
        }
      }
    } else {
      return {
        success: false,
        message: 'node_modules not found in main repo or worktree. Run "npm install" first.',
      }
    }
  }

  // Get the port we'll try to use
  const port = getNextPort()
  const framework = detectFramework(worktreePath)

  return new Promise((resolve) => {
    // Spawn npm run dev with PORT env var
    // Most frameworks respect PORT env var
    const env = {
      ...process.env,
      PORT: port.toString(),
      // Vite uses different env var
      VITE_PORT: port.toString(),
      // Disable browser auto-open (we'll open it ourselves)
      BROWSER: 'none',
      // Next.js
      NEXT_PUBLIC_PORT: port.toString(),
    }

    const devProcess = spawn('npm', ['run', 'dev'], {
      cwd: worktreePath,
      env,
      shell: true,
      // Don't detach - we want to track this process
      detached: false,
    })

    let outputBuffer = ''
    let resolved = false
    let detectedUrl: string | null = null

    // Timeout after 30 seconds if we can't find URL
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        // Use fallback URL
        const fallbackUrl = `http://localhost:${port}`
        
        runningServers.set(worktreePath, {
          process: devProcess,
          url: fallbackUrl,
          port,
          startedAt: new Date(),
        })

        shell.openExternal(fallbackUrl)

        resolve({
          success: true,
          message: `${framework} dev server started (port detection timed out)`,
          url: fallbackUrl,
          warnings: [...warnings, 'Could not detect URL from output, using fallback'],
        })
      }
    }, 30000)

    // Handle stdout - look for URL
    devProcess.stdout?.on('data', (data: Buffer) => {
      const text = data.toString()
      outputBuffer += text
      console.log(`[npm-dev] ${worktreePath}: ${text}`)

      if (!resolved) {
        const url = parseUrlFromOutput(outputBuffer)
        if (url) {
          detectedUrl = url
          resolved = true
          clearTimeout(timeout)

          runningServers.set(worktreePath, {
            process: devProcess,
            url: detectedUrl,
            port,
            startedAt: new Date(),
          })

          // Open in browser
          shell.openExternal(detectedUrl)

          resolve({
            success: true,
            message: `${framework} dev server running`,
            url: detectedUrl,
            warnings: warnings.length > 0 ? warnings : undefined,
          })
        }
      }
    })

    // Handle stderr (some frameworks log to stderr)
    devProcess.stderr?.on('data', (data: Buffer) => {
      const text = data.toString()
      outputBuffer += text
      console.log(`[npm-dev] ${worktreePath} (stderr): ${text}`)

      if (!resolved) {
        const url = parseUrlFromOutput(text)
        if (url) {
          detectedUrl = url
          resolved = true
          clearTimeout(timeout)

          runningServers.set(worktreePath, {
            process: devProcess,
            url: detectedUrl,
            port,
            startedAt: new Date(),
          })

          shell.openExternal(detectedUrl)

          resolve({
            success: true,
            message: `${framework} dev server running`,
            url: detectedUrl,
            warnings: warnings.length > 0 ? warnings : undefined,
          })
        }
      }
    })

    // Handle process exit (before we found URL = error)
    devProcess.on('close', (code) => {
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)

        resolve({
          success: false,
          message: `Dev server exited with code ${code}`,
          warnings: outputBuffer ? [`Output: ${outputBuffer.slice(0, 500)}`] : undefined,
        })
      } else {
        // Process exited after we resolved - cleanup
        runningServers.delete(worktreePath)
        console.log(`[npm-dev] Server stopped for ${worktreePath}`)
      }
    })

    // Handle spawn error
    devProcess.on('error', (err) => {
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)

        resolve({
          success: false,
          message: `Failed to start dev server: ${err.message}`,
        })
      }
    })
  })
}

/**
 * Preview a branch (creates worktree if needed)
 */
export async function previewBranch(
  branchName: string,
  mainRepoPath: string,
  createWorktree: (options: { branchName: string; folderPath: string; isNewBranch: boolean }) => Promise<{ success: boolean; message: string }>
): Promise<PreviewResult> {
  // Sanitize branch name for folder
  const safeBranchName = branchName.replace(/\//g, '-')
  const homeDir = process.env.HOME || '~'
  const worktreePath = path.join(homeDir, '.ledger', 'previews', safeBranchName)

  // Check if worktree already exists
  if (!fs.existsSync(worktreePath)) {
    const result = await createWorktree({
      branchName,
      folderPath: worktreePath,
      isNewBranch: false,
    })

    if (!result.success) {
      return {
        success: false,
        message: `Failed to create worktree: ${result.message}`,
      }
    }
  }

  return previewWorktree(worktreePath, mainRepoPath)
}

/**
 * Preview a PR (creates worktree if needed)
 */
export async function previewPR(
  prNumber: number,
  prBranchName: string,
  mainRepoPath: string,
  createWorktree: (options: { branchName: string; folderPath: string; isNewBranch: boolean }) => Promise<{ success: boolean; message: string }>
): Promise<PreviewResult> {
  const homeDir = process.env.HOME || '~'
  const worktreePath = path.join(homeDir, '.ledger', 'previews', `pr-${prNumber}`)

  // Check if worktree already exists
  if (!fs.existsSync(worktreePath)) {
    const result = await createWorktree({
      branchName: prBranchName,
      folderPath: worktreePath,
      isNewBranch: false,
    })

    if (!result.success) {
      return {
        success: false,
        message: `Failed to create worktree: ${result.message}`,
      }
    }
  }

  return previewWorktree(worktreePath, mainRepoPath)
}

// ============================================================================
// Server Management
// ============================================================================

/**
 * Stop a running dev server
 */
export function stopServer(worktreePath: string): boolean {
  const server = runningServers.get(worktreePath)
  if (!server) return false

  try {
    // Kill the process tree (npm run dev spawns child processes)
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', server.process.pid!.toString(), '/f', '/t'])
    } else {
      // Send SIGTERM to process group
      process.kill(-server.process.pid!, 'SIGTERM')
    }
  } catch {
    // Process might already be dead
    server.process.kill()
  }

  runningServers.delete(worktreePath)
  console.log(`[npm-dev] Stopped server for ${worktreePath}`)
  return true
}

/**
 * Stop all running dev servers
 */
export function stopAllServers(): void {
  for (const [worktreePath] of runningServers) {
    stopServer(worktreePath)
  }
}

/**
 * Get list of running servers
 */
export function getRunningServers(): Array<{ path: string; url: string; port: number; startedAt: Date }> {
  return Array.from(runningServers.entries()).map(([path, server]) => ({
    path,
    url: server.url,
    port: server.port,
    startedAt: server.startedAt,
  }))
}

/**
 * Check if a server is running for a path
 */
export function isServerRunning(worktreePath: string): boolean {
  return runningServers.has(worktreePath)
}

/**
 * Get the URL for a running server
 */
export function getServerUrl(worktreePath: string): string | null {
  return runningServers.get(worktreePath)?.url || null
}
