/**
 * Staging Service Types
 *
 * Type definitions for Staging operations.
 * These types are used by both the service and handlers.
 */

/**
 * Diff hunk in a file diff
 */
export interface StagingDiffHunk {
  header: string
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: StagingDiffLine[]
  /** Raw patch text for this hunk (used for git apply) */
  rawPatch: string
}

/**
 * Line in a diff hunk
 */
export interface StagingDiffLine {
  type: 'context' | 'add' | 'delete'
  content: string
  oldLineNumber?: number
  newLineNumber?: number
  /** Index of this line within the hunk (0-based, for selection) */
  lineIndex: number
}

/**
 * File diff with parsed hunks
 */
export interface StagingFileDiff {
  filePath: string
  oldPath?: string
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked'
  hunks: StagingDiffHunk[]
  isBinary: boolean
  additions: number
  deletions: number
}

/**
 * Result of staging operations
 */
export interface StagingResult {
  success: boolean
  message: string
}
