/**
 * Laravel Provider - Full Laravel Development Preview
 *
 * Two modes:
 * 1. WITH Herd: Zero-config .test domains (preferred)
 * 2. WITHOUT Herd: php artisan serve on dynamic port (fallback)
 *
 * Asset Handling (the tricky part):
 * - If branch has NO frontend changes: symlink public/build/ (fast)
 * - If branch HAS frontend changes: run npm run build (correct)
 *
 * Detection for "has frontend changes":
 * - Check git diff for: resources/js/*, resources/css/*, package.json, vite.config.js
 */

import { spawn, exec, ChildProcess } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { PreviewProvider, PreviewResult, ProviderAvailability, CreateWorktreeFn } from '../preview-types'
import { shellEscape } from '@/lib/utils/shell-escape'

const execAsync = promisify(exec)

// ============================================================================
// Types
// ============================================================================

interface RunningServer {
  process: ChildProcess | null // null for Herd (managed externally)
  url: string
  port: number
  startedAt: Date
  useHerd: boolean
}

// ============================================================================
// State
// ============================================================================

const runningServers = new Map<string, RunningServer>()
let nextPort = 8001 // Laravel typically uses 8000, so start at 8001
let herdInstalledCache: boolean | null = null

// Frontend file patterns that indicate JS/CSS changes need compilation
const FRONTEND_PATTERNS = [
  'resources/js/',
  'resources/css/',
  'resources/sass/',
  'resources/views/', // Blade templates might have inline JS
  'package.json',
  'package-lock.json',
  'vite.config.js',
  'vite.config.ts',
  'webpack.mix.js',
  'tailwind.config.js',
  'postcss.config.js',
]

// ============================================================================
// Detection Helpers
// ============================================================================

/**
 * Check if this is a Laravel project (has artisan file)
 */
function isLaravelProject(dirPath: string): boolean {
  return fs.existsSync(path.join(dirPath, 'artisan'))
}

/**
 * Check if Laravel Herd is installed
 */
async function isHerdInstalled(): Promise<boolean> {
  if (herdInstalledCache !== null) {
    return herdInstalledCache
  }

  try {
    await execAsync('which herd')
    herdInstalledCache = true
    return true
  } catch {
    try {
      await execAsync('herd --version')
      herdInstalledCache = true
      return true
    } catch {
      herdInstalledCache = false
      return false
    }
  }
}

/**
 * Check if PHP is available
 */
async function isPhpInstalled(): Promise<{ installed: boolean; version?: string }> {
  try {
    const { stdout } = await execAsync('php --version')
    const match = stdout.match(/PHP (\d+\.\d+\.\d+)/)
    return { installed: true, version: match?.[1] }
  } catch {
    return { installed: false }
  }
}

/**
 * Check if Composer dependencies are installed
 */
function hasVendor(dirPath: string): boolean {
  return fs.existsSync(path.join(dirPath, 'vendor'))
}

/**
 * Check if the worktree has frontend changes compared to main repo
 * This determines whether we need to run `npm run build` or can symlink assets
 */
async function hasFrontendChanges(worktreePath: string, mainRepoPath: string): Promise<boolean> {
  try {
    // Get the branch name from the worktree
    const { stdout: branchOutput } = await execAsync('git rev-parse --abbrev-ref HEAD', {
      cwd: worktreePath,
    })
    const branch = branchOutput.trim()

    // Get the main branch name
    const { stdout: mainBranchOutput } = await execAsync(
      'git symbolic-ref refs/remotes/origin/HEAD --short 2>/dev/null || echo "origin/main"',
      { cwd: mainRepoPath }
    )
    const mainBranch = mainBranchOutput.trim().replace('origin/', '')

    // Get list of changed files between this branch and main
    const { stdout: diffOutput } = await execAsync(
      `git diff --name-only ${mainBranch}...${branch}`,
      { cwd: mainRepoPath }
    )

    const changedFiles = diffOutput.trim().split('\n').filter(Boolean)

    // Check if any changed files match frontend patterns
    for (const file of changedFiles) {
      for (const pattern of FRONTEND_PATTERNS) {
        if (file.startsWith(pattern) || file === pattern.replace('/', '')) {
          console.log(`[Laravel] Frontend change detected: ${file}`)
          return true
        }
      }
    }

    return false
  } catch (error) {
    // If we can't determine, assume there are changes (safer)
    console.warn(`[Laravel] Could not detect frontend changes: ${(error as Error).message}`)
    return true
  }
}

// ============================================================================
// URL Generation
// ============================================================================

/**
 * Get Herd URL for a directory
 */
function getHerdUrl(dirPath: string): string {
  const folderName = path.basename(dirPath)
  return `http://${folderName}.test`
}

/**
 * Get next available port
 */
function getNextPort(): number {
  const port = nextPort
  nextPort++
  if (nextPort > 9999) nextPort = 8001
  return port
}

// ============================================================================
// Worktree Setup
// ============================================================================

/**
 * Setup Laravel worktree for preview
 *
 * Smart asset handling:
 * - Always symlink: vendor/, node_modules/
 * - Conditional: public/build/ (only if no frontend changes)
 * - Always copy: .env (with modified APP_URL)
 */
async function setupLaravelWorktree(
  worktreePath: string,
  mainRepoPath: string,
  previewUrl: string
): Promise<{ success: boolean; message: string; warnings: string[]; needsBuild: boolean }> {
  const warnings: string[] = []
  let needsBuild = false

  try {
    // 1. Check for frontend changes
    const hasFrontend = await hasFrontendChanges(worktreePath, mainRepoPath)
    if (hasFrontend) {
      needsBuild = true
      warnings.push('Frontend changes detected - will run npm run build')
    }

    // 2. Setup .env - COPY and modify APP_URL
    const worktreeEnv = path.join(worktreePath, '.env')
    const mainEnv = path.join(mainRepoPath, '.env')

    if (!fs.existsSync(worktreeEnv)) {
      if (fs.existsSync(mainEnv)) {
        try {
          let envContent = await fs.promises.readFile(mainEnv, 'utf-8')

          // Update APP_URL
          if (envContent.includes('APP_URL=')) {
            envContent = envContent.replace(/^APP_URL=.*/m, `APP_URL=${previewUrl}`)
          } else {
            envContent = `APP_URL=${previewUrl}\n${envContent}`
          }

          // Optionally update DB name to avoid conflicts
          const worktreeSuffix = path.basename(worktreePath).replace(/[^a-zA-Z0-9_]/g, '_')
          envContent = envContent.replace(
            /^DB_DATABASE=(.*)$/m,
            `DB_DATABASE=$1_${worktreeSuffix}`
          )

          await fs.promises.writeFile(worktreeEnv, envContent, 'utf-8')
        } catch (err) {
          warnings.push(`.env setup failed: ${(err as Error).message}`)
        }
      } else {
        // Create minimal .env
        try {
          await fs.promises.writeFile(worktreeEnv, `APP_URL=${previewUrl}\n`, 'utf-8')
          warnings.push('Created minimal .env (main repo has no .env)')
        } catch (err) {
          warnings.push(`.env creation failed: ${(err as Error).message}`)
        }
      }
    }

    // 3. Symlink vendor/ (Composer dependencies)
    const worktreeVendor = path.join(worktreePath, 'vendor')
    const mainVendor = path.join(mainRepoPath, 'vendor')

    if (!fs.existsSync(worktreeVendor) && fs.existsSync(mainVendor)) {
      try {
        await fs.promises.symlink(mainVendor, worktreeVendor)
      } catch (err) {
        warnings.push(`vendor/ symlink failed: ${(err as Error).message}`)
      }
    }

    // 4. Symlink node_modules/
    const worktreeNodeModules = path.join(worktreePath, 'node_modules')
    const mainNodeModules = path.join(mainRepoPath, 'node_modules')

    if (!fs.existsSync(worktreeNodeModules) && fs.existsSync(mainNodeModules)) {
      try {
        await fs.promises.symlink(mainNodeModules, worktreeNodeModules)
      } catch (err) {
        warnings.push(`node_modules/ symlink failed: ${(err as Error).message}`)
      }
    }

    // 5. Handle public/build/ based on frontend changes
    const worktreeBuild = path.join(worktreePath, 'public', 'build')
    const mainBuild = path.join(mainRepoPath, 'public', 'build')

    if (!fs.existsSync(worktreeBuild)) {
      if (needsBuild) {
        // Don't symlink - we'll build fresh
        // Ensure public/ directory exists for the build
        const worktreePublic = path.join(worktreePath, 'public')
        if (!fs.existsSync(worktreePublic)) {
          await fs.promises.mkdir(worktreePublic, { recursive: true })
        }
      } else if (fs.existsSync(mainBuild)) {
        // No frontend changes - safe to symlink
        try {
          const worktreePublic = path.join(worktreePath, 'public')
          if (!fs.existsSync(worktreePublic)) {
            await fs.promises.mkdir(worktreePublic, { recursive: true })
          }
          await fs.promises.symlink(mainBuild, worktreeBuild)
        } catch (err) {
          warnings.push(`public/build/ symlink failed: ${(err as Error).message}`)
          needsBuild = true // Fall back to building
        }
      } else {
        // Main repo has no build either
        needsBuild = true
        warnings.push('Main repo has no public/build/ - will run npm run build')
      }
    }

    // 6. Create storage link if needed
    const storageLink = path.join(worktreePath, 'public', 'storage')
    if (!fs.existsSync(storageLink)) {
      try {
        const storageApp = path.join(worktreePath, 'storage', 'app', 'public')
        if (fs.existsSync(storageApp)) {
          await fs.promises.symlink(storageApp, storageLink)
        }
      } catch {
        // Ignore - not all apps use storage links
      }
    }

    return {
      success: true,
      message: 'Laravel worktree setup complete',
      warnings,
      needsBuild,
    }
  } catch (error) {
    return {
      success: false,
      message: `Setup failed: ${(error as Error).message}`,
      warnings,
      needsBuild: false,
    }
  }
}

/**
 * Build frontend assets (npm run build)
 */
async function buildAssets(worktreePath: string): Promise<{ success: boolean; message: string }> {
  try {
    console.log(`[Laravel] Building assets in ${worktreePath}...`)

    // Run npm run build
    await execAsync('npm run build', {
      cwd: worktreePath,
      timeout: 120000, // 2 minute timeout
    })

    return { success: true, message: 'Assets built successfully' }
  } catch (error) {
    return {
      success: false,
      message: `Asset build failed: ${(error as Error).message}`,
    }
  }
}

// ============================================================================
// Herd Integration
// ============================================================================

/**
 * Link directory with Herd
 */
async function linkWithHerd(dirPath: string): Promise<{ success: boolean; url?: string; message: string }> {
  try {
    const folderName = path.basename(dirPath)
    await execAsync(`herd link ${shellEscape(folderName)}`, { cwd: dirPath })
    const url = getHerdUrl(dirPath)
    return { success: true, url, message: `Linked at ${url}` }
  } catch (error) {
    return { success: false, message: `Herd link failed: ${(error as Error).message}` }
  }
}

// ============================================================================
// Artisan Serve (Fallback)
// ============================================================================

/**
 * Start php artisan serve on a specific port
 */
function startArtisanServe(worktreePath: string, port: number): ChildProcess {
  const serverProcess = spawn('php', ['artisan', 'serve', '--port', port.toString()], {
    cwd: worktreePath,
    env: {
      ...process.env,
      APP_URL: `http://localhost:${port}`,
    },
    shell: true,
    detached: false,
  })

  return serverProcess
}

// ============================================================================
// Provider Implementation
// ============================================================================

export const laravelProvider: PreviewProvider = {
  id: 'laravel',
  name: 'Laravel',
  description: 'Herd (.test domains) or artisan serve (fallback)',
  icon: 'flame', // Laravel flame logo
  type: 'local',

  async checkAvailability(repoPath: string, targetPath?: string): Promise<ProviderAvailability> {
    const checkPath = targetPath || repoPath

    // Check if it's a Laravel project
    if (!isLaravelProject(checkPath)) {
      return {
        available: true,
        compatible: false,
        reason: 'Not a Laravel project (no artisan file)',
      }
    }

    // Check for Herd first (preferred)
    const hasHerd = await isHerdInstalled()
    if (hasHerd) {
      return {
        available: true,
        compatible: true,
        reason: 'Laravel + Herd (.test domains)',
      }
    }

    // Check for PHP (fallback)
    const php = await isPhpInstalled()
    if (!php.installed) {
      return {
        available: false,
        compatible: true,
        reason: 'PHP not installed (brew install php)',
      }
    }

    // Check if vendor exists
    const hasVendorDir = hasVendor(checkPath)

    return {
      available: true,
      compatible: true,
      reason: hasVendorDir
        ? `Laravel + artisan serve (PHP ${php.version})`
        : `Laravel (run "composer install" first)`,
    }
  },

  async previewWorktree(
    worktreePath: string,
    mainRepoPath: string,
    _createWorktree: CreateWorktreeFn
  ): Promise<PreviewResult> {
    // Check if already running
    const existing = runningServers.get(worktreePath)
    if (existing) {
      return {
        success: true,
        message: `Already running at ${existing.url}`,
        url: existing.url,
      }
    }

    const hasHerd = await isHerdInstalled()
    const port = hasHerd ? 0 : getNextPort()
    const previewUrl = hasHerd ? getHerdUrl(worktreePath) : `http://localhost:${port}`

    // Setup worktree
    const setupResult = await setupLaravelWorktree(worktreePath, mainRepoPath, previewUrl)
    let warnings = setupResult.warnings

    if (!setupResult.success) {
      return {
        success: false,
        message: setupResult.message,
        warnings,
      }
    }

    // Build assets if needed
    if (setupResult.needsBuild) {
      const buildResult = await buildAssets(worktreePath)
      if (!buildResult.success) {
        warnings = [...warnings, buildResult.message]
        // Continue anyway - app might work without fresh assets
      }
    }

    // Start server
    if (hasHerd) {
      // Herd mode: just link and open
      const linkResult = await linkWithHerd(worktreePath)
      if (!linkResult.success) {
        // Fall back to artisan serve
        warnings.push(`Herd link failed: ${linkResult.message}, using artisan serve`)
      } else {
        runningServers.set(worktreePath, {
          process: null,
          url: linkResult.url!,
          port: 0,
          startedAt: new Date(),
          useHerd: true,
        })

        return {
          success: true,
          message: 'Linked with Herd',
          url: linkResult.url,
          warnings: warnings.length > 0 ? warnings : undefined,
        }
      }
    }

    // Artisan serve mode (fallback)
    return new Promise((resolve) => {
      const serverProcess = startArtisanServe(worktreePath, port)
      const url = `http://localhost:${port}`

      let outputBuffer = ''
      let resolved = false

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          runningServers.set(worktreePath, {
            process: serverProcess,
            url,
            port,
            startedAt: new Date(),
            useHerd: false,
          })

          resolve({
            success: true,
            message: 'Laravel server started (startup detection timed out)',
            url,
            warnings: [...warnings, 'Could not detect ready message'],
          })
        }
      }, 30000)

      const checkReady = (text: string) => {
        outputBuffer += text
        // artisan serve ready message
        if (text.includes('Server running on') || text.includes('Development Server')) {
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)

            runningServers.set(worktreePath, {
              process: serverProcess,
              url,
              port,
              startedAt: new Date(),
              useHerd: false,
            })

            resolve({
              success: true,
              message: 'artisan serve started',
              url,
              warnings: warnings.length > 0 ? warnings : undefined,
            })
          }
        }
      }

      serverProcess.stdout?.on('data', (data: Buffer) => {
        const text = data.toString()
        console.log(`[Laravel] ${worktreePath}: ${text}`)
        checkReady(text)
      })

      serverProcess.stderr?.on('data', (data: Buffer) => {
        const text = data.toString()
        console.log(`[Laravel] ${worktreePath} (stderr): ${text}`)
        checkReady(text)
      })

      serverProcess.on('close', (code) => {
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          resolve({
            success: false,
            message: `artisan serve exited with code ${code}`,
            warnings: outputBuffer ? [`Output: ${outputBuffer.slice(0, 500)}`] : undefined,
          })
        } else {
          runningServers.delete(worktreePath)
        }
      })

      serverProcess.on('error', (err) => {
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          resolve({
            success: false,
            message: `Failed to start Laravel: ${err.message}`,
          })
        }
      })
    })
  },

  async previewBranch(
    branchName: string,
    mainRepoPath: string,
    createWorktree: CreateWorktreeFn
  ): Promise<PreviewResult> {
    const safeBranchName = branchName.replace(/\//g, '-')
    const homeDir = os.homedir()
    const worktreePath = path.join(homeDir, '.ledger', 'previews', safeBranchName)

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

    return this.previewWorktree(worktreePath, mainRepoPath, createWorktree)
  },

  async previewPR(
    prNumber: number,
    prBranchName: string,
    mainRepoPath: string,
    createWorktree: CreateWorktreeFn
  ): Promise<PreviewResult> {
    const homeDir = os.homedir()
    const worktreePath = path.join(homeDir, '.ledger', 'previews', `pr-${prNumber}`)

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

    return this.previewWorktree(worktreePath, mainRepoPath, createWorktree)
  },

  stop(worktreePath: string): void {
    const server = runningServers.get(worktreePath)
    if (!server) return

    if (!server.useHerd && server.process) {
      const pid = server.process.pid
      try {
        if (pid) {
          if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', pid.toString(), '/f', '/t'])
          } else {
            process.kill(-pid, 'SIGTERM')
          }
        } else {
          server.process.kill()
        }
      } catch {
        server.process.kill()
      }
    }

    runningServers.delete(worktreePath)
  },

  stopAll(): void {
    for (const [worktreePath] of runningServers) {
      this.stop!(worktreePath)
    }
  },

  isRunning(worktreePath: string): boolean {
    return runningServers.has(worktreePath)
  },

  getUrl(worktreePath: string): string | null {
    return runningServers.get(worktreePath)?.url || null
  },
}

export default laravelProvider
