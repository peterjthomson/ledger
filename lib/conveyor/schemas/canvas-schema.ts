import { z } from 'zod'
import { SuccessResultSchema } from './shared-types'

// Canvas-specific schemas
export const CanvasColumnSchema = z.object({
  id: z.string(),
  slotType: z.enum(['list', 'editor', 'viz']),
  panel: z.string(),
  width: z.union([z.number(), z.literal('flex')]),
  minWidth: z.number().optional(),
  config: z.record(z.unknown()).optional(),
  label: z.string().optional(),
  icon: z.string().optional(),
  visible: z.boolean().optional(),
  collapsible: z.boolean().optional(),
})

export const CanvasConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string().optional(),
  columns: z.array(CanvasColumnSchema),
  isPreset: z.boolean().optional(),
})

export const canvasIpcSchema = {
  'get-canvases': {
    args: z.tuple([]),
    return: z.array(CanvasConfigSchema),
  },
  'save-canvases': {
    args: z.tuple([z.array(CanvasConfigSchema)]),
    return: SuccessResultSchema,
  },
  'get-active-canvas-id': {
    args: z.tuple([]),
    return: z.string(),
  },
  'save-active-canvas-id': {
    args: z.tuple([z.string()]),
    return: SuccessResultSchema,
  },
  'add-canvas': {
    args: z.tuple([CanvasConfigSchema]),
    return: SuccessResultSchema,
  },
  'remove-canvas': {
    args: z.tuple([z.string()]),
    return: SuccessResultSchema,
  },
  'update-canvas': {
    args: z.tuple([z.string(), CanvasConfigSchema.partial()]),
    return: SuccessResultSchema,
  },
}
