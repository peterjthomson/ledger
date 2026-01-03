import { ipcMain } from 'electron'
import { ipcSchemas, validateArgs, validateReturn, type ChannelArgs, type ChannelReturn } from '@/lib/conveyor/schemas'

// Track which IPC channels have handlers registered
const registeredChannels = new Set<string>()

/**
 * Mark a channel as registered (call before ipcMain.handle)
 */
export const markChannelRegistered = (channel: string): void => {
  registeredChannels.add(channel)
}

/**
 * Register a typed IPC handler with schema validation.
 * Skips registration if the channel already has a handler.
 */
export const handle = <T extends keyof typeof ipcSchemas>(
  channel: T,
  handler: (...args: ChannelArgs<T>) => ChannelReturn<T>
): void => {
  if (registeredChannels.has(channel)) return
  
  ipcMain.handle(channel, async (_, ...args) => {
    const validatedArgs = validateArgs(channel, args)
    const result = await handler(...validatedArgs)
    return validateReturn(channel, result)
  })
  registeredChannels.add(channel)
}
