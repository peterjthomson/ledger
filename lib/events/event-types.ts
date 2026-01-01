/**
 * Ledger Event Types
 *
 * Central event type definitions for main <-> renderer communication.
 */

// Repository events
export interface RepoOpenedEvent {
  type: 'repo:opened'
  path: string
  name: string
}

export interface RepoClosedEvent {
  type: 'repo:closed'
  path: string
}

export interface RepoSwitchedEvent {
  type: 'repo:switched'
  fromPath: string | null
  toPath: string
  name: string
}

export interface RepoRefreshedEvent {
  type: 'repo:refreshed'
  path: string
}

// Git operation events
export interface GitCommitEvent {
  type: 'git:commit'
  hash: string
  message: string
  path: string
}

export interface GitPushEvent {
  type: 'git:push'
  branch: string
  path: string
}

export interface GitPullEvent {
  type: 'git:pull'
  branch: string
  path: string
}

export interface GitCheckoutEvent {
  type: 'git:checkout'
  branch: string
  path: string
}

export interface GitStashEvent {
  type: 'git:stash'
  action: 'save' | 'apply' | 'pop' | 'drop'
  path: string
}

// Union of all events
export type LedgerEvent =
  | RepoOpenedEvent
  | RepoClosedEvent
  | RepoSwitchedEvent
  | RepoRefreshedEvent
  | GitCommitEvent
  | GitPushEvent
  | GitPullEvent
  | GitCheckoutEvent
  | GitStashEvent

// Event type strings for subscription
export type LedgerEventType = LedgerEvent['type']

// IPC channel for events
export const LEDGER_EVENT_CHANNEL = 'ledger:event'
