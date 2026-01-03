/**
 * Store Factory
 *
 * Creates Zustand stores with devtools and optional persistence.
 * All stores use this factory for consistent behavior.
 */

import { create, StateCreator } from 'zustand'
import { devtools, persist, PersistOptions } from 'zustand/middleware'

export interface StoreOptions<T> {
  /** Enable localStorage persistence */
  persist?: boolean
  /** Custom storage key (defaults to store name) */
  storageKey?: string
  /** Partial state to persist (default: all) */
  partialize?: (state: T) => Partial<T>
}

/**
 * Creates a Zustand store with devtools and optional persistence.
 *
 * @param name - Store name (shown in devtools)
 * @param initializer - State creator function
 * @param options - Optional persistence config
 *
 * @example
 * ```ts
 * const useCounterStore = createAppStore('counter', (set) => ({
 *   count: 0,
 *   increment: () => set((s) => ({ count: s.count + 1 })),
 * }))
 * ```
 */
export function createAppStore<T>(
  name: string,
  initializer: StateCreator<T, [['zustand/devtools', never], ['zustand/persist', unknown]], []>,
  options?: StoreOptions<T>
) {
  const persistOptions: PersistOptions<T, Partial<T>> = {
    name: options?.storageKey ?? name,
    partialize: options?.partialize,
  }

  if (options?.persist) {
    return create<T>()(
      devtools(
        persist(initializer, persistOptions),
        { name, enabled: process.env.NODE_ENV === 'development' }
      )
    )
  }

  return create<T>()(
    devtools(initializer, { name, enabled: process.env.NODE_ENV === 'development' })
  )
}

/**
 * Creates a simple store without devtools (for performance-critical stores).
 */
export function createSimpleStore<T>(initializer: StateCreator<T>) {
  return create<T>()(initializer)
}
