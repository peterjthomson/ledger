import type { ConveyorApi } from '@/lib/conveyor/api'
import type { LedgerEvent, LedgerEventType } from '@/lib/events/event-types'

type EventCallback = (event: LedgerEvent) => void

interface LedgerEventsApi {
  on(type: LedgerEventType | '*', callback: EventCallback): () => void
  once(type: LedgerEventType | '*', callback: EventCallback): () => void
}

declare global {
  interface Window {
    conveyor: ConveyorApi
    ledgerEvents: LedgerEventsApi
  }
}
