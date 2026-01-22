/**
 * Quick Capture Preload Script
 *
 * Minimal preload for the Quick Capture popover window.
 * Exposes only the APIs needed for quick issue creation.
 */

import { contextBridge, ipcRenderer } from 'electron'

// Type definitions for the exposed API
export interface QuickCaptureAPI {
  // Issue creation
  createQuickIssue: (issue: {
    description: string
    screenshot?: string
    labels?: string[]
    priority?: string
    repoPath: string
  }) => Promise<{ success: boolean; number?: number; url?: string; message: string }>

  // Screenshot
  captureScreenshot: () => Promise<{ success: boolean; data?: string; message?: string }>

  // Repository info
  getRecentRepos: () => Promise<Array<{ path: string; name: string; owner?: string }>>
  getCurrentRepo: () => Promise<string | null>

  // Labels
  getQuickLabels: (repoPath: string) => Promise<string[]>
  getPriorityLabels: (repoPath: string) => Promise<string[]>

  // Settings
  getSettings: () => Promise<{
    enabled: boolean
    autoScreenshot: boolean
    screenshotDelay: number
    defaultLabels: string[]
    defaultRepo: string
  }>

  // Window control
  hide: () => void
}

// Expose the Quick Capture API
contextBridge.exposeInMainWorld('quickCapture', {
  // Issue creation
  createQuickIssue: (issue: {
    description: string
    screenshot?: string
    labels?: string[]
    priority?: string
    repoPath: string
  }) => ipcRenderer.invoke('quick-capture:create-issue', issue),

  // Screenshot
  captureScreenshot: () => ipcRenderer.invoke('quick-capture:screenshot'),

  // Repository info
  getRecentRepos: () => ipcRenderer.invoke('quick-capture:recent-repos'),
  getCurrentRepo: () => ipcRenderer.invoke('quick-capture:current-repo'),

  // Labels
  getQuickLabels: (repoPath: string) => ipcRenderer.invoke('quick-capture:labels', repoPath),
  getPriorityLabels: (repoPath: string) => ipcRenderer.invoke('quick-capture:priority-labels', repoPath),

  // Settings
  getSettings: () => ipcRenderer.invoke('quick-capture:settings'),

  // Window control
  hide: () => ipcRenderer.send('quick-capture:hide'),
} as QuickCaptureAPI)

// Declare global type for TypeScript
declare global {
  interface Window {
    quickCapture: QuickCaptureAPI
  }
}
