/**
 * List Controls Store
 *
 * Search / filter / sort / controls-open state for list panels, keyed by list kind
 * (e.g. `branches:sort`). Lives outside the panels so it survives switching canvases or
 * swapping the panel shown in a column, and so the radar columns and the Focus sidebar
 * sections for the same item type stay in step.
 *
 * Filter, sort, and sidebar section expansion are persisted to localStorage; search text
 * and filter-panel open state are kept for the session only.
 */

import { useCallback } from 'react'
import { createAppStore } from './create-store'

export type ListControlValue = string | boolean

interface ListControlsState {
  values: Record<string, ListControlValue>
  setValue: (key: string, value: ListControlValue) => void
}

const PERSISTED_KEY = /:(filter|sort)$|^sidebar:section:/

export const useListControlsStore = createAppStore<ListControlsState>(
  'list-controls',
  (set) => ({
    values: {},
    setValue: (key, value) => set((s) => ({ values: { ...s.values, [key]: value } })),
  }),
  {
    persist: true,
    partialize: (state) => ({
      values: Object.fromEntries(Object.entries(state.values).filter(([key]) => PERSISTED_KEY.test(key))),
    }),
  }
)

/** useState-like access to one list control value. */
export function useListControl(key: string, defaultValue: boolean): [boolean, (value: boolean) => void]
export function useListControl<T extends string = string>(
  key: string,
  defaultValue: NoInfer<T>
): [T, (value: T) => void]
export function useListControl<T extends ListControlValue>(
  key: string,
  defaultValue: T
): [T, (value: T) => void] {
  const stored = useListControlsStore((s) => s.values[key]) as T | undefined
  const setValue = useListControlsStore((s) => s.setValue)
  const update = useCallback((value: T) => setValue(key, value), [key, setValue])
  return [stored ?? defaultValue, update]
}
