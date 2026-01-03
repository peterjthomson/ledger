/**
 * Rails Provider - DHH-style Rails Development Preview
 *
 * Philosophy (per DHH):
 * - Native Ruby on Mac, no Docker for development
 * - Foreman/Overmind for process management
 * - bin/dev script (Rails 7+) or rails server
 * - puma-dev for zero-config .test domains
 *
 * URL Strategy for Parallel Worktrees:
 *
 * 1. WITH puma-dev (preferred, like Laravel Herd):
 *    - Main repo: myapp.test
 *    - Worktree: feature-branch.test
 *    - Just `puma-dev link`, instant .test domain
 *
 * 2. WITHOUT puma-dev (fallback):
 *    - Main repo: localhost:3000
 *    - Worktree: localhost:3001, 3002, etc.
 *    - Dynamic port allocation
 *
 * Setup for worktrees:
 * - Symlink vendor/bundle (share gems, fast startup)
 * - Symlink node_modules (share JS deps)
 * - Copy database.yml (may need different DB name)
 * - Copy/symlink master.key for credentials
 * - Run bin/setup or skip if deps exist
 */

import { spawn, exec, ChildProcess } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'
import { shell } from 'electron'
import type { PreviewProvider, PreviewResult, ProviderAvailability, CreateWorktreeFn } from '../preview-types'

const execAsync = promisify(exec)

// ============================================================================
// Types
// ============================================================================

interface RunningServer {
  process: ChildProcess
  url: string
  port: number
  startedAt: Date
  usePumaDev: boolean
}

// ============================================================================
// State
// ============================================================================

const runningServers = new Map<string, RunningServer>()
let nextPort = 3001
let pumaDevelInstalled: boolean | null = null

// ============================================================================
// Detection Helpers
// ============================================================================

/**
 * Check if this is a Rails project
 * Rails projects have: config.ru + Gemfile with 'rails' gem
 */
function isRailsProject(dirPath: string): { isRails: boolean; hasBindev: boolean; version?: string } {
  const hasConfigRu = fs.existsSync(path.join(dirPath, 'config.ru'))
  const gemfilePath = path.join(dirPath, 'Gemfile')
  const hasGemfile = fs.existsSync(gemfilePath)

  if (!hasConfigRu || !hasGemfile) {
    return { isRails: false, hasBindev: false }
  }

  // Check Gemfile for rails
  try {
    const gemfile = fs.readFileSync(gemfilePath, 'utf-8')
    const railsMatch = gemfile.match(/gem\s+['"]rails['"](?:,\s*['"]([^'"]+)['"])?/)
    if (!railsMatch) {
      return { isRails: false, hasBindev: false }
    }

    const hasBindev = fs.existsSync(path.join(dirPath, 'bin', 'dev'))
    const version = railsMatch[1] // e.g., "~> 7.1"

    return { isRails: true, hasBindev, version }
  } catch {
    return { isRails: false, hasBindev: false }
  }
}

/**
 * Check if puma-dev is installed (like Laravel Herd for Rails)
 * puma-dev gives us .test domains automatically
 */
async function isPumaDevInstalled(): Promise<boolean> {
  if (pumaDevelInstalled !== null) {
    return pumaDevelInstalled
  }

  try {
    await execAsync('which puma-dev')
    pumaDevelInstalled = true
    return true
  } catch {
    try {
      // Check if it's running even if not in PATH
      await execAsync('puma-dev -V')
      pumaDevelInstalled = true
      return true
    } catch {
      pumaDevelInstalled = false
      return false
    }
  }
}

/**
 * Check if Ruby is available
 */
async function isRubyInstalled(): Promise<{ installed: boolean; version?: string }> {
  try {
    const { stdout } = await execAsync('ruby --version')
    const match = stdout.match(/ruby (\d+\.\d+\.\d+)/)
    return { installed: true, version: match?.[1] }
  } catch {
    return { installed: false }
  }
}

/**
 * Check if Bundler is available
 */
async function isBundlerInstalled(): Promise<boolean> {
  try {
    await execAsync('bundle --version')
    return true
  } catch {
    return false
  }
}

// ============================================================================
// URL Generation
// ============================================================================

/**
 * Get puma-dev URL for a directory
 * puma-dev uses the folder name as subdomain: /path/to/myapp -> http://myapp.test
 */
function getPumaDevUrl(dirPath: string): string {
  const folderName = path.basename(dirPath)
  return `http://${folderName}.test`
}

/**
 * Get next available port for non-puma-dev setup
 */
function getNextPort(): number {
  const port = nextPort
  nextPort++
  if (nextPort > 9999) nextPort = 3001
  return port
}

// ============================================================================
// Worktree Setup
// ============================================================================

// Frontend file patterns that indicate JS/CSS changes need compilation
const RAILS_FRONTEND_PATTERNS = [
  'app/javascript/',      // Rails 7+ default
  'app/assets/',          // Sprockets (older Rails)
  'app/frontend/',        // Alternative convention
  'package.json',
  'package-lock.json',
  'yarn.lock',
  'bun.lockb',
  'config/importmap.rb',  // Importmap Rails
  'esbuild.config.js',    // jsbundling-rails with esbuild
  'rollup.config.js',     // jsbundling-rails with rollup
  'tailwind.config.js',   // Tailwind CSS
  'postcss.config.js',
]

/**
 * Check if the worktree has frontend changes compared to main repo
 */
async function hasRailsFrontendChanges(worktreePath: string, mainRepoPath: string): Promise<boolean> {
  try {
    const { stdout: branchOutput } = await execAsync('git rev-parse --abbrev-ref HEAD', {
      cwd: worktreePath,
    })
    const branch = branchOutput.trim()

    const { stdout: mainBranchOutput } = await execAsync(
      'git symbolic-ref refs/remotes/origin/HEAD --short 2>/dev/null || echo "origin/main"',
      { cwd: mainRepoPath }
    )
    const mainBranch = mainBranchOutput.trim().replace('origin/', '')

    const { stdout: diffOutput } = await execAsync(
      `git diff --name-only ${mainBranch}...${branch}`,
      { cwd: mainRepoPath }
    )

    const changedFiles = diffOutput.trim().split('\n').filter(Boolean)

    for (const file of changedFiles) {
      for (const pattern of RAILS_FRONTEND_PATTERNS) {
        if (file.startsWith(pattern) || file === pattern.replace('/', '')) {
          console.log(`[Rails] Frontend change detected: ${file}`)
          return true
        }
      }
    }

    return false
  } catch (error) {
    console.warn(`[Rails] Could not detect frontend changes: ${(error as Error).message}`)
    return true // Assume changes (safer)
  }
}

/**
 * Build Rails frontend assets
 */
async function buildRailsAssets(worktreePath: string): Promise<{ success: boolean; message: string }> {
  try {
    // Check what build system is used
    const hasYarn = fs.existsSync(path.join(worktreePath, 'yarn.lock'))
    const hasBun = fs.existsSync(path.join(worktreePath, 'bun.lockb'))
    const packageManager = hasBun ? 'bun' : hasYarn ? 'yarn' : 'npm'

    // Try rails assets:precompile first (works for Sprockets)
    try {
      await execAsync('bundle exec rails assets:precompile', {
        cwd: worktreePath,
        timeout: 120000,
        env: { ...process.env, RAILS_ENV: 'development' },
      })
      return { success: true, message: 'Rails assets precompiled' }
    } catch {
      // Fall back to npm/yarn build
    }

    // Try npm/yarn/bun run build
    const pkgPath = path.join(worktreePath, 'package.json')
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
      if (pkg.scripts?.build) {
        await execAsync(`${packageManager} run build`, {
          cwd: worktreePath,
          timeout: 120000,
        })
        return { success: true, message: `Assets built with ${packageManager}` }
      }
    }

    return { success: true, message: 'No build step needed' }
  } catch (error) {
    return {
      success: false,
      message: `Asset build failed: ${(error as Error).message}`,
    }
  }
}

/**
 * Setup a Rails worktree for development
 *
 * DHH approach:
 * - Symlink vendor/bundle (bundled gems)
 * - Symlink node_modules (JS deps) - UNLESS frontend changes
 * - Copy database.yml (might need different DB)
 * - Symlink master.key (for credentials)
 * - Don't run full bin/setup (too slow for preview)
 */
async function setupRailsWorktree(
  worktreePath: string,
  mainRepoPath: string
): Promise<{ success: boolean; message: string; warnings: string[]; needsBuild: boolean }> {
  const warnings: string[] = []
  let needsBuild = false

  try {
    // 0. Check for frontend changes
    const hasFrontend = await hasRailsFrontendChanges(worktreePath, mainRepoPath)
    if (hasFrontend) {
      needsBuild = true
      warnings.push('Frontend changes detected - will build assets')
    }

    // 1. Symlink vendor/bundle (share gems between worktrees)
    const worktreeVendor = path.join(worktreePath, 'vendor', 'bundle')
    const mainVendor = path.join(mainRepoPath, 'vendor', 'bundle')

    if (!fs.existsSync(worktreeVendor) && fs.existsSync(mainVendor)) {
      try {
        await fs.promises.mkdir(path.join(worktreePath, 'vendor'), { recursive: true })
        await fs.promises.symlink(mainVendor, worktreeVendor)
      } catch (err) {
        warnings.push(`vendor/bundle symlink failed: ${(err as Error).message}`)
      }
    }

    // 2. Symlink node_modules (for JS-heavy Rails apps)
    const worktreeNodeModules = path.join(worktreePath, 'node_modules')
    const mainNodeModules = path.join(mainRepoPath, 'node_modules')

    if (!fs.existsSync(worktreeNodeModules) && fs.existsSync(mainNodeModules)) {
      try {
        await fs.promises.symlink(mainNodeModules, worktreeNodeModules)
      } catch (err) {
        warnings.push(`node_modules symlink failed: ${(err as Error).message}`)
      }
    }

    // 3. Copy database.yml (worktree might need different DB name to avoid conflicts)
    const worktreeDbConfig = path.join(worktreePath, 'config', 'database.yml')
    const mainDbConfig = path.join(mainRepoPath, 'config', 'database.yml')

    if (!fs.existsSync(worktreeDbConfig) && fs.existsSync(mainDbConfig)) {
      try {
        // Read and modify database.yml to use different DB name
        let dbConfig = await fs.promises.readFile(mainDbConfig, 'utf-8')
        const worktreeName = path.basename(worktreePath).replace(/[^a-zA-Z0-9_]/g, '_')

        // Add suffix to database names to avoid conflicts
        // This is a simple approach - might need more sophisticated parsing for complex configs
        dbConfig = dbConfig.replace(
          /database:\s*(\w+)_development/g,
          `database: $1_${worktreeName}_development`
        )
        dbConfig = dbConfig.replace(
          /database:\s*(\w+)_test/g,
          `database: $1_${worktreeName}_test`
        )

        await fs.promises.writeFile(worktreeDbConfig, dbConfig, 'utf-8')
        warnings.push(`Created database.yml with suffix _${worktreeName}`)
      } catch (_err) {
        // Fallback: just copy as-is (will share DB with main)
        try {
          await fs.promises.copyFile(mainDbConfig, worktreeDbConfig)
          warnings.push('Copied database.yml (sharing database with main repo)')
        } catch (copyErr) {
          warnings.push(`database.yml setup failed: ${(copyErr as Error).message}`)
        }
      }
    }

    // 4. Symlink master.key (for Rails credentials)
    const worktreeMasterKey = path.join(worktreePath, 'config', 'master.key')
    const mainMasterKey = path.join(mainRepoPath, 'config', 'master.key')

    if (!fs.existsSync(worktreeMasterKey) && fs.existsSync(mainMasterKey)) {
      try {
        await fs.promises.symlink(mainMasterKey, worktreeMasterKey)
      } catch (err) {
        warnings.push(`master.key symlink failed: ${(err as Error).message}`)
      }
    }

    // 5. Symlink credentials.yml.enc
    const worktreeCreds = path.join(worktreePath, 'config', 'credentials.yml.enc')
    const mainCreds = path.join(mainRepoPath, 'config', 'credentials.yml.enc')

    if (!fs.existsSync(worktreeCreds) && fs.existsSync(mainCreds)) {
      try {
        await fs.promises.symlink(mainCreds, worktreeCreds)
      } catch (err) {
        warnings.push(`credentials.yml.enc symlink failed: ${(err as Error).message}`)
      }
    }

    // 6. Copy .env or .env.development if using dotenv
    const worktreeEnv = path.join(worktreePath, '.env')
    const mainEnv = path.join(mainRepoPath, '.env')
    const mainEnvDev = path.join(mainRepoPath, '.env.development')

    if (!fs.existsSync(worktreeEnv)) {
      const envSource = fs.existsSync(mainEnvDev) ? mainEnvDev : fs.existsSync(mainEnv) ? mainEnv : null
      if (envSource) {
        try {
          await fs.promises.copyFile(envSource, worktreeEnv)
        } catch (err) {
          warnings.push(`.env copy failed: ${(err as Error).message}`)
        }
      }
    }

    // 7. Create tmp and log directories
    for (const dir of ['tmp', 'log']) {
      const dirPath = path.join(worktreePath, dir)
      if (!fs.existsSync(dirPath)) {
        try {
          await fs.promises.mkdir(dirPath, { recursive: true })
        } catch {
          // Ignore - Rails will create these
        }
      }
    }

    return {
      success: true,
      message: 'Rails worktree setup complete',
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

// ============================================================================
// puma-dev Integration
// ============================================================================

/**
 * Link a directory with puma-dev
 * Creates ~/.puma-dev/<name> symlink pointing to the app
 */
async function linkWithPumaDev(dirPath: string): Promise<{ success: boolean; url?: string; message: string }> {
  const folderName = path.basename(dirPath)
  const pumaDevDir = path.join(process.env.HOME || '~', '.puma-dev')
  const linkPath = path.join(pumaDevDir, folderName)

  try {
    // Ensure ~/.puma-dev exists
    if (!fs.existsSync(pumaDevDir)) {
      await fs.promises.mkdir(pumaDevDir, { recursive: true })
    }

    // Remove existing link if present
    if (fs.existsSync(linkPath)) {
      await fs.promises.unlink(linkPath)
    }

    // Create symlink
    await fs.promises.symlink(dirPath, linkPath)

    const url = getPumaDevUrl(dirPath)
    return { success: true, url, message: `Linked at ${url}` }
  } catch (error) {
    return { success: false, message: `puma-dev link failed: ${(error as Error).message}` }
  }
}

// ============================================================================
// Server Management
// ============================================================================

/**
 * Start Rails server (bin/dev or rails server)
 */
async function startRailsServer(
  worktreePath: string,
  port: number,
  useBinDev: boolean
): Promise<{ process: ChildProcess; url: string }> {
  const env = {
    ...process.env,
    PORT: port.toString(),
    RAILS_ENV: 'development',
    // Disable Spring (can cause issues with multiple worktrees)
    DISABLE_SPRING: '1',
  }

  const command = useBinDev ? 'bin/dev' : 'bundle'
  const args = useBinDev ? [] : ['exec', 'rails', 'server', '-p', port.toString()]

  const serverProcess = spawn(command, args, {
    cwd: worktreePath,
    env,
    shell: true,
    detached: false,
  })

  const url = `http://localhost:${port}`

  return { process: serverProcess, url }
}

// ============================================================================
// Provider Implementation
// ============================================================================

export const railsProvider: PreviewProvider = {
  id: 'rails',
  name: 'Rails Server',
  description: 'bin/dev or rails server (puma-dev for .test domains)',
  icon: 'gem', // Ruby gem icon
  type: 'local',

  async checkAvailability(repoPath: string, targetPath?: string): Promise<ProviderAvailability> {
    const checkPath = targetPath || repoPath

    // Check Ruby
    const ruby = await isRubyInstalled()
    if (!ruby.installed) {
      return {
        available: false,
        compatible: false,
        reason: 'Ruby not installed (brew install ruby)',
      }
    }

    // Check Bundler
    const hasBundler = await isBundlerInstalled()
    if (!hasBundler) {
      return {
        available: false,
        compatible: false,
        reason: 'Bundler not installed (gem install bundler)',
      }
    }

    // Check if it's a Rails project
    const { isRails, hasBindev: _hasBindev, version } = isRailsProject(checkPath)
    if (!isRails) {
      return {
        available: true,
        compatible: false,
        reason: 'Not a Rails project (no Gemfile with rails gem)',
      }
    }

    // Check for puma-dev (optional but preferred)
    const hasPumaDev = await isPumaDevInstalled()
    const pumaDevNote = hasPumaDev ? ' (puma-dev: .test domains)' : ' (port-based)'

    // Check if vendor/bundle exists (gems installed)
    const hasVendorBundle = fs.existsSync(path.join(checkPath, 'vendor', 'bundle'))
    const bundleNote = hasVendorBundle ? '' : ' - run "bundle install" first'

    return {
      available: true,
      compatible: true,
      reason: `Rails ${version || ''}${pumaDevNote}${bundleNote}`.trim() || undefined,
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
      await shell.openExternal(existing.url)
      return {
        success: true,
        message: `Already running at ${existing.url}`,
        url: existing.url,
      }
    }

    // Setup worktree
    const setupResult = await setupRailsWorktree(worktreePath, mainRepoPath)
    let warnings = setupResult.warnings

    // Build assets if needed (frontend changes detected)
    if (setupResult.needsBuild) {
      const buildResult = await buildRailsAssets(worktreePath)
      if (!buildResult.success) {
        warnings = [...warnings, buildResult.message]
        // Continue anyway - app might work without fresh assets
      }
    }

    // Check for puma-dev
    const hasPumaDev = await isPumaDevInstalled()
    const { hasBindev } = isRailsProject(worktreePath)

    if (hasPumaDev) {
      // puma-dev approach: just link and open .test URL
      const linkResult = await linkWithPumaDev(worktreePath)
      if (linkResult.success && linkResult.url) {
        // puma-dev handles the server automatically
        runningServers.set(worktreePath, {
          process: null as unknown as ChildProcess, // puma-dev manages the process
          url: linkResult.url,
          port: 0,
          startedAt: new Date(),
          usePumaDev: true,
        })

        await shell.openExternal(linkResult.url)

        return {
          success: true,
          message: `Linked with puma-dev`,
          url: linkResult.url,
          warnings: warnings.length > 0 ? warnings : undefined,
        }
      } else {
        warnings.push(`puma-dev link failed: ${linkResult.message}, falling back to port`)
      }
    }

    // Fallback: Start server on dynamic port
    const port = getNextPort()

    return new Promise((resolve) => {
      const startServer = async () => {
        try {
          const { process: serverProcess, url } = await startRailsServer(worktreePath, port, hasBindev)

          let outputBuffer = ''
          let resolved = false

          // Timeout after 60 seconds (Rails can be slow to boot)
          const timeout = setTimeout(() => {
            if (!resolved) {
              resolved = true
              // Assume it's running even if we didn't see the ready message
              runningServers.set(worktreePath, {
                process: serverProcess,
                url,
                port,
                startedAt: new Date(),
                usePumaDev: false,
              })

              shell.openExternal(url)

              resolve({
                success: true,
                message: `Rails server started (startup detection timed out)`,
                url,
                warnings: [...warnings, 'Could not detect ready message, server may still be booting'],
              })
            }
          }, 60000)

          // Look for ready message
          const checkReady = (text: string) => {
            outputBuffer += text
            // Rails/Puma ready messages
            if (
              text.includes('Listening on') ||
              text.includes('Use Ctrl-C to stop') ||
              text.includes('Booting Puma') ||
              text.includes('http://') && text.includes('localhost')
            ) {
              if (!resolved) {
                resolved = true
                clearTimeout(timeout)

                runningServers.set(worktreePath, {
                  process: serverProcess,
                  url,
                  port,
                  startedAt: new Date(),
                  usePumaDev: false,
                })

                shell.openExternal(url)

                resolve({
                  success: true,
                  message: hasBindev ? 'bin/dev started' : 'Rails server started',
                  url,
                  warnings: warnings.length > 0 ? warnings : undefined,
                })
              }
            }
          }

          serverProcess.stdout?.on('data', (data: Buffer) => {
            const text = data.toString()
            console.log(`[rails] ${worktreePath}: ${text}`)
            checkReady(text)
          })

          serverProcess.stderr?.on('data', (data: Buffer) => {
            const text = data.toString()
            console.log(`[rails] ${worktreePath} (stderr): ${text}`)
            checkReady(text)
          })

          serverProcess.on('close', (code) => {
            if (!resolved) {
              resolved = true
              clearTimeout(timeout)
              resolve({
                success: false,
                message: `Rails server exited with code ${code}`,
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
                message: `Failed to start Rails: ${err.message}`,
              })
            }
          })
        } catch (error) {
          resolve({
            success: false,
            message: `Failed to start Rails: ${(error as Error).message}`,
            warnings,
          })
        }
      }

      startServer()
    })
  },

  async previewBranch(
    branchName: string,
    mainRepoPath: string,
    createWorktree: CreateWorktreeFn
  ): Promise<PreviewResult> {
    const safeBranchName = branchName.replace(/\//g, '-')
    const homeDir = process.env.HOME || '~'
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
    const homeDir = process.env.HOME || '~'
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

    if (server.usePumaDev) {
      // For puma-dev, remove the symlink
      const folderName = path.basename(worktreePath)
      const linkPath = path.join(process.env.HOME || '~', '.puma-dev', folderName)
      try {
        fs.unlinkSync(linkPath)
      } catch {
        // Ignore
      }
    } else {
      // Kill the server process
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', server.process.pid!.toString(), '/f', '/t'])
        } else {
          process.kill(-server.process.pid!, 'SIGTERM')
        }
      } catch {
        server.process?.kill()
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

export default railsProvider
