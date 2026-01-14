/**
 * Commit Service Types
 *
 * Type definitions for commit-related operations.
 * These types are used by both the service and handlers.
 */

/**
 * Basic commit information for timeline display
 */
export interface CommitInfo {
  hash: string
  shortHash: string
  message: string
  author: string
  date: string
  isMerge: boolean
  filesChanged?: number
  additions?: number
  deletions?: number
}

/**
 * Commit with graph data (parent hashes for graph rendering)
 */
export interface GraphCommit extends CommitInfo {
  parents: string[] // Parent commit hashes
  refs: string[] // Branch/tag refs pointing to this commit
}

/**
 * Uncommitted file info (staged + unstaged + untracked)
 */
export interface UncommittedFile {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'
  staged: boolean
}

/**
 * File change info within a commit
 */
export interface CommitFileChange {
  path: string
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied'
  additions: number
  deletions: number
  oldPath?: string // For renames
}

/**
 * Detailed commit information
 */
export interface CommitDetails {
  hash: string
  shortHash: string
  message: string
  body: string
  author: string
  authorEmail: string
  date: string
  parentHashes: string[]
  files: CommitFileChange[]
  totalAdditions: number
  totalDeletions: number
}

/**
 * Diff file info
 */
export interface DiffFile {
  path: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  additions: number
  deletions: number
  oldPath?: string // For renames
}

/**
 * A single line in a diff
 */
export interface DiffLine {
  type: 'context' | 'add' | 'delete' | 'header'
  content: string
  oldLineNumber?: number
  newLineNumber?: number
}

/**
 * Diff hunk (a section of changes)
 */
export interface DiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: DiffLine[]
}

/**
 * Full diff for a file
 */
export interface FileDiff {
  file: DiffFile
  hunks: DiffHunk[]
  isBinary: boolean
}

/**
 * Commit diff result
 */
export interface CommitDiff {
  hash: string
  message: string
  author: string
  date: string
  files: FileDiff[]
  totalAdditions: number
  totalDeletions: number
}

/**
 * Result of commit operations
 */
export interface CommitResult {
  success: boolean
  message: string
  behindCount?: number
  hash?: string
}

/**
 * Result of reset operations
 */
export interface ResetResult {
  success: boolean
  message: string
  stashed?: string // Message if changes were auto-stashed
}
