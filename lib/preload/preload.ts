import { contextBridge } from 'electron'
import { conveyor } from '@/lib/conveyor/api'

// Use `contextBridge` APIs to expose APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('conveyor', conveyor)
  } catch (error) {
    console.error(error)
  }
} else {
  window.conveyor = conveyor
}
