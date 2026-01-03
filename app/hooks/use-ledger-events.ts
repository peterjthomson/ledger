/**
 * React hook for subscribing to Ledger events
 */

import { useEffect, useCallback } from 'react'
import type { LedgerEvent, LedgerEventType } from '@/lib/events/event-types'

type EventCallback<T extends LedgerEvent = LedgerEvent> = (event: T) => void

/**
 * Subscribe to Ledger events with automatic cleanup
 */
export function useLedgerEvent<T extends LedgerEvent = LedgerEvent>(
  type: LedgerEventType | '*',
  callback: EventCallback<T>,
  deps: React.DependencyList = []
): void {
  // Memoize the callback to prevent unnecessary re-subscriptions
   
  const memoizedCallback = useCallback(callback, deps)

  useEffect(() => {
    if (!window.ledgerEvents) {
      console.warn('[useLedgerEvent] ledgerEvents not available')
      return
    }

    const unsubscribe = window.ledgerEvents.on(type, memoizedCallback as EventCallback)
    return unsubscribe
  }, [type, memoizedCallback])
}

/**
 * Subscribe to repo opened events
 */
export function useRepoOpened(callback: (path: string, name: string) => void, deps: React.DependencyList = []) {
  useLedgerEvent(
    'repo:opened',
    (event) => {
      if (event.type === 'repo:opened') {
        callback(event.path, event.name)
      }
    },
    deps
  )
}

/**
 * Subscribe to repo closed events
 */
export function useRepoClosed(callback: (path: string) => void, deps: React.DependencyList = []) {
  useLedgerEvent(
    'repo:closed',
    (event) => {
      if (event.type === 'repo:closed') {
        callback(event.path)
      }
    },
    deps
  )
}

/**
 * Subscribe to repo switched events
 */
export function useRepoSwitched(
  callback: (fromPath: string | null, toPath: string, name: string) => void,
  deps: React.DependencyList = []
) {
  useLedgerEvent(
    'repo:switched',
    (event) => {
      if (event.type === 'repo:switched') {
        callback(event.fromPath, event.toPath, event.name)
      }
    },
    deps
  )
}

/**
 * Subscribe to git commit events
 */
export function useGitCommit(
  callback: (path: string, hash: string, message: string) => void,
  deps: React.DependencyList = []
) {
  useLedgerEvent(
    'git:commit',
    (event) => {
      if (event.type === 'git:commit') {
        callback(event.path, event.hash, event.message)
      }
    },
    deps
  )
}

/**
 * Subscribe to git checkout events
 */
export function useGitCheckout(
  callback: (path: string, branch: string) => void,
  deps: React.DependencyList = []
) {
  useLedgerEvent(
    'git:checkout',
    (event) => {
      if (event.type === 'git:checkout') {
        callback(event.path, event.branch)
      }
    },
    deps
  )
}

/**
 * Subscribe to git push events
 */
export function useGitPush(
  callback: (path: string, branch: string) => void,
  deps: React.DependencyList = []
) {
  useLedgerEvent(
    'git:push',
    (event) => {
      if (event.type === 'git:push') {
        callback(event.path, event.branch)
      }
    },
    deps
  )
}

/**
 * Subscribe to git pull events
 */
export function useGitPull(
  callback: (path: string, branch: string) => void,
  deps: React.DependencyList = []
) {
  useLedgerEvent(
    'git:pull',
    (event) => {
      if (event.type === 'git:pull') {
        callback(event.path, event.branch)
      }
    },
    deps
  )
}

/**
 * Subscribe to git stash events
 */
export function useGitStash(
  callback: (path: string, action: 'save' | 'apply' | 'pop' | 'drop') => void,
  deps: React.DependencyList = []
) {
  useLedgerEvent(
    'git:stash',
    (event) => {
      if (event.type === 'git:stash') {
        callback(event.path, event.action)
      }
    },
    deps
  )
}

/**
 * Subscribe to all events (for debugging or logging)
 */
export function useAllLedgerEvents(callback: (event: LedgerEvent) => void, deps: React.DependencyList = []) {
  useLedgerEvent('*', callback, deps)
}
