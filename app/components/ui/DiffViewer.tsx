/**
 * DiffViewer - Reusable component for displaying git diffs
 *
 * This is the base diff rendering component. It handles:
 * - Hunk and line rendering
 * - Line numbers (old/new)
 * - Line type styling (add/delete/context)
 * - Binary/empty states
 * - Optional syntax highlighting
 *
 * For interactive features (staging, line selection), compose this with
 * additional props or wrap in a specialized component.
 */

import { useCallback, useEffect, useState } from 'react'
import type { StagingFileDiff, FileDiff } from '../../types/electron'
import { getLanguageFromPath, highlightLines } from '../../utils/syntax-highlighter'
import type { BundledLanguage } from 'shiki'

/**
 * Generic diff line type that works with both DiffLine and StagingDiffLine
 */
interface GenericDiffLine {
  type: 'context' | 'add' | 'delete' | 'header'
  content: string
  oldLineNumber?: number
  newLineNumber?: number
  lineIndex?: number // Only present in StagingDiffLine
}

/**
 * Generic hunk type that works with both DiffHunk and StagingDiffHunk
 */
interface GenericDiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: GenericDiffLine[]
  header?: string // Only present in StagingDiffHunk
  rawPatch?: string // Only present in StagingDiffHunk
}

export interface DiffViewerProps {
  /** The parsed diff to display (supports both FileDiff and StagingFileDiff) */
  diff: StagingFileDiff | FileDiff | null
  /** File path (used for syntax highlighting language detection) */
  filePath?: string
  /** Whether the diff is loading */
  loading?: boolean
  /** Enable syntax highlighting */
  syntaxHighlighting?: boolean
  /** Custom loading message */
  loadingMessage?: string
  /** Custom empty message */
  emptyMessage?: string
  /** Render custom actions in the hunk header */
  renderHunkActions?: (hunk: GenericDiffHunk, hunkIndex: number) => React.ReactNode
  /** Whether lines are selectable (enables click handling) */
  selectableLines?: boolean
  /** Currently selected lines: Map of hunkIndex -> Set of lineIndices */
  selectedLines?: Map<number, Set<number>>
  /** Called when a line is clicked (if selectableLines is true) */
  onLineClick?: (hunkIndex: number, lineIndex: number, shiftKey: boolean) => void
  /** CSS class name for the container */
  className?: string
}

/**
 * DiffViewer renders a parsed git diff with hunks and lines.
 *
 * Basic usage (read-only):
 * ```tsx
 * <DiffViewer diff={fileDiff} loading={isLoading} />
 * ```
 *
 * With syntax highlighting:
 * ```tsx
 * <DiffViewer diff={fileDiff} filePath="src/app.tsx" syntaxHighlighting />
 * ```
 *
 * With line selection (for staging):
 * ```tsx
 * <DiffViewer
 *   diff={fileDiff}
 *   selectableLines
 *   selectedLines={selectedLines}
 *   onLineClick={handleLineClick}
 *   renderHunkActions={(hunk, idx) => <HunkActions hunkIndex={idx} />}
 * />
 * ```
 */
export function DiffViewer({
  diff,
  filePath,
  loading = false,
  syntaxHighlighting = false,
  loadingMessage = 'Loading diff...',
  emptyMessage = 'No changes to display',
  renderHunkActions,
  selectableLines = false,
  selectedLines,
  onLineClick,
  className = '',
}: DiffViewerProps) {
  // Syntax highlighting state
  const [highlightedLines, setHighlightedLines] = useState<Map<number, string>>(new Map())

  // Load syntax highlighting when diff changes
  useEffect(() => {
    if (!syntaxHighlighting || !diff || !filePath) {
      setHighlightedLines(new Map())
      return
    }

    let cancelled = false

    const highlightDiff = async () => {
      const language = getLanguageFromPath(filePath)
      if (!language) {
        setHighlightedLines(new Map())
        return
      }

      // Collect all lines from all hunks with a global index
      const allLines: Array<{ code: string; lineIndex: number; globalKey: number }> = []
      let globalIndex = 0

      for (const hunk of diff.hunks) {
        for (const line of hunk.lines) {
          allLines.push({
            code: line.content,
            lineIndex: line.lineIndex,
            globalKey: globalIndex++,
          })
        }
      }

      try {
        const highlighted = await highlightLines(
          allLines.map((l) => ({ code: l.code, lineIndex: l.globalKey })),
          language as BundledLanguage
        )

        if (!cancelled) {
          const resultMap = new Map<number, string>()
          for (const line of allLines) {
            const html = highlighted.get(line.globalKey)
            if (html) {
              resultMap.set(line.globalKey, html)
            }
          }
          setHighlightedLines(resultMap)
        }
      } catch (error) {
        console.warn('[DiffViewer] Syntax highlighting failed:', error)
        if (!cancelled) {
          setHighlightedLines(new Map())
        }
      }
    }

    highlightDiff()

    return () => {
      cancelled = true
    }
  }, [diff, filePath, syntaxHighlighting])

  // Get highlighted content for a specific line
  const getHighlightedContent = useCallback(
    (hunkIdx: number, lineArrayIndex: number): string | null => {
      if (!diff || !syntaxHighlighting) return null

      // Calculate global index based on array position
      let globalIndex = 0
      for (let h = 0; h < hunkIdx; h++) {
        globalIndex += diff.hunks[h].lines.length
      }
      globalIndex += lineArrayIndex

      return highlightedLines.get(globalIndex) || null
    },
    [diff, highlightedLines, syntaxHighlighting]
  )

  // Handle line click
  const handleLineClick = useCallback(
    (hunkIndex: number, line: GenericDiffLine, lineArrayIndex: number, event: React.MouseEvent) => {
      if (!selectableLines || !onLineClick) return
      // Only allow selecting add/delete lines, not context
      if (line.type === 'context') return
      // Use lineIndex if available (StagingDiffLine), otherwise fall back to array index
      const effectiveLineIndex = line.lineIndex ?? lineArrayIndex
      onLineClick(hunkIndex, effectiveLineIndex, event.shiftKey)
    },
    [selectableLines, onLineClick]
  )

  // Check if a line is selected
  const isLineSelected = useCallback(
    (hunkIndex: number, line: GenericDiffLine, lineArrayIndex: number): boolean => {
      if (!selectedLines) return false
      // Use lineIndex if available (StagingDiffLine), otherwise fall back to array index
      const effectiveLineIndex = line.lineIndex ?? lineArrayIndex
      return selectedLines.get(hunkIndex)?.has(effectiveLineIndex) || false
    },
    [selectedLines]
  )

  // Render states
  if (loading) {
    return <div className={`diff-viewer diff-viewer-loading ${className}`}>{loadingMessage}</div>
  }

  if (!diff) {
    return <div className={`diff-viewer diff-viewer-empty ${className}`}>{emptyMessage}</div>
  }

  if (diff.isBinary) {
    return <div className={`diff-viewer diff-viewer-binary ${className}`}>Binary file</div>
  }

  if (diff.hunks.length === 0) {
    return <div className={`diff-viewer diff-viewer-empty ${className}`}>{emptyMessage}</div>
  }

  return (
    <div className={`diff-viewer ${className}`}>
      {diff.hunks.map((hunk, hunkIdx) => (
        <div key={hunkIdx} className="diff-hunk">
          <div className="diff-hunk-header">
            <span className="diff-hunk-header-text">
              {hunk.header || `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`}
            </span>
            {renderHunkActions && (
              <div className="diff-hunk-actions">{renderHunkActions(hunk, hunkIdx)}</div>
            )}
          </div>
          <div className="diff-hunk-lines">
            {hunk.lines.map((line, lineArrayIdx) => {
              const isSelectable = selectableLines && line.type !== 'context'
              const isSelected = isLineSelected(hunkIdx, line, lineArrayIdx)
              const highlightedHtml = getHighlightedContent(hunkIdx, lineArrayIdx)
              const lineKey = line.lineIndex ?? lineArrayIdx

              return (
                <div
                  key={lineKey}
                  className={`diff-line diff-line-${line.type}${isSelected ? ' selected' : ''}${isSelectable ? ' selectable' : ''}`}
                  onClick={isSelectable ? (e) => handleLineClick(hunkIdx, line, lineArrayIdx, e) : undefined}
                >
                  <span className="diff-line-number old">{line.oldLineNumber || ''}</span>
                  <span className="diff-line-number new">{line.newLineNumber || ''}</span>
                  <span className="diff-line-prefix">
                    {line.type === 'add' ? '+' : line.type === 'delete' ? '-' : ' '}
                  </span>
                  {highlightedHtml ? (
                    <span
                      className="diff-line-content highlighted"
                      dangerouslySetInnerHTML={{ __html: highlightedHtml }}
                    />
                  ) : (
                    <span className="diff-line-content">{line.content}</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * DiffStats - Shows diff statistics (files, additions, deletions)
 */
export interface DiffStatsProps {
  additions: number
  deletions: number
  files?: number
}

export function DiffStats({ additions, deletions, files }: DiffStatsProps) {
  return (
    <span className="diff-stats">
      {files !== undefined && (
        <span className="diff-stat-files">
          {files} {files === 1 ? 'file' : 'files'}
        </span>
      )}
      <span className="diff-additions">+{additions}</span>
      <span className="diff-deletions">-{deletions}</span>
    </span>
  )
}

