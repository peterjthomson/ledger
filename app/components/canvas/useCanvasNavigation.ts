/**
 * useCanvasNavigation - Hook for canvas navigation logic
 *
 * Provides:
 * - Double-click to navigate to editor
 * - Automatic canvas switching if no editor slot
 * - Keyboard shortcuts for back/forward
 */

import { useEffect, useCallback } from 'react'
import { useCanvas } from './CanvasContext'
import type { EditorPanelType } from '../../types/app-types'
import type { PullRequest, Branch, Worktree, StashEntry, Commit } from '../../types/electron'

/**
 * Map item types to their editor panel type
 */
function getEditorPanelType(
  itemType: 'pr' | 'branch' | 'remote' | 'worktree' | 'stash' | 'commit'
): EditorPanelType {
  switch (itemType) {
    case 'pr':
      return 'pr-detail'
    case 'branch':
      return 'branch-detail'
    case 'remote':
      return 'remote-detail'
    case 'worktree':
      return 'worktree-detail'
    case 'stash':
      return 'stash-detail'
    case 'commit':
      return 'commit-detail'
  }
}

export interface UseCanvasNavigationOptions {
  /** Enable keyboard shortcuts */
  enableKeyboardShortcuts?: boolean
}

export interface CanvasNavigationResult {
  /** Navigate to an item in the editor */
  openInEditor: (
    itemType: 'pr' | 'branch' | 'remote' | 'worktree' | 'stash' | 'commit',
    item: PullRequest | Branch | Worktree | StashEntry | Commit
  ) => void

  /** Navigate to staging panel */
  openStaging: () => void

  /** Navigate to create worktree panel */
  openCreateWorktree: () => void

  /** Navigate to create branch panel */
  openCreateBranch: () => void

  /** Navigate to settings */
  openSettings: () => void

  /** Go back in editor history */
  goBack: () => void

  /** Go forward in editor history */
  goForward: () => void

  /** Can navigate back */
  canGoBack: boolean

  /** Can navigate forward */
  canGoForward: boolean
}

export function useCanvasNavigation(
  options: UseCanvasNavigationOptions = {}
): CanvasNavigationResult {
  const { enableKeyboardShortcuts = true } = options

  const {
    navigateToEditor,
    goBack,
    goForward,
    canGoBack,
    canGoForward,
    hasEditorSlot,
    setActiveCanvas,
    findCanvasWithEditor,
    activeCanvas,
  } = useCanvas()

  /**
   * Navigate to an item, switching canvas if needed
   */
  const openInEditor = useCallback(
    (
      itemType: 'pr' | 'branch' | 'remote' | 'worktree' | 'stash' | 'commit',
      item: PullRequest | Branch | Worktree | StashEntry | Commit
    ) => {
      const panelType = getEditorPanelType(itemType)

      // If current canvas has no editor slot, switch to one that does
      if (!hasEditorSlot()) {
        const canvasWithEditor = findCanvasWithEditor()
        if (canvasWithEditor) {
          setActiveCanvas(canvasWithEditor.id)
        }
      }

      // Navigate to the item
      navigateToEditor(panelType, item)
    },
    [hasEditorSlot, findCanvasWithEditor, setActiveCanvas, navigateToEditor]
  )

  /**
   * Open staging panel
   */
  const openStaging = useCallback(() => {
    if (!hasEditorSlot()) {
      const canvasWithEditor = findCanvasWithEditor()
      if (canvasWithEditor) {
        setActiveCanvas(canvasWithEditor.id)
      }
    }
    navigateToEditor('staging')
  }, [hasEditorSlot, findCanvasWithEditor, setActiveCanvas, navigateToEditor])

  /**
   * Open create worktree panel
   */
  const openCreateWorktree = useCallback(() => {
    if (!hasEditorSlot()) {
      const canvasWithEditor = findCanvasWithEditor()
      if (canvasWithEditor) {
        setActiveCanvas(canvasWithEditor.id)
      }
    }
    navigateToEditor('create-worktree')
  }, [hasEditorSlot, findCanvasWithEditor, setActiveCanvas, navigateToEditor])

  /**
   * Open create branch panel
   */
  const openCreateBranch = useCallback(() => {
    if (!hasEditorSlot()) {
      const canvasWithEditor = findCanvasWithEditor()
      if (canvasWithEditor) {
        setActiveCanvas(canvasWithEditor.id)
      }
    }
    navigateToEditor('create-branch')
  }, [hasEditorSlot, findCanvasWithEditor, setActiveCanvas, navigateToEditor])

  /**
   * Open settings panel
   */
  const openSettings = useCallback(() => {
    if (!hasEditorSlot()) {
      const canvasWithEditor = findCanvasWithEditor()
      if (canvasWithEditor) {
        setActiveCanvas(canvasWithEditor.id)
      }
    }
    navigateToEditor('settings')
  }, [hasEditorSlot, findCanvasWithEditor, setActiveCanvas, navigateToEditor])

  /**
   * Keyboard shortcuts for back/forward navigation
   */
  useEffect(() => {
    if (!enableKeyboardShortcuts) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘[ for back, ⌘] for forward (Mac)
      // Ctrl+[ and Ctrl+] on Windows/Linux
      const isMod = e.metaKey || e.ctrlKey

      if (isMod && e.key === '[') {
        e.preventDefault()
        if (canGoBack) goBack()
      } else if (isMod && e.key === ']') {
        e.preventDefault()
        if (canGoForward) goForward()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enableKeyboardShortcuts, canGoBack, canGoForward, goBack, goForward])

  return {
    openInEditor,
    openStaging,
    openCreateWorktree,
    openCreateBranch,
    openSettings,
    goBack,
    goForward,
    canGoBack,
    canGoForward,
  }
}
