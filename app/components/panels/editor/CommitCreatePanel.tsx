/**
 * StagingPanel - Git staging area with commit functionality
 *
 * Shows staged/unstaged files, diff preview, and commit form with options
 * for creating new branches and PRs.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import type { WorkingStatus, UncommittedFile, StagingFileDiff } from '../../../types/electron'
import type { StatusMessage } from '../../../types/app-types'
import { beforeCommit, afterCommit } from '@/lib/plugins'
import { getLanguageFromPath, highlightLines } from '../../../utils/syntax-highlighter'
import type { BundledLanguage } from 'shiki'

export interface StagingPanelProps {
  workingStatus: WorkingStatus
  currentBranch: string
  onRefresh: () => Promise<void>
  onStatusChange: (status: StatusMessage | null) => void
}

export function StagingPanel({ workingStatus, currentBranch, onRefresh, onStatusChange }: StagingPanelProps) {
  const [selectedFile, setSelectedFile] = useState<UncommittedFile | null>(null)
  const [fileDiff, setFileDiff] = useState<StagingFileDiff | null>(null)
  const [loadingDiff, setLoadingDiff] = useState(false)
  const [commitMessage, setCommitMessage] = useState('')
  const [commitDescription, setCommitDescription] = useState('')
  const [isCommitting, setIsCommitting] = useState(false)
  const [behindPrompt, setBehindPrompt] = useState<{ behindCount: number } | null>(null)
  const [isPulling, setIsPulling] = useState(false)
  const [pushAfterCommit, setPushAfterCommit] = useState(true)
  const [fileContextMenu, setFileContextMenu] = useState<{ x: number; y: number; file: UncommittedFile } | null>(null)
  const fileMenuRef = useRef<HTMLDivElement>(null)
  const stagedListRef = useRef<HTMLUListElement>(null)
  const unstagedListRef = useRef<HTMLUListElement>(null)
  // New branch creation
  const [createNewBranch, setCreateNewBranch] = useState(false)
  const [branchFolder, setBranchFolder] = useState<string>('feature')
  const [customFolder, setCustomFolder] = useState('')
  const [branchName, setBranchName] = useState('')
  // PR creation option (inline with commit flow)
  const [createPR, setCreatePR] = useState(false)
  const [prTitle, setPrTitle] = useState('')
  const [prBody, setPrBody] = useState('')
  const [prDraft, setPrDraft] = useState(false)
  // Behind main indicator
  const [behindMain, setBehindMain] = useState<{ behind: number; baseBranch: string } | null>(null)
  // Line selection state: Map of hunkIndex -> Set of lineIndices
  const [selectedLines, setSelectedLines] = useState<Map<number, Set<number>>>(new Map())
  const [lastClickedLine, setLastClickedLine] = useState<{ hunkIndex: number; lineIndex: number } | null>(null)
  // Syntax highlighting state: Map of lineIndex to highlighted HTML
  const [highlightedLines, setHighlightedLines] = useState<Map<number, string>>(new Map())
  // Inline editing state
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [loadingEdit, setLoadingEdit] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  // Discard All confirmation state
  const [discardAllConfirm, setDiscardAllConfirm] = useState(false)
  // Per-file discard confirmation state (stores file path)
  const [discardFileConfirm, setDiscardFileConfirm] = useState<string | null>(null)
  // Optimistic updates: track files being staged/unstaged/discarded for immediate UI feedback
  const [pendingStage, setPendingStage] = useState<Set<string>>(new Set())
  const [pendingUnstage, setPendingUnstage] = useState<Set<string>>(new Set())
  const [pendingDiscard, setPendingDiscard] = useState<Set<string>>(new Set())

  // Filter out files that are pending operations for instant visual feedback
  const stagedFiles = workingStatus.files.filter((f) => f.staged && !pendingDiscard.has(f.path) && !pendingUnstage.has(f.path))
  const unstagedFiles = workingStatus.files.filter((f) => !f.staged && !pendingStage.has(f.path) && !pendingDiscard.has(f.path))

  // Load behind main count
  useEffect(() => {
    let cancelled = false

    const loadBehindMain = async () => {
      try {
        const result = await window.conveyor.staging.getBehindMainCount()
        if (!cancelled) {
          setBehindMain(result)
        }
      } catch {
        if (!cancelled) {
          setBehindMain(null)
        }
      }
    }

    loadBehindMain()

    return () => {
      cancelled = true
    }
  }, [currentBranch]) // Re-check when branch changes

  // Global Enter key listener to confirm discard when in confirm state
  // This allows: click X with mouse → show ? → press Enter to confirm
  useEffect(() => {
    if (!discardFileConfirm) return

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        
        // Find the file being discarded
        const fileToDiscard = unstagedFiles.find(f => f.path === discardFileConfirm)
        if (!fileToDiscard) {
          setDiscardFileConfirm(null)
          return
        }
        
        // Calculate next file
        const currentIndex = unstagedFiles.findIndex(f => f.path === discardFileConfirm)
        let nextFile: UncommittedFile | null = null
        if (unstagedFiles.length > 1) {
          if (currentIndex < unstagedFiles.length - 1) {
            nextFile = unstagedFiles[currentIndex + 1]
          } else if (currentIndex > 0) {
            nextFile = unstagedFiles[currentIndex - 1]
          }
        }
        
        // Optimistic update
        setDiscardFileConfirm(null)
        setPendingDiscard(prev => new Set(prev).add(fileToDiscard.path))
        setSelectedFile(nextFile)
        
        window.conveyor.staging.discardFileChanges(fileToDiscard.path).then(async (result) => {
          if (result.success) {
            await onRefresh()
          } else {
            onStatusChange({ type: 'error', message: result.message })
          }
          
          // Clear pending state AFTER refresh so file doesn't flicker back
          setPendingDiscard(prev => {
            const next = new Set(prev)
            next.delete(fileToDiscard.path)
            return next
          })
        })
      }
    }

    document.addEventListener('keydown', handleGlobalKeyDown)
    return () => document.removeEventListener('keydown', handleGlobalKeyDown)
  }, [discardFileConfirm, unstagedFiles, onRefresh, onStatusChange])

  // Close file context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (fileMenuRef.current && !fileMenuRef.current.contains(e.target as Node)) {
        setFileContextMenu(null)
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFileContextMenu(null)
      }
    }

    if (fileContextMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [fileContextMenu])

  // Load diff when file is selected
  useEffect(() => {
    if (!selectedFile) {
      setFileDiff(null)
      return
    }

    let cancelled = false

    const loadDiff = async () => {
      setLoadingDiff(true)
      try {
        const diff = await window.conveyor.staging.getFileDiff(selectedFile.path, selectedFile.staged)
        if (!cancelled) {
          setFileDiff(diff)
        }
      } catch (_error) {
        if (!cancelled) {
          setFileDiff(null)
        }
      } finally {
        if (!cancelled) {
          setLoadingDiff(false)
        }
      }
    }

    loadDiff()

    return () => {
      cancelled = true
    }
  }, [selectedFile])

  // Clear line selection and edit state when file changes
  useEffect(() => {
    setSelectedLines(new Map())
    setLastClickedLine(null)
    setHighlightedLines(new Map())
    setIsEditing(false)
    setEditContent('')
    setDiscardLinesConfirm(false)
    setDiscardHunkConfirm(null)
  }, [selectedFile])

  // Syntax highlighting for diff lines
  useEffect(() => {
    if (!fileDiff || !selectedFile) {
      setHighlightedLines(new Map())
      return
    }

    let cancelled = false

    const highlightDiff = async () => {
      const language = getLanguageFromPath(selectedFile.path)
      if (!language) {
        // No language detected, skip highlighting
        setHighlightedLines(new Map())
        return
      }

      // Collect all lines from all hunks with a global index for lookup
      const allLines: Array<{ code: string; lineIndex: number; globalKey: number }> = []
      let globalIndex = 0

      for (const hunk of fileDiff.hunks) {
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
          // Convert back using global index as key
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
        console.warn('[StagingPanel] Syntax highlighting failed:', error)
        if (!cancelled) {
          setHighlightedLines(new Map())
        }
      }
    }

    highlightDiff()

    return () => {
      cancelled = true
    }
  }, [fileDiff, selectedFile])

  // Build a lookup for highlighted content by global line index
  const getHighlightedContent = useCallback(
    (hunkIdx: number, lineIndex: number): string | null => {
      if (!fileDiff) return null

      // Calculate global index
      let globalIndex = 0
      for (let h = 0; h < hunkIdx; h++) {
        globalIndex += fileDiff.hunks[h].lines.length
      }
      globalIndex += lineIndex

      return highlightedLines.get(globalIndex) || null
    },
    [fileDiff, highlightedLines]
  )

  // Line selection handlers
  const handleLineClick = (hunkIndex: number, lineIndex: number, shiftKey: boolean) => {
    setSelectedLines((prev) => {
      const newSelection = new Map(prev)

      if (shiftKey && lastClickedLine && lastClickedLine.hunkIndex === hunkIndex && fileDiff) {
        // Shift-click: select range (excluding context lines)
        const start = Math.min(lastClickedLine.lineIndex, lineIndex)
        const end = Math.max(lastClickedLine.lineIndex, lineIndex)
        const hunkSelection = new Set(newSelection.get(hunkIndex) || [])
        const hunk = fileDiff.hunks[hunkIndex]
        for (let i = start; i <= end; i++) {
          // Only add actionable lines (add/delete), skip context lines
          const line = hunk?.lines.find((l) => l.lineIndex === i)
          if (line && line.type !== 'context') {
            hunkSelection.add(i)
          }
        }
        newSelection.set(hunkIndex, hunkSelection)
      } else {
        // Regular click: toggle single line
        const hunkSelection = new Set(newSelection.get(hunkIndex) || [])
        if (hunkSelection.has(lineIndex)) {
          hunkSelection.delete(lineIndex)
        } else {
          hunkSelection.add(lineIndex)
        }
        if (hunkSelection.size > 0) {
          newSelection.set(hunkIndex, hunkSelection)
        } else {
          newSelection.delete(hunkIndex)
        }
      }

      return newSelection
    })
    setLastClickedLine({ hunkIndex, lineIndex })
  }

  const getSelectedLinesCount = () => {
    if (!fileDiff) return 0
    let count = 0
    for (const [hunkIndex, lineIndices] of selectedLines.entries()) {
      const hunk = fileDiff.hunks[hunkIndex]
      if (!hunk) continue
      // Only count actionable lines (add/delete), not context lines
      for (const lineIndex of lineIndices) {
        const line = hunk.lines.find((l) => l.lineIndex === lineIndex)
        if (line && line.type !== 'context') {
          count++
        }
      }
    }
    return count
  }

  const clearLineSelection = () => {
    setSelectedLines(new Map())
    setLastClickedLine(null)
  }

  // Stage selected lines
  // Process hunks in reverse order (highest index first) to avoid index drift
  const handleStageSelectedLines = async () => {
    if (!selectedFile) return

    // Sort hunk indices in descending order to prevent index drift after each operation
    const sortedHunks = Array.from(selectedLines.entries()).sort(([a], [b]) => b - a)

    for (const [hunkIndex, lineIndices] of sortedHunks) {
      const result = await window.electronAPI.stageLines(selectedFile.path, hunkIndex, Array.from(lineIndices))
      if (!result.success) {
        onStatusChange({ type: 'error', message: result.message })
        return
      }
    }

    onStatusChange({ type: 'success', message: `Staged ${getSelectedLinesCount()} line(s)` })
    clearLineSelection()
    // Reload diff and refresh
    const diff = await window.conveyor.staging.getFileDiff(selectedFile.path, selectedFile.staged)
    setFileDiff(diff)
    await onRefresh()
  }

  // Unstage selected lines
  // Process hunks in reverse order (highest index first) to avoid index drift
  const handleUnstageSelectedLines = async () => {
    if (!selectedFile) return

    // Sort hunk indices in descending order to prevent index drift after each operation
    const sortedHunks = Array.from(selectedLines.entries()).sort(([a], [b]) => b - a)

    for (const [hunkIndex, lineIndices] of sortedHunks) {
      const result = await window.electronAPI.unstageLines(selectedFile.path, hunkIndex, Array.from(lineIndices))
      if (!result.success) {
        onStatusChange({ type: 'error', message: result.message })
        return
      }
    }

    onStatusChange({ type: 'success', message: `Unstaged ${getSelectedLinesCount()} line(s)` })
    clearLineSelection()
    const diff = await window.conveyor.staging.getFileDiff(selectedFile.path, selectedFile.staged)
    setFileDiff(diff)
    await onRefresh()
  }

  // Discard selected lines
  const [discardLinesConfirm, setDiscardLinesConfirm] = useState(false)

  // Process hunks in reverse order (highest index first) to avoid index drift
  const handleDiscardSelectedLines = async () => {
    if (!selectedFile) return

    // Require confirmation
    if (!discardLinesConfirm) {
      setDiscardLinesConfirm(true)
      setTimeout(() => setDiscardLinesConfirm(false), 3000)
      return
    }

    setDiscardLinesConfirm(false)

    // Sort hunk indices in descending order to prevent index drift after each operation
    const sortedHunks = Array.from(selectedLines.entries()).sort(([a], [b]) => b - a)

    for (const [hunkIndex, lineIndices] of sortedHunks) {
      const result = await window.electronAPI.discardLines(selectedFile.path, hunkIndex, Array.from(lineIndices))
      if (!result.success) {
        onStatusChange({ type: 'error', message: result.message })
        return
      }
    }

    onStatusChange({ type: 'success', message: `Discarded ${getSelectedLinesCount()} line(s)` })
    clearLineSelection()
    const diff = await window.conveyor.staging.getFileDiff(selectedFile.path, selectedFile.staged)
    setFileDiff(diff)
    await onRefresh()
  }

  // Stage a file (silently, no toast on success) - with optimistic update
  const handleStageFile = async (file: UncommittedFile) => {
    // Calculate next file to select before staging (file will be removed from unstaged list)
    const currentIndex = unstagedFiles.findIndex(f => f.path === file.path)
    let nextFile: UncommittedFile | null = null
    
    if (unstagedFiles.length > 1) {
      if (currentIndex < unstagedFiles.length - 1) {
        // Next file down
        nextFile = unstagedFiles[currentIndex + 1]
      } else if (currentIndex > 0) {
        // Previous file up
        nextFile = unstagedFiles[currentIndex - 1]
      } else {
        // First file (fallback)
        nextFile = unstagedFiles[0] === file ? unstagedFiles[1] : unstagedFiles[0]
      }
    }
    
    // Optimistic update: immediately hide file and move selection
    setPendingStage(prev => new Set(prev).add(file.path))
    setSelectedFile(nextFile)
    
    const result = await window.conveyor.staging.stageFile(file.path)
    
    if (result.success) {
      await onRefresh()
    } else {
      onStatusChange({ type: 'error', message: result.message })
    }
    
    // Clear pending state AFTER refresh so file doesn't flicker back
    setPendingStage(prev => {
      const next = new Set(prev)
      next.delete(file.path)
      return next
    })
  }

  // Keyboard navigation for unstaged files list
  const handleUnstagedKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (unstagedFiles.length === 0) return
    
    const currentIndex = selectedFile && !selectedFile.staged 
      ? unstagedFiles.findIndex(f => f.path === selectedFile.path)
      : -1

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const nextIndex = currentIndex < unstagedFiles.length - 1 ? currentIndex + 1 : 0
      setSelectedFile(unstagedFiles[nextIndex])
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : unstagedFiles.length - 1
      setSelectedFile(unstagedFiles[prevIndex])
    } else if (e.key === ' ' && selectedFile && !selectedFile.staged) {
      e.preventDefault()
      handleStageFile(selectedFile)
    } else if (e.key === 'x' && selectedFile && !selectedFile.staged) {
      // Start discard confirmation (same as clicking the X button once)
      e.preventDefault()
      if (discardFileConfirm !== selectedFile.path) {
        setDiscardFileConfirm(selectedFile.path)
        // Auto-clear confirmation after 3 seconds
        setTimeout(() => setDiscardFileConfirm(null), 3000)
      }
    } else if (e.key === 'Enter' && selectedFile && !selectedFile.staged && discardFileConfirm === selectedFile.path) {
      // Confirm discard if in confirm state - with optimistic update
      e.preventDefault()
      const fileToDiscard = selectedFile
      const nextFile = getNextFileAfterRemoval(fileToDiscard)
      
      // Optimistic update: immediately hide file and move selection
      setDiscardFileConfirm(null)
      setPendingDiscard(prev => new Set(prev).add(fileToDiscard.path))
      setSelectedFile(nextFile)
      
      window.conveyor.staging.discardFileChanges(fileToDiscard.path).then(async (result) => {
        if (result.success) {
          await onRefresh()
        } else {
          onStatusChange({ type: 'error', message: result.message })
        }
        
        // Clear pending state AFTER refresh so file doesn't flicker back
        setPendingDiscard(prev => {
          const next = new Set(prev)
          next.delete(fileToDiscard.path)
          return next
        })
      })
    }
  }, [unstagedFiles, selectedFile, handleStageFile, discardFileConfirm, onRefresh, onStatusChange])

  // Unstage a file (silently, no toast on success) - with optimistic update
  const handleUnstageFile = useCallback(async (file: UncommittedFile) => {
    // Calculate next file before unstaging
    const currentIndex = stagedFiles.findIndex(f => f.path === file.path)
    let nextFile: UncommittedFile | null = null
    
    if (stagedFiles.length > 1) {
      if (currentIndex < stagedFiles.length - 1) {
        // Next file down
        nextFile = stagedFiles[currentIndex + 1]
      } else if (currentIndex > 0) {
        // Previous file up
        nextFile = stagedFiles[currentIndex - 1]
      } else {
        // First file (fallback)
        nextFile = stagedFiles[0] === file ? stagedFiles[1] : stagedFiles[0]
      }
    }
    
    // Optimistic update: immediately hide file and move selection
    setPendingUnstage(prev => new Set(prev).add(file.path))
    setSelectedFile(nextFile)
    
    const result = await window.conveyor.staging.unstageFile(file.path)
    
    if (result.success) {
      await onRefresh()
    } else {
      onStatusChange({ type: 'error', message: result.message })
    }
    
    // Clear pending state AFTER refresh so file doesn't flicker back
    setPendingUnstage(prev => {
      const next = new Set(prev)
      next.delete(file.path)
      return next
    })
  }, [stagedFiles, onRefresh, onStatusChange])

  // Keyboard navigation for staged files list
  const handleStagedKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (stagedFiles.length === 0) return
    
    const currentIndex = selectedFile?.staged 
      ? stagedFiles.findIndex(f => f.path === selectedFile.path)
      : -1

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const nextIndex = currentIndex < stagedFiles.length - 1 ? currentIndex + 1 : 0
      setSelectedFile(stagedFiles[nextIndex])
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : stagedFiles.length - 1
      setSelectedFile(stagedFiles[prevIndex])
    } else if ((e.key === ' ' || e.key === 'Enter') && selectedFile?.staged) {
      // Space or Enter to unstage
      e.preventDefault()
      handleUnstageFile(selectedFile)
    }
  }, [stagedFiles, selectedFile, handleUnstageFile])

  // Stage all files
  // Stage all files (silently, no toast on success)
  const handleStageAll = async () => {
    const result = await window.conveyor.staging.stageAll()
    if (result.success) {
      setSelectedFile(null)
      await onRefresh()
    } else {
      onStatusChange({ type: 'error', message: result.message })
    }
  }

  // Unstage all files (silently, no toast on success)
  const handleUnstageAll = async () => {
    const result = await window.conveyor.staging.unstageAll()
    if (result.success) {
      setSelectedFile(null)
      await onRefresh()
    } else {
      onStatusChange({ type: 'error', message: result.message })
    }
  }

  // Discard changes in a file
  const handleDiscardFile = async (file: UncommittedFile) => {
    setFileContextMenu(null)
    const result = await window.conveyor.staging.discardFileChanges(file.path)
    if (result.success) {
      onStatusChange({ type: 'success', message: result.message })
      if (selectedFile?.path === file.path) {
        setSelectedFile(null)
      }
      await onRefresh()
    } else {
      onStatusChange({ type: 'error', message: result.message })
    }
  }

  // Helper to calculate next file after removing one from unstaged list
  const getNextFileAfterRemoval = (file: UncommittedFile): UncommittedFile | null => {
    const currentIndex = unstagedFiles.findIndex(f => f.path === file.path)
    if (unstagedFiles.length <= 1) return null
    
    if (currentIndex < unstagedFiles.length - 1) {
      // Next file down
      return unstagedFiles[currentIndex + 1]
    } else if (currentIndex > 0) {
      // Previous file up
      return unstagedFiles[currentIndex - 1]
    }
    // First file (fallback)
    return unstagedFiles[0] === file ? unstagedFiles[1] : unstagedFiles[0]
  }

  // Discard changes in a file with inline confirmation - with optimistic update
  const handleDiscardFileInline = async (file: UncommittedFile) => {
    // Show confirmation first
    if (discardFileConfirm !== file.path) {
      setDiscardFileConfirm(file.path)
      // Auto-clear confirmation after 3 seconds
      setTimeout(() => setDiscardFileConfirm(null), 3000)
      return
    }

    // Calculate next file before discarding
    const nextFile = getNextFileAfterRemoval(file)

    // Optimistic update: immediately hide file and move selection
    setDiscardFileConfirm(null)
    setPendingDiscard(prev => new Set(prev).add(file.path))
    setSelectedFile(nextFile)

    const result = await window.conveyor.staging.discardFileChanges(file.path)
    
    if (result.success) {
      await onRefresh()
    } else {
      onStatusChange({ type: 'error', message: result.message })
    }
    
    // Clear pending state AFTER refresh so file doesn't flicker back
    setPendingDiscard(prev => {
      const next = new Set(prev)
      next.delete(file.path)
      return next
    })
  }

  // Discard all unstaged changes with inline confirmation
  const handleDiscardAll = async () => {
    // Show confirmation first
    if (!discardAllConfirm) {
      setDiscardAllConfirm(true)
      // Auto-clear confirmation after 3 seconds
      setTimeout(() => setDiscardAllConfirm(false), 3000)
      return
    }

    // User confirmed - proceed with discard all
    setDiscardAllConfirm(false)
    
    // Discard all unstaged files
    let hasError = false
    for (const file of unstagedFiles) {
      const result = await window.conveyor.staging.discardFileChanges(file.path)
      if (!result.success) {
        hasError = true
        onStatusChange({ type: 'error', message: result.message })
        break
      }
    }
    
    if (!hasError) {
      onStatusChange({ type: 'success', message: `Discarded ${unstagedFiles.length} file(s)` })
      setSelectedFile(null)
    }
    await onRefresh()
  }

  // Start editing a file
  const handleStartEdit = async () => {
    if (!selectedFile) return
    
    setLoadingEdit(true)
    try {
      const content = await window.conveyor.staging.getFileContent(selectedFile.path)
      if (content !== null) {
        setEditContent(content)
        setIsEditing(true)
      } else {
        onStatusChange({ type: 'error', message: 'Could not load file content' })
      }
    } catch (_error) {
      onStatusChange({ type: 'error', message: 'Failed to load file for editing' })
    } finally {
      setLoadingEdit(false)
    }
  }

  // Cancel editing
  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditContent('')
  }

  // Save edited file
  const handleSaveEdit = async () => {
    if (!selectedFile) return
    
    setSavingEdit(true)
    try {
      const result = await window.conveyor.staging.saveFileContent(selectedFile.path, editContent)
      if (result.success) {
        onStatusChange({ type: 'success', message: result.message })
        setIsEditing(false)
        setEditContent('')
        // Refresh diff to show updated changes
        const diff = await window.conveyor.staging.getFileDiff(selectedFile.path, selectedFile.staged)
        setFileDiff(diff)
        await onRefresh()
      } else {
        onStatusChange({ type: 'error', message: result.message })
      }
    } catch (_error) {
      onStatusChange({ type: 'error', message: 'Failed to save file' })
    } finally {
      setSavingEdit(false)
    }
  }

  // Stage a single hunk
  const handleStageHunk = async (hunkIndex: number) => {
    if (!selectedFile) return
    const result = await window.electronAPI.stageHunk(selectedFile.path, hunkIndex)
    if (result.success) {
      onStatusChange({ type: 'success', message: result.message })
      // Clear stale line selections before reloading diff
      clearLineSelection()
      // Reload diff and refresh file list
      const diff = await window.conveyor.staging.getFileDiff(selectedFile.path, selectedFile.staged)
      setFileDiff(diff)
      await onRefresh()
    } else {
      onStatusChange({ type: 'error', message: result.message })
    }
  }

  // Unstage a single hunk
  const handleUnstageHunk = async (hunkIndex: number) => {
    if (!selectedFile) return
    const result = await window.electronAPI.unstageHunk(selectedFile.path, hunkIndex)
    if (result.success) {
      onStatusChange({ type: 'success', message: result.message })
      // Clear stale line selections before reloading diff
      clearLineSelection()
      // Reload diff and refresh file list
      const diff = await window.conveyor.staging.getFileDiff(selectedFile.path, selectedFile.staged)
      setFileDiff(diff)
      await onRefresh()
    } else {
      onStatusChange({ type: 'error', message: result.message })
    }
  }

  // Discard a single hunk
  const [discardHunkConfirm, setDiscardHunkConfirm] = useState<number | null>(null)

  const handleDiscardHunk = async (hunkIndex: number) => {
    if (!selectedFile) return

    // Show confirmation first
    if (discardHunkConfirm !== hunkIndex) {
      setDiscardHunkConfirm(hunkIndex)
      // Auto-clear confirmation after 3 seconds
      setTimeout(() => setDiscardHunkConfirm(null), 3000)
      return
    }

    // User confirmed - proceed with discard
    setDiscardHunkConfirm(null)
    const result = await window.electronAPI.discardHunk(selectedFile.path, hunkIndex)
    if (result.success) {
      onStatusChange({ type: 'success', message: result.message })
      // Clear stale line selections before reloading diff
      clearLineSelection()
      // Reload diff and refresh file list
      const diff = await window.conveyor.staging.getFileDiff(selectedFile.path, selectedFile.staged)
      setFileDiff(diff)
      await onRefresh()
    } else {
      onStatusChange({ type: 'error', message: result.message })
    }
  }

  // Handle right-click on unstaged file
  const handleFileContextMenu = (e: React.MouseEvent, file: UncommittedFile) => {
    e.preventDefault()
    setFileContextMenu({ x: e.clientX, y: e.clientY, file })
  }

  // Get the effective folder name (custom or preset)
  const effectiveFolder = branchFolder === 'custom' ? customFolder.trim() : branchFolder
  const fullBranchName = createNewBranch && branchName.trim() ? `${effectiveFolder}/${branchName.trim()}` : null

  // Commit with optional force to skip behind-check
  const handleCommit = async (force: boolean = false) => {
    if (!commitMessage.trim() || stagedFiles.length === 0) return

    setIsCommitting(true)
    try {
      // Plugin hook: allow plugins to transform commit message
      const finalCommitMessage = await beforeCommit(commitMessage.trim())

      // If creating a new branch, do that first
      if (fullBranchName) {
        onStatusChange({ type: 'info', message: `Creating branch ${fullBranchName}...` })
        const branchResult = await window.conveyor.branch.createBranch(fullBranchName, true)
        if (!branchResult.success) {
          onStatusChange({ type: 'error', message: `Failed to create branch: ${branchResult.message}` })
          setIsCommitting(false)
          return
        }
      }

      const result = await window.conveyor.commit.commitChanges(
        finalCommitMessage,
        commitDescription.trim() || undefined,
        force
      )
      if (result.success) {
        // Plugin hook: notify plugins of successful commit
        await afterCommit(result.hash || 'HEAD')

        const targetBranch = fullBranchName || currentBranch
        let finalMessage = fullBranchName ? `Created ${fullBranchName} and committed` : result.message

        // If push after commit is enabled, push the branch
        if (pushAfterCommit && targetBranch) {
          onStatusChange({ type: 'info', message: 'Pushing to remote...' })
          const pushResult = await window.conveyor.branch.pushBranch(targetBranch, true)
          if (pushResult.success) {
            finalMessage = `Committed and pushed to ${targetBranch}`

            // If create PR is enabled, create the PR
            if (createPR) {
              onStatusChange({ type: 'info', message: 'Creating pull request...' })
              const prTitleToUse = prTitle.trim() || generatePRTitle(targetBranch)
              const prResult = await window.conveyor.pr.createPullRequest({
                title: prTitleToUse,
                body: prBody.trim() || undefined,
                headBranch: targetBranch,
                draft: prDraft,
                web: false,
              })
              if (prResult.success) {
                finalMessage = `Committed, pushed, and created PR for ${targetBranch}`
              } else {
                // PR creation failed but commit+push succeeded
                onStatusChange({
                  type: 'error',
                  message: `Committed and pushed, but PR creation failed: ${prResult.message}`,
                })
                // Reset form state anyway since commit+push worked
                setCommitMessage('')
                setCommitDescription('')
                setBehindPrompt(null)
                if (fullBranchName) {
                  setCreateNewBranch(false)
                  setBranchName('')
                }
                setCreatePR(false)
                setPrTitle('')
                setPrBody('')
                setPrDraft(false)
                await onRefresh()
                return
              }
            }
          } else {
            // Commit succeeded but push failed
            onStatusChange({ type: 'error', message: `Committed, but push failed: ${pushResult.message}` })
            setCommitMessage('')
            setCommitDescription('')
            setBehindPrompt(null)
            if (fullBranchName) {
              setCreateNewBranch(false)
              setBranchName('')
            }
            await onRefresh()
            return
          }
        }

        onStatusChange({ type: 'success', message: finalMessage })
        setCommitMessage('')
        setCommitDescription('')
        setBehindPrompt(null)
        // Reset branch creation fields
        if (fullBranchName) {
          setCreateNewBranch(false)
          setBranchName('')
        }
        // Reset PR creation fields
        if (createPR) {
          setCreatePR(false)
          setPrTitle('')
          setPrBody('')
          setPrDraft(false)
        }
        await onRefresh()
      } else if (result.behindCount && result.behindCount > 0) {
        // Origin has moved ahead - prompt user
        setBehindPrompt({ behindCount: result.behindCount })
      } else {
        onStatusChange({ type: 'error', message: result.message })
      }
    } catch (error) {
      onStatusChange({ type: 'error', message: (error as Error).message })
    } finally {
      setIsCommitting(false)
    }
  }

  // Pull then commit (aborts if conflicts arise)
  const handlePullThenCommit = async () => {
    setIsPulling(true)
    onStatusChange({ type: 'info', message: 'Pulling latest changes...' })

    try {
      const pullResult = await window.conveyor.commit.pullCurrentBranch()
      if (pullResult.success && !pullResult.hadConflicts) {
        onStatusChange({ type: 'success', message: pullResult.message })
        setBehindPrompt(null)
        await onRefresh()
        // Now commit with force (we just pulled)
        await handleCommit(true)
      } else if (pullResult.hadConflicts) {
        // Pull succeeded but restoring local changes caused conflicts - don't commit!
        onStatusChange({
          type: 'error',
          message: 'Pull & Commit aborted: conflicts detected. Please resolve them before committing.',
        })
        setBehindPrompt(null)
        await onRefresh()
      } else {
        onStatusChange({ type: 'error', message: pullResult.message })
        setBehindPrompt(null)
      }
    } catch (error) {
      onStatusChange({ type: 'error', message: (error as Error).message })
      setBehindPrompt(null)
    } finally {
      setIsPulling(false)
    }
  }

  // Commit anyway even though behind
  const handleCommitAnyway = async () => {
    setBehindPrompt(null)
    await handleCommit(true)
  }

  // Auto-generate PR title from branch name
  const generatePRTitle = (branch: string) => {
    return branch
      .replace(/^(feature|bugfix|hotfix)\//, '')
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
  }

  // File status helpers
  const getFileStatusIcon = (status: UncommittedFile['status']) => {
    switch (status) {
      case 'added':
        return '+'
      case 'deleted':
        return '−'
      case 'modified':
        return '●'
      case 'renamed':
        return '→'
      case 'untracked':
        return '?'
      default:
        return '?'
    }
  }

  const getFileStatusClass = (status: UncommittedFile['status']) => {
    switch (status) {
      case 'added':
        return 'file-added'
      case 'deleted':
        return 'file-deleted'
      case 'modified':
        return 'file-modified'
      case 'renamed':
        return 'file-renamed'
      case 'untracked':
        return 'file-untracked'
      default:
        return ''
    }
  }

  return (
    <div className="staging-panel">
      {/* Header */}
      <div className="staging-header">
        <div className="staging-title">
          <span className="detail-type-badge uncommitted">Changes</span>
          <span className="staging-stats">
            <span className="diff-additions">+{workingStatus.additions}</span>
            <span className="diff-deletions">-{workingStatus.deletions}</span>
          </span>
        </div>
        {behindMain && behindMain.behind > 0 && (
          <div className="behind-main-indicator">
            <span className="behind-main-icon">↓</span>
            <span className="behind-main-text">
              {behindMain.behind} behind {behindMain.baseBranch.replace('origin/', '')}
            </span>
          </div>
        )}
      </div>

      {/* File Lists */}
      <div className="staging-files">
        {/* Staged Section */}
        <div className="staging-section">
          <div className="staging-section-header">
            <span className="staging-section-title">Staged</span>
            <span className="staging-section-count">{stagedFiles.length}</span>
            {stagedFiles.length > 0 && (
              <button className="staging-action-btn" onClick={handleUnstageAll} title="Unstage all">
                Unstage All ↓
              </button>
            )}
          </div>
          {stagedFiles.length > 0 ? (
            <ul 
              ref={stagedListRef}
              className="staging-file-list"
              tabIndex={0}
              onKeyDown={handleStagedKeyDown}
            >
              {stagedFiles.map((file) => (
                <li
                  key={file.path}
                  className={`staging-file-item ${getFileStatusClass(file.status)} ${selectedFile?.path === file.path && selectedFile.staged ? 'selected' : ''}`}
                  onClick={() => setSelectedFile(file)}
                >
                  <span className="file-status-icon">{getFileStatusIcon(file.status)}</span>
                  <span className="file-path" title={file.path}>
                    {file.path}
                  </span>
                  <button
                    className="file-action-btn unstage"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleUnstageFile(file)
                    }}
                    title="Unstage file"
                  >
                    ✓
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="staging-empty">No staged changes</div>
          )}
        </div>

        {/* Unstaged Section */}
        <div className="staging-section">
          <div className="staging-section-header">
            <span className="staging-section-title">Unstaged</span>
            <span className="staging-section-count">{unstagedFiles.length}</span>
            {unstagedFiles.length > 0 && (
              <div className="staging-section-actions">
                <button 
                  className={`staging-action-btn discard-all ${discardAllConfirm ? 'confirm' : ''}`} 
                  onClick={handleDiscardAll} 
                  title={discardAllConfirm ? 'Click again to confirm' : 'Discard all'}
                >
                  {discardAllConfirm ? 'Confirm?' : '✕ Discard All'}
                </button>
                <button className="staging-action-btn" onClick={handleStageAll} title="Stage all">
                  Stage All ↑
                </button>
              </div>
            )}
          </div>
          {unstagedFiles.length > 0 ? (
            <ul 
              ref={unstagedListRef}
              className="staging-file-list"
              tabIndex={0}
              onKeyDown={handleUnstagedKeyDown}
            >
              {unstagedFiles.map((file) => (
                <li
                  key={file.path}
                  className={`staging-file-item ${getFileStatusClass(file.status)} ${selectedFile?.path === file.path && !selectedFile.staged ? 'selected' : ''}`}
                  onClick={() => setSelectedFile(file)}
                  onContextMenu={(e) => handleFileContextMenu(e, file)}
                >
                  <span className="file-status-icon">{getFileStatusIcon(file.status)}</span>
                  <span className="file-path" title={file.path}>
                    {file.path}
                  </span>
                  <div className="file-action-btns">
                    <button
                      className={`file-action-btn discard ${discardFileConfirm === file.path ? 'confirm' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDiscardFileInline(file)
                      }}
                      title={discardFileConfirm === file.path ? 'Click again to confirm' : 'Discard changes'}
                    >
                      {discardFileConfirm === file.path ? '?' : '✕'}
                    </button>
                    <button
                      className="file-action-btn stage"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleStageFile(file)
                      }}
                      title="Stage file"
                    >
                      ✓
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="staging-empty">No unstaged changes</div>
          )}
        </div>
      </div>

      {/* File Context Menu */}
      {fileContextMenu && (
        <div ref={fileMenuRef} className="context-menu" style={{ left: fileContextMenu.x, top: fileContextMenu.y }}>
          <button
            className="context-menu-item"
            onClick={() => {
              handleStageFile(fileContextMenu.file)
              setFileContextMenu(null)
            }}
          >
            Stage
          </button>
          <button className="context-menu-item" onClick={() => handleDiscardFile(fileContextMenu.file)}>
            Discard Changes
          </button>
        </div>
      )}

      {/* Diff Preview */}
      {selectedFile && (
        <div className="staging-diff">
          <div className="staging-diff-header">
            <span className="staging-diff-title">{selectedFile.path}</span>
            <div className="staging-diff-header-actions">
              {fileDiff && !isEditing && (
                <span className="staging-diff-stats">
                  <span className="diff-additions">+{fileDiff.additions}</span>
                  <span className="diff-deletions">-{fileDiff.deletions}</span>
                </span>
              )}
              {!selectedFile.staged && selectedFile.status !== 'deleted' && !isEditing && (
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={handleStartEdit}
                  disabled={loadingEdit || loadingDiff}
                  title="Edit file content"
                >
                  {loadingEdit ? 'Loading...' : 'Edit'}
                </button>
              )}
            </div>
          </div>

          {/* Edit Mode */}
          {isEditing ? (
            <div className="staging-edit-mode">
              <textarea
                className="staging-edit-textarea"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                spellCheck={false}
              />
              <div className="staging-edit-actions">
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleSaveEdit}
                  disabled={savingEdit}
                >
                  {savingEdit ? 'Saving...' : 'Save'}
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handleCancelEdit}
                  disabled={savingEdit}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
          {/* Line Selection Action Bar */}
          {getSelectedLinesCount() > 0 && (
            <div className="line-selection-bar">
              <span className="line-selection-count">{getSelectedLinesCount()} line(s) selected</span>
              <div className="line-selection-actions">
                {selectedFile?.staged ? (
                  <button className="line-action-btn unstage" onClick={handleUnstageSelectedLines}>
                    Unstage Selected
                  </button>
                ) : (
                  <>
                    <button className="line-action-btn stage" onClick={handleStageSelectedLines}>
                      Stage Selected
                    </button>
                    <button
                      className={`line-action-btn discard ${discardLinesConfirm ? 'confirm' : ''}`}
                      onClick={handleDiscardSelectedLines}
                    >
                      {discardLinesConfirm ? 'Confirm Discard?' : 'Discard Selected'}
                    </button>
                  </>
                )}
                <button className="line-action-btn clear" onClick={clearLineSelection}>
                  Clear
                </button>
              </div>
            </div>
          )}
          <div className="staging-diff-content">
            {loadingDiff ? (
              <div className="staging-diff-loading">Loading diff...</div>
            ) : fileDiff?.isBinary ? (
              <div className="staging-diff-binary">Binary file</div>
            ) : fileDiff?.hunks.length === 0 ? (
              <div className="staging-diff-empty">No changes to display</div>
            ) : fileDiff ? (
              fileDiff.hunks.map((hunk, hunkIdx) => (
                <div key={hunkIdx} className="staging-hunk">
                  <div className="staging-hunk-header">
                    <span className="staging-hunk-header-text">{hunk.header}</span>
                    <div className="staging-hunk-actions">
                      {/* Show stage/unstage button based on whether file is staged */}
                      {selectedFile?.staged ? (
                        <button
                          className="hunk-action-btn unstage"
                          onClick={() => handleUnstageHunk(hunkIdx)}
                          title="Unstage this hunk"
                        >
                          Unstage
                        </button>
                      ) : (
                        <>
                          <button
                            className="hunk-action-btn stage"
                            onClick={() => handleStageHunk(hunkIdx)}
                            title="Stage this hunk"
                          >
                            Stage
                          </button>
                          <button
                            className={`hunk-action-btn discard ${discardHunkConfirm === hunkIdx ? 'confirm' : ''}`}
                            onClick={() => handleDiscardHunk(hunkIdx)}
                            title={discardHunkConfirm === hunkIdx ? 'Click again to confirm' : 'Discard this hunk'}
                          >
                            {discardHunkConfirm === hunkIdx ? 'Confirm?' : 'Discard'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="staging-hunk-lines">
                    {hunk.lines.map((line) => {
                      const isSelectable = line.type !== 'context'
                      const isSelected = selectedLines.get(hunkIdx)?.has(line.lineIndex) || false
                      const highlightedHtml = getHighlightedContent(hunkIdx, line.lineIndex)
                      return (
                        <div
                          key={line.lineIndex}
                          className={`staging-diff-line diff-line-${line.type} ${isSelected ? 'selected' : ''} ${isSelectable ? 'selectable' : ''}`}
                          onClick={
                            isSelectable
                              ? (e) => handleLineClick(hunkIdx, line.lineIndex, e.shiftKey)
                              : undefined
                          }
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
              ))
            ) : (
              <div className="staging-diff-empty">Select a file to view diff</div>
            )}
          </div>
          </>
          )}
        </div>
      )}

      {/* Commit Form */}
      <div className="staging-commit">
        <input
          type="text"
          className="commit-summary-input"
          placeholder="Commit message (required)"
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          maxLength={72}
        />
        <textarea
          className="commit-description-input"
          placeholder="Description (optional)"
          value={commitDescription}
          onChange={(e) => setCommitDescription(e.target.value)}
          rows={3}
        />
        {/* New Branch Option */}
        <div className="commit-options">
          <label className="commit-option-checkbox">
            <input
              type="checkbox"
              checked={createNewBranch}
              onChange={(e) => setCreateNewBranch(e.target.checked)}
            />
            <span>Create new branch</span>
          </label>
        </div>
        {createNewBranch && (
          <div className="new-branch-fields">
            <div className="branch-folder-row">
              <select
                className="branch-folder-select"
                value={branchFolder}
                onChange={(e) => setBranchFolder(e.target.value)}
              >
                <option value="feature">feature/</option>
                <option value="bugfix">bugfix/</option>
                <option value="hotfix">hotfix/</option>
                <option value="custom">custom...</option>
              </select>
              {branchFolder === 'custom' && (
                <input
                  type="text"
                  className="branch-custom-folder"
                  placeholder="folder"
                  value={customFolder}
                  onChange={(e) => setCustomFolder(e.target.value.replace(/[^a-zA-Z0-9-_]/g, ''))}
                />
              )}
              <span className="branch-separator">/</span>
              <input
                type="text"
                className="branch-name-input"
                placeholder="branch-name"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value.replace(/[^a-zA-Z0-9-_]/g, ''))}
              />
            </div>
            {fullBranchName && (
              <div className="branch-preview">
                → <code>{fullBranchName}</code>
              </div>
            )}
          </div>
        )}
        <div className="commit-options">
          <label className="commit-option-checkbox">
            <input type="checkbox" checked={pushAfterCommit} onChange={(e) => setPushAfterCommit(e.target.checked)} />
            <span>
              Push to <code>{fullBranchName || currentBranch || 'remote'}</code> after commit
            </span>
          </label>
        </div>

        {/* Create PR Option - only show when pushing and not on main/master */}
        {pushAfterCommit && !['main', 'master'].includes(fullBranchName || currentBranch) && (
          <>
            <div className="commit-options">
              <label className="commit-option-checkbox">
                <input type="checkbox" checked={createPR} onChange={(e) => setCreatePR(e.target.checked)} />
                <span>Create Pull Request after push</span>
              </label>
            </div>
            {createPR && (
              <div className="pr-inline-fields">
                <input
                  type="text"
                  className="pr-inline-title"
                  value={prTitle}
                  onChange={(e) => setPrTitle(e.target.value)}
                  placeholder={`PR title (default: ${generatePRTitle(fullBranchName || currentBranch)})`}
                />
                <textarea
                  className="pr-inline-body"
                  value={prBody}
                  onChange={(e) => setPrBody(e.target.value)}
                  placeholder="Description (optional)"
                  rows={2}
                />
                <label className="commit-option-checkbox pr-draft-checkbox">
                  <input type="checkbox" checked={prDraft} onChange={(e) => setPrDraft(e.target.checked)} />
                  <span>Create as draft</span>
                </label>
              </div>
            )}
          </>
        )}

        {/* Behind Origin Prompt */}
        {behindPrompt && (
          <div className="behind-prompt">
            <div className="behind-prompt-message">
              ⚠️ Origin has {behindPrompt.behindCount} new commit
              {behindPrompt.behindCount > 1 ? 's' : ''}
            </div>
            <div className="behind-prompt-actions">
              <button className="btn btn-primary" onClick={handlePullThenCommit} disabled={isPulling || isCommitting}>
                {isPulling ? 'Pulling...' : 'Pull & Commit'}
              </button>
              <button className="btn btn-secondary" onClick={handleCommitAnyway} disabled={isPulling || isCommitting}>
                Commit Anyway
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => setBehindPrompt(null)}
                disabled={isPulling || isCommitting}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {!behindPrompt && (
          <button
            className="btn btn-primary commit-btn"
            onClick={() => handleCommit()}
            disabled={
              !commitMessage.trim() ||
              stagedFiles.length === 0 ||
              isCommitting ||
              (createNewBranch && !branchName.trim()) ||
              (createNewBranch && branchFolder === 'custom' && !customFolder.trim())
            }
          >
            {isCommitting
              ? createPR
                ? 'Creating PR...'
                : fullBranchName
                  ? 'Creating branch...'
                  : pushAfterCommit
                    ? 'Committing & Pushing...'
                    : 'Committing...'
              : fullBranchName
                ? pushAfterCommit
                  ? createPR
                    ? 'Branch → Commit → Push → PR'
                    : 'Create Branch & Commit & Push'
                  : 'Create Branch & Commit'
                : pushAfterCommit
                  ? createPR
                    ? 'Commit → Push → Create PR'
                    : `Commit & Push ${stagedFiles.length} file${stagedFiles.length !== 1 ? 's' : ''}`
                  : `Commit ${stagedFiles.length} file${stagedFiles.length !== 1 ? 's' : ''}`}
          </button>
        )}
      </div>
    </div>
  )
}
