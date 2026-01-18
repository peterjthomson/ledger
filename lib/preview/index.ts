/**
 * Preview System - Extensible Branch/PR/Worktree Preview
 *
 * Provides a unified interface for previewing code in the browser.
 *
 * Built-in providers (in priority order):
 *   1. laravelProvider - Laravel (Herd → artisan serve)
 *   2. railsProvider   - Rails (puma-dev → bin/dev)
 *   3. nodeProvider    - Node.js (npm/yarn/pnpm run dev)
 *
 * Node is last because Laravel/Rails apps also have package.json,
 * but we want the proper PHP/Ruby server.
 *
 * Future providers:
 *   - pythonProvider (Django, Flask, FastAPI)
 *   - goProvider (Go HTTP servers)
 *   - dockerProvider (docker-compose)
 *   - vercelProvider (cloud preview deployments)
 *
 * @example
 * ```typescript
 * import { previewRegistry, nodeProvider } from '@/lib/preview'
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
import { previewRegistry } from './preview-registry'
export { previewRegistry, type ProviderWithAvailability } from './preview-registry'

// Built-in Providers
import * as nodeProviderModule from './providers/node-provider'
import { railsProvider } from './providers/rails-provider'
import { laravelProvider } from './providers/laravel-provider'

// Provider wrapper for node (conforms to PreviewProvider interface)
import type { PreviewProvider } from './preview-types'

export const nodeProvider: PreviewProvider = {
  id: 'node',
  name: 'Node.js',
  description: 'Run dev server (Vite, Next.js, etc.)',
  icon: 'hexagon', // Node.js hexagon logo
  type: 'local',

  checkAvailability: nodeProviderModule.checkAvailability,

  async previewWorktree(worktreePath, mainRepoPath, _createWorktree) {
    return nodeProviderModule.previewWorktree(worktreePath, mainRepoPath)
  },

  async previewBranch(branchName, mainRepoPath, createWorktree) {
    return nodeProviderModule.previewBranch(branchName, mainRepoPath, createWorktree)
  },

  async previewPR(prNumber, prBranchName, mainRepoPath, createWorktree) {
    return nodeProviderModule.previewPR(prNumber, prBranchName, mainRepoPath, createWorktree)
  },

  stop: nodeProviderModule.stopServer,
  stopAll: nodeProviderModule.stopAllServers,
  isRunning: nodeProviderModule.isServerRunning,
  getUrl: nodeProviderModule.getServerUrl,
}

// Re-export node provider utilities for direct use
export {
  getRunningServers as getNodeRunningServers,
  stopServer as stopNodeServer,
  stopAllServers as stopAllNodeServers,
} from './providers/node-provider'

/**
 * Initialize the preview system with built-in providers
 *
 * Provider priority (first compatible wins):
 * 1. Laravel (Herd → artisan serve)
 * 2. Rails (puma-dev → bin/dev)
 * 3. Node (npm/yarn/pnpm run dev)
 *
 * Note: Node is LAST because Laravel/Rails apps also have package.json
 * but we want to use the proper server (PHP/Ruby), not a Node dev server.
 *
 * Future providers could include:
 * - pythonProvider (Django, Flask, FastAPI)
 * - goProvider (Go HTTP servers)
 * - rustProvider (Actix, Rocket)
 */
export function initializePreviewProviders(): void {
  // Register built-in providers in priority order
  
  // 1. Laravel (Herd for .test domains, artisan serve fallback)
  previewRegistry.register(laravelProvider)

  // 2. Rails (puma-dev for .test domains, bin/dev fallback)
  previewRegistry.register(railsProvider)

  // 3. Node - LAST because it matches anything with package.json
  //    Only use for pure JS/TS apps (React, Vue, Next.js, etc.)
  previewRegistry.register(nodeProvider)

  console.info('[Preview] Initialized with built-in providers:', previewRegistry.getIds())
}

// Re-export providers for direct use
export { laravelProvider }
export { railsProvider }
