/**
 * Main Process Event Emitter
 *
 * Emits events to all renderer windows via IPC.
 */

import { BrowserWindow } from 'electron'
import { LEDGER_EVENT_CHANNEL, type LedgerEvent } from './event-types'

/**
 * Emit an event to all renderer windows
 */
export function emitEvent(event: LedgerEvent): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send(LEDGER_EVENT_CHANNEL, event)
    }
  }
}

// Convenience functions for common events

export function emitRepoOpened(path: string): void {
  const name = path.split(/[/\\]/).pop() || 'repository'
  emitEvent({ type: 'repo:opened', path, name })
}

export function emitRepoClosed(path: string): void {
  emitEvent({ type: 'repo:closed', path })
}

export function emitRepoSwitched(fromPath: string | null, toPath: string): void {
  const name = toPath.split(/[/\\]/).pop() || 'repository'
  emitEvent({ type: 'repo:switched', fromPath, toPath, name })
}

export function emitRepoRefreshed(path: string): void {
  emitEvent({ type: 'repo:refreshed', path })
}

export function emitGitCommit(path: string, hash: string, message: string): void {
  emitEvent({ type: 'git:commit', path, hash, message })
}

export function emitGitPush(path: string, branch: string): void {
  emitEvent({ type: 'git:push', path, branch })
}

export function emitGitPull(path: string, branch: string): void {
  emitEvent({ type: 'git:pull', path, branch })
}

export function emitGitCheckout(path: string, branch: string): void {
  emitEvent({ type: 'git:checkout', path, branch })
}

export function emitGitStash(path: string, action: 'save' | 'apply' | 'pop' | 'drop'): void {
  emitEvent({ type: 'git:stash', path, action })
}
