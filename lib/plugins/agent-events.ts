/**
 * Agent Event System
 *
 * Event system for tracking AI agent activity in worktrees.
 * Enables plugins to monitor and respond to agent operations.
 *
 * Use Cases:
 * - Track agent activity across multiple worktrees
 * - Notify managers when agents complete tasks
 * - Coordinate between multiple agents
 * - Log agent operations for analytics
 */

import type { WorktreeAgent, EnhancedWorktree } from '@/lib/services/worktree/worktree-types'

// ============================================================================
// Agent Event Types
// ============================================================================

/**
 * Types of agent events
 */
export type AgentEventType =
  // Lifecycle events
  | 'agent:detected'       // New agent worktree detected
  | 'agent:removed'        // Agent worktree removed
  // Activity events
  | 'agent:active'         // Agent showing activity (file changes)
  | 'agent:idle'           // Agent stopped making changes
  | 'agent:stale'          // Agent inactive for extended period
  // Work events
  | 'agent:commit'         // Agent made a commit
  | 'agent:push'           // Agent pushed changes
  | 'agent:pr-created'     // Agent created a PR
  | 'agent:pr-updated'     // Agent updated a PR
  // Coordination events
  | 'agent:conflict'       // Agent has merge conflicts
  | 'agent:behind'         // Agent branch is behind main

/**
 * Agent event payload
 */
export interface AgentEvent {
  type: AgentEventType
  agentType: WorktreeAgent
  worktreePath: string
  branch: string | null
  timestamp: Date
  data?: AgentEventData
}

/**
 * Event-specific data payloads
 */
export interface AgentEventData {
  // Activity data
  changedFiles?: number
  additions?: number
  deletions?: number
  // Commit data
  commitHash?: string
  commitMessage?: string
  // PR data
  prNumber?: number
  prTitle?: string
  prUrl?: string
  // Conflict data
  conflictingFiles?: string[]
  // Behind data
  commitsBehind?: number
}

/**
 * Agent activity state
 */
export interface AgentState {
  agentType: WorktreeAgent
  worktreePath: string
  branch: string | null
  status: 'active' | 'idle' | 'stale' | 'unknown'
  lastActivity: Date
  lastCommit?: Date
  changedFiles: number
  additions: number
  deletions: number
}

// ============================================================================
// Agent Event Bus
// ============================================================================

type AgentEventCallback = (event: AgentEvent) => void

/**
 * Agent Event Bus
 *
 * Central hub for agent-related events.
 * Plugins can subscribe to specific events or all events.
 */
class AgentEventBus {
  private listeners: Map<AgentEventType | '*', Set<AgentEventCallback>> = new Map()
  private agentStates: Map<string, AgentState> = new Map()
  private activityTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()

  // Thresholds (in milliseconds)
  private readonly IDLE_THRESHOLD = 5 * 60 * 1000   // 5 minutes
  private readonly STALE_THRESHOLD = 60 * 60 * 1000 // 1 hour

  /**
   * Subscribe to agent events
   *
   * @param type Event type to subscribe to, or '*' for all events
   * @param callback Function to call when event occurs
   * @returns Unsubscribe function
   */
  on(type: AgentEventType | '*', callback: AgentEventCallback): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set())
    }
    this.listeners.get(type)!.add(callback)

    return () => {
      this.listeners.get(type)?.delete(callback)
    }
  }

  /**
   * Emit an agent event
   */
  emit(event: AgentEvent): void {
    // Notify specific listeners
    const specific = this.listeners.get(event.type)
    if (specific) {
      for (const callback of specific) {
        try {
          callback(event)
        } catch (error) {
          console.error('[AgentEvents] Listener error:', error)
        }
      }
    }

    // Notify wildcard listeners
    const wildcard = this.listeners.get('*')
    if (wildcard) {
      for (const callback of wildcard) {
        try {
          callback(event)
        } catch (error) {
          console.error('[AgentEvents] Listener error:', error)
        }
      }
    }

    // Update state
    this.updateState(event)
  }

  /**
   * Update agent state from worktree data
   * Call this when worktree list is refreshed
   */
  updateFromWorktrees(worktrees: EnhancedWorktree[]): void {
    const currentPaths = new Set<string>()

    for (const wt of worktrees) {
      if (wt.agent === 'working-folder' || wt.agent === 'unknown') continue

      currentPaths.add(wt.path)
      const existingState = this.agentStates.get(wt.path)

      if (!existingState) {
        // New agent detected
        this.emit({
          type: 'agent:detected',
          agentType: wt.agent,
          worktreePath: wt.path,
          branch: wt.branch,
          timestamp: new Date(),
        })
      }

      // Check for activity changes
      if (existingState) {
        const hadChanges = existingState.changedFiles > 0
        const hasChanges = wt.changedFileCount > 0

        if (!hadChanges && hasChanges) {
          // Agent became active
          this.emit({
            type: 'agent:active',
            agentType: wt.agent,
            worktreePath: wt.path,
            branch: wt.branch,
            timestamp: new Date(),
            data: {
              changedFiles: wt.changedFileCount,
              additions: wt.additions,
              deletions: wt.deletions,
            },
          })
        }
      }

      // Update state
      this.agentStates.set(wt.path, {
        agentType: wt.agent,
        worktreePath: wt.path,
        branch: wt.branch,
        status: this.calculateStatus(wt),
        lastActivity: new Date(wt.lastModified),
        changedFiles: wt.changedFileCount,
        additions: wt.additions,
        deletions: wt.deletions,
      })

      // Reset/set activity timer
      this.resetActivityTimer(wt.path, wt.agent, wt.branch)
    }

    // Check for removed agents
    for (const [path, state] of this.agentStates) {
      if (!currentPaths.has(path)) {
        this.emit({
          type: 'agent:removed',
          agentType: state.agentType,
          worktreePath: path,
          branch: state.branch,
          timestamp: new Date(),
        })
        this.agentStates.delete(path)
        this.clearActivityTimer(path)
      }
    }
  }

  /**
   * Get current state for an agent
   */
  getState(worktreePath: string): AgentState | null {
    return this.agentStates.get(worktreePath) ?? null
  }

  /**
   * Get all agent states
   */
  getAllStates(): AgentState[] {
    return Array.from(this.agentStates.values())
  }

  /**
   * Get active agents
   */
  getActiveAgents(): AgentState[] {
    return this.getAllStates().filter((s) => s.status === 'active')
  }

  /**
   * Get agents by type
   */
  getAgentsByType(type: WorktreeAgent): AgentState[] {
    return this.getAllStates().filter((s) => s.agentType === type)
  }

  /**
   * Calculate activity status
   */
  private calculateStatus(wt: EnhancedWorktree): AgentState['status'] {
    const now = Date.now()
    const lastMod = new Date(wt.lastModified).getTime()
    const elapsed = now - lastMod

    if (wt.changedFileCount > 0 && elapsed < this.IDLE_THRESHOLD) {
      return 'active'
    }
    if (elapsed < this.STALE_THRESHOLD) {
      return 'idle'
    }
    return 'stale'
  }

  /**
   * Update internal state from event
   */
  private updateState(event: AgentEvent): void {
    const state = this.agentStates.get(event.worktreePath)
    if (!state) return

    state.lastActivity = event.timestamp

    if (event.type === 'agent:active') {
      state.status = 'active'
      if (event.data?.changedFiles !== undefined) {
        state.changedFiles = event.data.changedFiles
      }
    } else if (event.type === 'agent:idle') {
      state.status = 'idle'
    } else if (event.type === 'agent:stale') {
      state.status = 'stale'
    } else if (event.type === 'agent:commit') {
      state.lastCommit = event.timestamp
    }
  }

  /**
   * Reset activity timer for idle/stale detection
   */
  private resetActivityTimer(
    path: string,
    agentType: WorktreeAgent,
    branch: string | null
  ): void {
    this.clearActivityTimer(path)

    // Set idle timer
    const idleTimer = setTimeout(() => {
      const state = this.agentStates.get(path)
      if (state && state.status === 'active') {
        this.emit({
          type: 'agent:idle',
          agentType,
          worktreePath: path,
          branch,
          timestamp: new Date(),
        })
      }

      // Set stale timer
      const staleTimer = setTimeout(() => {
        const state = this.agentStates.get(path)
        if (state && state.status !== 'stale') {
          this.emit({
            type: 'agent:stale',
            agentType,
            worktreePath: path,
            branch,
            timestamp: new Date(),
          })
        }
      }, this.STALE_THRESHOLD - this.IDLE_THRESHOLD)

      this.activityTimers.set(path + ':stale', staleTimer)
    }, this.IDLE_THRESHOLD)

    this.activityTimers.set(path + ':idle', idleTimer)
  }

  /**
   * Clear activity timers
   */
  private clearActivityTimer(path: string): void {
    const idleTimer = this.activityTimers.get(path + ':idle')
    const staleTimer = this.activityTimers.get(path + ':stale')

    if (idleTimer) {
      clearTimeout(idleTimer)
      this.activityTimers.delete(path + ':idle')
    }
    if (staleTimer) {
      clearTimeout(staleTimer)
      this.activityTimers.delete(path + ':stale')
    }
  }

  /**
   * Cleanup all resources
   *
   * Call this when shutting down the app or when the event bus is no longer needed.
   * Clears all timers, listeners, and state.
   */
  cleanup(): void {
    // Clear all timers
    for (const timer of this.activityTimers.values()) {
      clearTimeout(timer)
    }
    this.activityTimers.clear()

    // Clear all listeners
    this.listeners.clear()

    // Clear all state
    this.agentStates.clear()

    console.info('[AgentEvents] Cleaned up all resources')
  }

  /**
   * Clear all activity timers without clearing state or listeners
   *
   * Useful when pausing activity monitoring temporarily.
   */
  clearAllTimers(): void {
    for (const timer of this.activityTimers.values()) {
      clearTimeout(timer)
    }
    this.activityTimers.clear()
  }
}

// Singleton export
export const agentEvents = new AgentEventBus()

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Notify that an agent made a commit
 */
export function notifyAgentCommit(
  worktreePath: string,
  commitHash: string,
  commitMessage: string
): void {
  const state = agentEvents.getState(worktreePath)
  if (!state) return

  agentEvents.emit({
    type: 'agent:commit',
    agentType: state.agentType,
    worktreePath,
    branch: state.branch,
    timestamp: new Date(),
    data: { commitHash, commitMessage },
  })
}

/**
 * Notify that an agent pushed changes
 */
export function notifyAgentPush(worktreePath: string): void {
  const state = agentEvents.getState(worktreePath)
  if (!state) return

  agentEvents.emit({
    type: 'agent:push',
    agentType: state.agentType,
    worktreePath,
    branch: state.branch,
    timestamp: new Date(),
  })
}

/**
 * Notify that an agent created a PR
 */
export function notifyAgentPRCreated(
  worktreePath: string,
  prNumber: number,
  prTitle: string,
  prUrl: string
): void {
  const state = agentEvents.getState(worktreePath)
  if (!state) return

  agentEvents.emit({
    type: 'agent:pr-created',
    agentType: state.agentType,
    worktreePath,
    branch: state.branch,
    timestamp: new Date(),
    data: { prNumber, prTitle, prUrl },
  })
}

/**
 * Notify that an agent has conflicts
 */
export function notifyAgentConflict(worktreePath: string, conflictingFiles: string[]): void {
  const state = agentEvents.getState(worktreePath)
  if (!state) return

  agentEvents.emit({
    type: 'agent:conflict',
    agentType: state.agentType,
    worktreePath,
    branch: state.branch,
    timestamp: new Date(),
    data: { conflictingFiles },
  })
}
