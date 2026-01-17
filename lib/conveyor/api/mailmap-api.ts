import { ConveyorApi } from '@/lib/preload/shared'
import type { MailmapEntry } from '@/lib/services/mailmap'

export class MailmapApi extends ConveyorApi {
  getMailmap = () => this.invoke('get-mailmap')
  getAuthorIdentities = () => this.invoke('get-author-identities')
  suggestMailmapEntries = () => this.invoke('suggest-mailmap-entries')
  addMailmapEntries = (entries: MailmapEntry[]) => this.invoke('add-mailmap-entries', entries)
  removeMailmapEntry = (entry: MailmapEntry) => this.invoke('remove-mailmap-entry', entry)
}
