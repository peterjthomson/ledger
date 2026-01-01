import { RepositoryContext, RepositoryType, createRepositoryContext } from './repository-context'

/**
 * RepositoryManager - Singleton managing multiple repository contexts
 *
 * This replaces the global `let git` and `let repoPath` pattern in git-service.ts.
 * Instead of a single global repo, we can now:
 * - Track multiple repositories
 * - Switch between them
 * - Have a clear "active" repo concept
 *
 * Key design decisions:
 * 1. Singleton pattern ensures one source of truth
 * 2. Map-based storage for O(1) lookups by ID or path
 * 3. Active repo concept for backward compatibility with existing handlers
 * 4. Event-like callbacks for UI updates (future: proper events)
 *
 * SAFETY GUARANTEES:
 * - Each context has a unique ID that never changes
 * - switchEpoch increments on every repo change for stale detection
 * - onChange callbacks fire AFTER state is consistent
 * - Legacy state is always kept in sync with active context
 */
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

  // Callback to sync legacy global state (injected from git-service)
  private legacySyncCallback: ((path: string | null) => void) | null = null

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
   * Set a callback to sync legacy global state
   * This ensures git-service's global `git` and `repoPath` stay in sync
   */
  setLegacySyncCallback(callback: (path: string | null) => void): void {
    this.legacySyncCallback = callback
  }

  private syncLegacyState(): void {
    if (this.legacySyncCallback) {
      const active = this.getActive()
      // Only sync local repos (remote repos have null path)
      this.legacySyncCallback(active?.path ?? null)
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
   * Open a repository at the given path
   *
   * If the repo is already open, returns the existing context.
   * Otherwise creates a new context and optionally makes it active.
   *
   * SAFETY: When switching active repos:
   * - Epoch is incremented to invalidate stale operations
   * - Legacy state is synced
   * - onChange fires after state is consistent
   *
   * @param repoPath - Absolute path to the git repository
   * @param makeActive - Whether to make this the active repo (default: true)
   * @returns The repository context
   */
  async open(repoPath: string, makeActive: boolean = true): Promise<RepositoryContext> {
    // Check if already open
    const existingId = this.pathIndex.get(repoPath)
    if (existingId) {
      const existing = this.contexts.get(existingId)!
      existing.lastAccessed = new Date()

      if (makeActive && this.activeId !== existingId) {
        // SAFETY: Increment epoch when switching repos
        this._switchEpoch++
        this.activeId = existingId
        this.syncLegacyState()
        this.notifyChange()
      }

      return existing
    }

    // Create new context
    const context = await createRepositoryContext(repoPath)

    // Store in maps
    this.contexts.set(context.id, context)
    if (context.path) {
      this.pathIndex.set(context.path, context.id)
    }

    if (makeActive) {
      // SAFETY: Increment epoch when switching repos
      this._switchEpoch++
      this.activeId = context.id
      this.syncLegacyState()
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
   * This is the primary method handlers will use - it replaces
   * the old `if (!git) return null` guard pattern.
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
   * SAFETY: Increments epoch, syncs legacy state, notifies listeners
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
      this.syncLegacyState()
      this.notifyChange()
    }

    return true
  }

  /**
   * Close a repository
   *
   * Removes it from the manager. If it was active, clears active.
   *
   * SAFETY: If closing the active repo, increments epoch and syncs legacy state
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

      this.syncLegacyState()
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
          this.syncLegacyState()
          this.notifyChange()
        }

        return existing
      }
    }

    // Store in maps
    this.contexts.set(context.id, context)
    if (context.remote?.fullName) {
      this.remoteIndex.set(context.remote.fullName, context.id)
    }

    if (makeActive) {
      this._switchEpoch++
      this.activeId = context.id
      this.syncLegacyState()
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
