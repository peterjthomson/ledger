import { z } from 'zod'
import { windowIpcSchema } from './window-schema'
import { appIpcSchema } from './app-schema'
import { repoIpcSchema } from './repo-schema'
import { branchIpcSchema } from './branch-schema'
import { worktreeIpcSchema } from './worktree-schema'
import { prIpcSchema } from './pr-schema'
import { commitIpcSchema } from './commit-schema'
import { stashIpcSchema } from './stash-schema'
import { stagingIpcSchema } from './staging-schema'
import { themeIpcSchema } from './theme-schema'
import { pluginIpcSchema } from './plugin-schema'
import { aiIpcSchema } from './ai-schema'
import { mailmapIpcSchema } from './mailmap-schema'
import { analyticsIpcSchema } from './analytics-schema'
import { canvasIpcSchema } from './canvas-schema'

// Define all IPC channel schemas in one place
export const ipcSchemas = {
  ...windowIpcSchema,
  ...appIpcSchema,
  ...repoIpcSchema,
  ...branchIpcSchema,
  ...worktreeIpcSchema,
  ...prIpcSchema,
  ...commitIpcSchema,
  ...stashIpcSchema,
  ...stagingIpcSchema,
  ...themeIpcSchema,
  ...pluginIpcSchema,
  ...aiIpcSchema,
  ...mailmapIpcSchema,
  ...analyticsIpcSchema,
  ...canvasIpcSchema,
} as const

// Extract types from Zod schemas
export type IPCChannels = {
  [K in keyof typeof ipcSchemas]: {
    args: z.infer<(typeof ipcSchemas)[K]['args']>
    return: z.infer<(typeof ipcSchemas)[K]['return']>
  }
}

export type ChannelName = keyof typeof ipcSchemas
export type ChannelArgs<T extends ChannelName> = IPCChannels[T]['args']
export type ChannelReturn<T extends ChannelName> = IPCChannels[T]['return']

// Runtime validation helpers
export const validateArgs = <T extends ChannelName>(channel: T, args: unknown[]): ChannelArgs<T> => {
  return ipcSchemas[channel].args.parse(args) as ChannelArgs<T>
}

export const validateReturn = <T extends ChannelName>(channel: T, data: unknown): ChannelReturn<T> => {
  return ipcSchemas[channel].return.parse(data) as ChannelReturn<T>
}
