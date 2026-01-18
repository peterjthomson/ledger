/**
 * Herd Service - Laravel Herd CLI integration
 *
 * Provides functions to:
 * - Check if Herd CLI is installed
 * - Detect Laravel projects
 * - Setup symlinks for .env and vendor/
 * - Link worktrees with Herd for local serving
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { shellEscape } from '@/lib/utils/shell-escape'

const execAsync = promisify(exec)

// Cache Herd installation check (unlikely to change during session)
let herdInstalledCache: boolean | null = null

/**
 * Check if Herd CLI is available on the system
 */
export async function isHerdInstalled(): Promise<boolean> {
  if (herdInstalledCache !== null) {
    return herdInstalledCache
  }

  try {
    await execAsync('which herd')
    herdInstalledCache = true
    return true
  } catch {
    // Try alternative check with herd --version
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
 * Clear the Herd installation cache (useful for testing)
 */
export function clearHerdCache(): void {
  herdInstalledCache = null
}

/**
 * Check if a directory is a Laravel project
 * Looks for the presence of an 'artisan' file
 */
export function isLaravelProject(dirPath: string): boolean {
  try {
    const artisanPath = path.join(dirPath, 'artisan')
    return fs.existsSync(artisanPath)
  } catch {
    return false
  }
}

/**
 * Get the Herd URL for a given directory
 * Derives from the folder name: /path/to/my-project -> http://my-project.test
 */
export function getHerdUrl(dirPath: string): string {
  const folderName = path.basename(dirPath)
  // Herd uses the folder name as the subdomain
  return `http://${folderName}.test`
}

/**
 * Setup symlinks and .env for worktree
 * - Copies .env from main repo and injects correct APP_URL
 * - Symlinks vendor/ and public/build/ from main repo
 */
export async function setupWorktreeSymlinks(
  worktreePath: string,
  mainRepoPath: string
): Promise<{ success: boolean; message: string; warnings: string[] }> {
  const warnings: string[] = []
  const herdUrl = getHerdUrl(worktreePath)

  try {
    // Setup .env - COPY and modify APP_URL (not symlink)
    const worktreeEnv = path.join(worktreePath, '.env')
    const mainEnv = path.join(mainRepoPath, '.env')

    if (!fs.existsSync(worktreeEnv)) {
      if (fs.existsSync(mainEnv)) {
        try {
          // Read main .env and update APP_URL
          let envContent = await fs.promises.readFile(mainEnv, 'utf-8')
          
          // Replace APP_URL with the Herd URL for this worktree
          if (envContent.includes('APP_URL=')) {
            envContent = envContent.replace(/^APP_URL=.*/m, `APP_URL=${herdUrl}`)
          } else {
            // Add APP_URL if not present
            envContent = `APP_URL=${herdUrl}\n${envContent}`
          }
          
          await fs.promises.writeFile(worktreeEnv, envContent, 'utf-8')
        } catch (err) {
          warnings.push(`.env setup failed: ${(err as Error).message}`)
        }
      } else {
        // Create minimal .env with just APP_URL
        try {
          await fs.promises.writeFile(worktreeEnv, `APP_URL=${herdUrl}\n`, 'utf-8')
          warnings.push('Created minimal .env (main repo has no .env)')
        } catch (err) {
          warnings.push(`.env creation failed: ${(err as Error).message}`)
        }
      }
    }

    // Setup vendor/ symlink
    const worktreeVendor = path.join(worktreePath, 'vendor')
    const mainVendor = path.join(mainRepoPath, 'vendor')

    if (!fs.existsSync(worktreeVendor)) {
      if (fs.existsSync(mainVendor)) {
        try {
          await fs.promises.symlink(mainVendor, worktreeVendor)
        } catch (err) {
          warnings.push(`vendor/ symlink failed: ${(err as Error).message}`)
        }
      } else {
        warnings.push('Main repo has no vendor/ directory to symlink')
      }
    }

    // Setup public/build/ symlink (Vite assets)
    const worktreeBuild = path.join(worktreePath, 'public', 'build')
    const mainBuild = path.join(mainRepoPath, 'public', 'build')

    if (!fs.existsSync(worktreeBuild)) {
      if (fs.existsSync(mainBuild)) {
        try {
          // Ensure public/ directory exists
          const worktreePublic = path.join(worktreePath, 'public')
          if (!fs.existsSync(worktreePublic)) {
            await fs.promises.mkdir(worktreePublic, { recursive: true })
          }
          await fs.promises.symlink(mainBuild, worktreeBuild)
        } catch (err) {
          warnings.push(`public/build/ symlink failed: ${(err as Error).message}`)
        }
      } else {
        warnings.push('Main repo has no public/build/ (run npm run build in main repo)')
      }
    }

    // Setup node_modules/ symlink (for assets/mix if needed)
    const worktreeNodeModules = path.join(worktreePath, 'node_modules')
    const mainNodeModules = path.join(mainRepoPath, 'node_modules')

    if (!fs.existsSync(worktreeNodeModules)) {
      if (fs.existsSync(mainNodeModules)) {
        try {
          await fs.promises.symlink(mainNodeModules, worktreeNodeModules)
        } catch (err) {
          warnings.push(`node_modules/ symlink failed: ${(err as Error).message}`)
        }
      }
    }

    return {
      success: true,
      message: 'Worktree setup complete',
      warnings,
    }
  } catch (error) {
    return {
      success: false,
      message: `Failed to setup worktree: ${(error as Error).message}`,
      warnings,
    }
  }
}

/**
 * Link a directory with Herd using `herd link`
 * This registers the directory to be served at <folder-name>.test
 */
export async function linkWithHerd(
  dirPath: string
): Promise<{ success: boolean; message: string; url?: string }> {
  try {
    const folderName = path.basename(dirPath)

    // Run herd link from the directory
    await execAsync(`herd link ${shellEscape(folderName)}`, { cwd: dirPath })

    const url = getHerdUrl(dirPath)

    return {
      success: true,
      message: `Linked with Herd at ${url}`,
      url,
    }
  } catch (error) {
    return {
      success: false,
      message: `Failed to link with Herd: ${(error as Error).message}`,
    }
  }
}

/**
 * Get the preview worktree path for a given name
 * Stores preview worktrees in ~/.ledger/previews/
 */
export function getPreviewWorktreePath(name: string): string {
  const homeDir = os.homedir()
  return path.join(homeDir, '.ledger', 'previews', name)
}

/**
 * Ensure the previews directory exists
 */
export async function ensurePreviewsDirectory(): Promise<void> {
  const previewsDir = getPreviewWorktreePath('')
  const parentDir = path.dirname(previewsDir)

  if (!fs.existsSync(parentDir)) {
    await fs.promises.mkdir(parentDir, { recursive: true })
  }

  if (!fs.existsSync(previewsDir)) {
    await fs.promises.mkdir(previewsDir, { recursive: true })
  }
}

/**
 * Full flow: Setup a worktree for browser preview
 * - Setup symlinks
 * - Link with Herd
 * - Return the URL
 */
export async function setupWorktreeForPreview(
  worktreePath: string,
  mainRepoPath: string
): Promise<{ success: boolean; message: string; url?: string; warnings?: string[] }> {
  // Check if Herd is installed
  const herdInstalled = await isHerdInstalled()
  if (!herdInstalled) {
    return {
      success: false,
      message: 'Herd CLI is not installed',
    }
  }

  // Check if this is a Laravel project
  if (!isLaravelProject(worktreePath)) {
    return {
      success: false,
      message: 'Not a Laravel project (no artisan file found)',
    }
  }

  // Setup symlinks
  const symlinkResult = await setupWorktreeSymlinks(worktreePath, mainRepoPath)
  const warnings = symlinkResult.warnings

  // Link with Herd
  const linkResult = await linkWithHerd(worktreePath)
  if (!linkResult.success) {
    return {
      success: false,
      message: linkResult.message,
      warnings,
    }
  }

  return {
    success: true,
    message: `Ready at ${linkResult.url}`,
    url: linkResult.url,
    warnings: warnings.length > 0 ? warnings : undefined,
  }
}

