import * as path from 'path'
import { RepositoryContext, RepositoryType, createRepositoryContext } from './repository-context'

/**
 * RepositoryManager - Singleton managing multiple repository contexts
 *
 * Capabilities:
 * - Track multiple repositories simultaneously
 * - Switch between them
 * - Maintain a clear "active" repo concept
 *
 * Key design decisions:
 * 1. Singleton pattern ensures one source of truth
 * 2. Map-based storage for O(1) lookups by ID or path
 * 3. Active repo concept for single-repo operations
 * 4. Event-like callbacks for UI updates (future: proper events)
 * 5. LRU eviction policy to prevent unbounded memory growth
 *
 * SAFETY GUARANTEES:
 * - Each context has a unique ID that never changes
 * - switchEpoch increments on every repo change for stale detection
 * - onChange callbacks fire AFTER state is consistent
 * - Global state is always kept in sync with active context
 * - Max 12 repositories to prevent memory issues (LRU eviction)
 */

/** Maximum number of repositories to keep open before evicting LRU entries */
const MAX_REPOSITORIES = 12

export class RepositoryManager {
  private static instance: RepositoryManager | null = null

  private contexts: Map<string, RepositoryContext> = new Map()
  private pathIndex: Map<string, string> = new Map() // path -> id for fast lookup (local repos only)
  private remoteIndex: Map<string, string> = new Map() // fullName -> id for fast lookup (remote repos only)
  private activeId: string | null = null

  // Safety: Epoch counter for detecting stale operations
  // Increments every time the active repo changes
  private _switchEpoch: number = 0

  // Callbacks for state changes (simple event system)
  private onChangeCallbacks: Set<() => void> = new Set()

  // Callback to sync global state (injected from git-service)
  private globalStateSyncCallback: ((path: string | null) => void) | null = null

  private constructor() {
    // Private constructor enforces singleton
  }

  /**
   * Get the current switch epoch
   * Use this to detect if the active repo has changed during an async operation
   */
  get switchEpoch(): number {
    return this._switchEpoch
  }

  /**
   * Check if an epoch is still current (repo hasn't changed)
   * Use this in async operations to abort if repo changed
   */
  isEpochCurrent(epoch: number): boolean {
    return epoch === this._switchEpoch
  }

  /**
   * Set a callback to sync global state
   * This ensures git-service's module-level `git` and `repoPath` stay in sync
   */
  setGlobalStateSyncCallback(callback: (path: string | null) => void): void {
    this.globalStateSyncCallback = callback
  }

  private syncGlobalState(): void {
    if (this.globalStateSyncCallback) {
      const active = this.getActive()
      // Only sync local repos (remote repos have null path)
      this.globalStateSyncCallback(active?.path ?? null)
    }
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): RepositoryManager {
    if (!RepositoryManager.instance) {
      RepositoryManager.instance = new RepositoryManager()
    }
    return RepositoryManager.instance
  }

  /**
   * Reset the singleton (useful for testing)
   */
  static reset(): void {
    RepositoryManager.instance = null
  }

  /**
   * Subscribe to changes (repos added, removed, switched)
   * Returns unsubscribe function
   */
  onChange(callback: () => void): () => void {
    this.onChangeCallbacks.add(callback)
    return () => {
      this.onChangeCallbacks.delete(callback)
    }
  }

  private notifyChange(): void {
    this.onChangeCallbacks.forEach((cb) => cb())
  }

  /**
   * Evict least recently used repositories if at capacity
   *
   * Called before adding new repos to ensure we stay within MAX_REPOSITORIES.
   * Never evicts the currently active repository.
   *
   * @returns Array of evicted repository IDs
   */
  private evictLRUIfNeeded(): string[] {
    const evicted: string[] = []

    // Check if we need to evict (at or over capacity)
    while (this.contexts.size >= MAX_REPOSITORIES) {
      // Get all repos sorted by lastAccessed (oldest first)
      const sortedByLRU = Array.from(this.contexts.values())
        .filter((ctx) => ctx.id !== this.activeId) // Never evict active repo
        .sort((a, b) => a.lastAccessed.getTime() - b.lastAccessed.getTime())

      if (sortedByLRU.length === 0) {
        // All repos are the active one (shouldn't happen with MAX > 1)
        console.warn('[RepositoryManager] Cannot evict: only active repo remains')
        break
      }

      // Evict the oldest (LRU) repo
      const lruContext = sortedByLRU[0]
      console.info(`[RepositoryManager] Evicting LRU repository: ${lruContext.name} (last accessed: ${lruContext.lastAccessed.toISOString()})`)

      // Clean up SimpleGit instance
      if (lruContext.git) {
        ;(lruContext as { git: null }).git = null
      }

      // Remove from maps
      this.contexts.delete(lruContext.id)
      if (lruContext.path) {
        this.pathIndex.delete(lruContext.path)
      }
      if (lruContext.remote?.fullName) {
        this.remoteIndex.delete(lruContext.remote.fullName)
      }

      evicted.push(lruContext.id)
    }

    return evicted
  }

  /**
   * Open a repository at the given path
   *
   * If the repo is already open, returns the existing context.
   * Otherwise creates a new context and optionally makes it active.
   *
   * SAFETY: When switching active repos:
   * - Epoch is incremented to invalidate stale operations
   * - Global state is synced
   * - onChange fires after state is consistent
   *
   * @param repoPath - Absolute path to the git repository
   * @param makeActive - Whether to make this the active repo (default: true)
   * @returns The repository context
   */
  async open(repoPath: string, makeActive: boolean = true): Promise<RepositoryContext> {
    // Normalize path to handle trailing slashes, symlinks, etc.
    const normalizedPath = path.resolve(repoPath)
    
    // Check if already open
    const existingId = this.pathIndex.get(normalizedPath)
    if (existingId) {
      const existing = this.contexts.get(existingId)!
      existing.lastAccessed = new Date()

      if (makeActive && this.activeId !== existingId) {
        // SAFETY: Increment epoch when switching repos
        this._switchEpoch++
        this.activeId = existingId
        this.syncGlobalState()
        this.notifyChange()
      }

      return existing
    }

    // Evict LRU repos if at capacity before adding new one
    this.evictLRUIfNeeded()

    // Create new context
    const context = await createRepositoryContext(normalizedPath)

    // Check again after creation - git may have resolved to a different root
    // (e.g., if user opened a subdirectory of a repo)
    if (context.path) {
      const existingByActualPath = this.pathIndex.get(context.path)
      if (existingByActualPath) {
        const existing = this.contexts.get(existingByActualPath)!
        existing.lastAccessed = new Date()
        if (makeActive && this.activeId !== existingByActualPath) {
          this._switchEpoch++
          this.activeId = existingByActualPath
          this.syncGlobalState()
          this.notifyChange()
        }
        return existing
      }
    }

    // Store in maps
    this.contexts.set(context.id, context)
    if (context.path) {
      this.pathIndex.set(context.path, context.id)
    }

    if (makeActive) {
      // SAFETY: Increment epoch when switching repos
      this._switchEpoch++
      this.activeId = context.id
      this.syncGlobalState()
    }

    this.notifyChange()
    return context
  }

  /**
   * Get a repository context by ID
   */
  get(id: string): RepositoryContext | null {
    return this.contexts.get(id) || null
  }

  /**
   * Get a repository context by path
   */
  getByPath(repoPath: string): RepositoryContext | null {
    const id = this.pathIndex.get(repoPath)
    return id ? this.contexts.get(id) || null : null
  }

  /**
   * Get the currently active repository context
   *
   * Returns null if no repository is currently active.
   */
  getActive(): RepositoryContext | null {
    if (!this.activeId) return null
    return this.contexts.get(this.activeId) || null
  }

  /**
   * Get the active repo or throw an error
   *
   * Use this when a valid repo is required.
   * Provides better error messages than null checks.
   */
  requireActive(): RepositoryContext {
    const active = this.getActive()
    if (!active) {
      throw new Error('No repository is currently open')
    }
    return active
  }

  /**
   * Switch to a different repository
   *
   * SAFETY: Increments epoch, syncs global state, notifies listeners
   *
   * @param id - The repository ID to switch to
   * @returns true if switched, false if ID not found
   */
  setActive(id: string): boolean {
    if (!this.contexts.has(id)) {
      return false
    }

    if (this.activeId !== id) {
      // SAFETY: Increment epoch when switching repos
      this._switchEpoch++
      this.activeId = id
      const context = this.contexts.get(id)!
      context.lastAccessed = new Date()
      this.syncGlobalState()
      this.notifyChange()
    }

    return true
  }

  /**
   * Close a repository
   *
   * Removes it from the manager. If it was active, clears active.
   *
   * SAFETY: If closing the active repo, increments epoch and syncs global state
   *
   * @param id - The repository ID to close
   * @returns true if closed, false if ID not found
   */
  close(id: string): boolean {
    const context = this.contexts.get(id)
    if (!context) {
      return false
    }

    const wasActive = this.activeId === id

    // Clean up SimpleGit instance to release resources
    // Note: SimpleGit doesn't have explicit cleanup, but nulling prevents further operations
    // and allows GC to collect the instance and any associated child processes
    if (context.git) {
      // Cast to allow nulling - the context is being removed anyway
      ;(context as { git: null }).git = null
    }

    this.contexts.delete(id)
    // Remove from appropriate index
    if (context.path) {
      this.pathIndex.delete(context.path)
    }
    if (context.remote?.fullName) {
      this.remoteIndex.delete(context.remote.fullName)
    }

    if (wasActive) {
      // SAFETY: Increment epoch when active repo changes
      this._switchEpoch++

      // Pick the most recently accessed repo, or null
      const remaining = Array.from(this.contexts.values())
      if (remaining.length > 0) {
        remaining.sort((a, b) => b.lastAccessed.getTime() - a.lastAccessed.getTime())
        this.activeId = remaining[0].id
      } else {
        this.activeId = null
      }

      this.syncGlobalState()
    }

    this.notifyChange()
    return true
  }

  /**
   * Close the repository at a given path
   */
  closeByPath(repoPath: string): boolean {
    const id = this.pathIndex.get(repoPath)
    return id ? this.close(id) : false
  }

  /**
   * List all open repositories
   *
   * Returns contexts sorted by last accessed time (most recent first).
   */
  list(): RepositoryContext[] {
    return Array.from(this.contexts.values()).sort(
      (a, b) => b.lastAccessed.getTime() - a.lastAccessed.getTime()
    )
  }

  /**
   * Get the number of open repositories
   */
  get count(): number {
    return this.contexts.size
  }

  /**
   * Check if any repository is open
   */
  get hasActive(): boolean {
    return this.activeId !== null
  }

  /**
   * Get a summary of all repos for UI display
   */
  getSummary(): Array<{
    id: string
    name: string
    path: string | null
    isActive: boolean
    provider: string
    type: RepositoryType
    remote: { owner: string; repo: string; fullName: string } | null
  }> {
    return this.list().map((ctx) => ({
      id: ctx.id,
      name: ctx.name,
      path: ctx.path,
      isActive: ctx.id === this.activeId,
      provider: ctx.metadata.provider,
      type: ctx.type,
      remote: ctx.remote,
    }))
  }

  /**
   * Add a remote repository (API-only, no local clone)
   *
   * @param context - Pre-created remote repository context
   * @param makeActive - Whether to make this the active repo (default: true)
   * @returns The repository context
   */
  addRemote(context: RepositoryContext, makeActive: boolean = true): RepositoryContext {
    // Check if already open by remote fullName
    if (context.remote?.fullName) {
      const existingId = this.remoteIndex.get(context.remote.fullName)
      if (existingId) {
        const existing = this.contexts.get(existingId)!
        existing.lastAccessed = new Date()

        if (makeActive && this.activeId !== existingId) {
          this._switchEpoch++
          this.activeId = existingId
          this.syncGlobalState()
          this.notifyChange()
        }

        return existing
      }
    }

    // Evict LRU repos if at capacity before adding new one
    this.evictLRUIfNeeded()

    // Store in maps
    this.contexts.set(context.id, context)
    if (context.remote?.fullName) {
      this.remoteIndex.set(context.remote.fullName, context.id)
    }

    if (makeActive) {
      this._switchEpoch++
      this.activeId = context.id
      this.syncGlobalState()
    }

    this.notifyChange()
    return context
  }

  /**
   * Get a remote repository context by fullName (owner/repo)
   */
  getByRemote(fullName: string): RepositoryContext | null {
    const id = this.remoteIndex.get(fullName)
    return id ? this.contexts.get(id) || null : null
  }
}

// Export singleton getter for convenience
export const getRepositoryManager = (): RepositoryManager => {
  return RepositoryManager.getInstance()
}
