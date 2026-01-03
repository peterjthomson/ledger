/**
 * Repository Management Module
 *
 * This module provides infrastructure for managing multiple git repositories.
 * It replaces the global state pattern in git-service.ts with a proper
 * manager class and typed contexts.
 *
 * Usage:
 * ```typescript
 * import { getRepositoryManager } from '@/lib/repositories'
 *
 * const manager = getRepositoryManager()
 * await manager.open('/path/to/repo')
 *
 * const active = manager.getActive()
 * if (active) {
 *   const branches = await active.git.branch()
 * }
 * ```
 */

export type { RepositoryContext, RepositoryMetadata, RepositoryProvider, RepositoryType, RemoteRepoInfo } from './repository-context'
export { createRepositoryContext, createRemoteRepositoryContext, parseGitHubRepo, detectProvider, getDefaultBranch, getRemoteUrl } from './repository-context'

export { RepositoryManager, getRepositoryManager } from './repository-manager'
