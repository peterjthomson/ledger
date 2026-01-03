import { z } from 'zod'
import { ThemeModeSchema, SystemThemeSchema, CustomThemeResultSchema } from './shared-types'

const SuccessOnlySchema = z.object({
  success: z.boolean(),
})

export const themeIpcSchema = {
  'get-theme-mode': {
    args: z.tuple([]),
    return: ThemeModeSchema,
  },
  'set-theme-mode': {
    args: z.tuple([ThemeModeSchema]),
    return: SuccessOnlySchema,
  },
  'get-system-theme': {
    args: z.tuple([]),
    return: SystemThemeSchema,
  },
  'get-custom-theme': {
    args: z.tuple([]),
    return: CustomThemeResultSchema,
  },
  'load-vscode-theme': {
    args: z.tuple([]),
    return: CustomThemeResultSchema,
  },
  'load-built-in-theme': {
    args: z.tuple([z.string()]),
    return: CustomThemeResultSchema,
  },
  'clear-custom-theme': {
    args: z.tuple([]),
    return: SuccessOnlySchema,
  },
}
