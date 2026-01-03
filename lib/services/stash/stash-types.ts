/**
 * Stash Service Types
 *
 * Type definitions for Stash operations.
 * These types are used by both the service and handlers.
 */

/**
 * Stash entry in the stash list
 */
export interface StashEntry {
  index: number
  message: string
  branch: string
  date: string
}

/**
 * File changed in a stash
 */
export interface StashFile {
  path: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  additions: number
  deletions: number
}

/**
 * Result of stash operations
 */
export interface StashResult {
  success: boolean
  message: string
}
