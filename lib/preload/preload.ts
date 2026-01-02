import { contextBridge, ipcRenderer } from 'electron'
import { conveyor } from '@/lib/conveyor/api'
import type { LedgerEvent, LedgerEventType } from '@/lib/events/event-types'
import { LEDGER_EVENT_CHANNEL } from '@/lib/events/event-types'

// Event subscription management
type EventCallback = (event: LedgerEvent) => void
const eventListeners = new Map<string, Set<EventCallback>>()
let ipcListenerRegistered = false

function ensureIpcListener() {
  if (ipcListenerRegistered) return
  ipcListenerRegistered = true

  ipcRenderer.on(LEDGER_EVENT_CHANNEL, (_ipcEvent, event: LedgerEvent) => {
    // Notify type-specific listeners
    const typeListeners = eventListeners.get(event.type)
    if (typeListeners) {
      for (const callback of typeListeners) {
        try {
          callback(event)
        } catch (err) {
          console.error(`[Events] Error in listener for ${event.type}:`, err)
        }
      }
    }

    // Notify wildcard listeners
    const wildcardListeners = eventListeners.get('*')
    if (wildcardListeners) {
      for (const callback of wildcardListeners) {
        try {
          callback(event)
        } catch (err) {
          console.error('[Events] Error in wildcard listener:', err)
        }
      }
    }
  })
}

// Events API for renderer
const events = {
  /**
   * Subscribe to events of a specific type
   * @param type Event type or '*' for all events
   * @param callback Function to call when event occurs
   * @returns Unsubscribe function
   */
  on(type: LedgerEventType | '*', callback: EventCallback): () => void {
    ensureIpcListener()

    if (!eventListeners.has(type)) {
      eventListeners.set(type, new Set())
    }
    eventListeners.get(type)!.add(callback)

    // Return unsubscribe function
    return () => {
      const listeners = eventListeners.get(type)
      if (listeners) {
        listeners.delete(callback)
        if (listeners.size === 0) {
          eventListeners.delete(type)
        }
      }
    }
  },

  /**
   * Subscribe to an event once
   */
  once(type: LedgerEventType | '*', callback: EventCallback): () => void {
    const unsubscribe = this.on(type, (event) => {
      unsubscribe()
      callback(event)
    })
    return unsubscribe
  },
}

// ============================================
// SECURITY VERIFICATION
// Context isolation MUST be enabled for security.
// ============================================
if (!process.contextIsolated) {
  console.error(
    '[SECURITY] Context isolation is DISABLED! This is a critical security risk.\n' +
    'Ensure webPreferences.contextIsolation is set to true in lib/main/app.ts'
  )
}

// Use `contextBridge` APIs to expose APIs to renderer.
// Only conveyor and ledgerEvents are exposed - no Node.js APIs.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('conveyor', conveyor)
    contextBridge.exposeInMainWorld('ledgerEvents', events)
  } catch (error) {
    console.error('[Preload] Failed to expose APIs:', error)
  }
} else {
  // Fallback for testing without context isolation (should never happen in production)
  window.conveyor = conveyor
  window.ledgerEvents = events
}
