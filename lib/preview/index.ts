/**
 * Preview System - Extensible Branch/PR/Worktree Preview
 *
 * Provides a unified interface for previewing code in the browser.
 * Built-in providers:
 *   - npm-dev: Universal JS/TS projects (npm run dev)
 *   - herd: Laravel projects via Laravel Herd
 *
 * Plugins can register additional providers for:
 *   - Vercel (cloud preview deployments)
 *   - Docker Compose
 *   - Rails
 *   - Custom environments
 *
 * @example
 * ```typescript
 * import { previewRegistry, npmDevProvider } from '@/lib/preview'
 *
 * // Get available providers for a project
 * const providers = await previewRegistry.getAvailableProviders('/path/to/repo')
 *
 * // Preview with specific provider
 * const result = await providers[0].provider.previewBranch('feature-x', '/path/to/repo', createWorktree)
 * ```
 */

// Types
export type {
  PreviewType,
  ProviderAvailability,
  PreviewResult,
  CreateWorktreeFn,
  PreviewProvider,
} from './preview-types'

// Registry
export { previewRegistry, type ProviderWithAvailability } from './preview-registry'

// Built-in Providers
import * as npmDevProvider from './providers/npm-dev-provider'
import { railsProvider } from './providers/rails-provider'

// Provider wrapper for npm-dev (conforms to PreviewProvider interface)
import type { PreviewProvider, CreateWorktreeFn } from './preview-types'

export const npmDevPreviewProvider: PreviewProvider = {
  id: 'npm-dev',
  name: 'Dev Server',
  description: 'Run npm run dev (Vite, Next.js, etc.)',
  icon: 'play',
  type: 'local',

  checkAvailability: npmDevProvider.checkAvailability,

  async previewWorktree(worktreePath, mainRepoPath, _createWorktree) {
    return npmDevProvider.previewWorktree(worktreePath, mainRepoPath)
  },

  async previewBranch(branchName, mainRepoPath, createWorktree) {
    return npmDevProvider.previewBranch(branchName, mainRepoPath, createWorktree)
  },

  async previewPR(prNumber, prBranchName, mainRepoPath, createWorktree) {
    return npmDevProvider.previewPR(prNumber, prBranchName, mainRepoPath, createWorktree)
  },

  stop: npmDevProvider.stopServer,
  stopAll: npmDevProvider.stopAllServers,
  isRunning: npmDevProvider.isServerRunning,
  getUrl: npmDevProvider.getServerUrl,
}

// Re-export npm-dev utilities for direct use
export {
  getRunningServers as getNpmDevRunningServers,
  stopServer as stopNpmDevServer,
  stopAllServers as stopAllNpmDevServers,
} from './providers/npm-dev-provider'

/**
 * Initialize the preview system with built-in providers
 */
export function initializePreviewProviders(): void {
  // Import here to avoid circular dependencies
  const { previewRegistry } = require('./preview-registry')

  // Register built-in providers
  // Order matters - first compatible provider is used for "auto" preview
  
  // 1. Rails provider (uses puma-dev for .test domains when available)
  previewRegistry.register(railsProvider)

  // 2. npm-dev provider (universal JS/TS, fallback for most projects)
  previewRegistry.register(npmDevPreviewProvider)

  // Note: Herd provider would be registered here too once refactored
  // previewRegistry.register(herdPreviewProvider)

  console.info('[Preview] Initialized with built-in providers:', previewRegistry.getIds())
}

// Re-export Rails provider for direct use
export { railsProvider }
