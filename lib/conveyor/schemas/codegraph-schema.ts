import { z } from 'zod'

// Language enum
export const CodeGraphLanguageSchema = z.enum(['typescript', 'javascript', 'php', 'ruby', 'mixed'])

// Node kind enum
export const CodeNodeKindSchema = z.enum(['file', 'class', 'interface', 'function', 'module', 'trait', 'enum'])

// Edge kind enum
export const CodeEdgeKindSchema = z.enum(['imports', 'extends', 'implements', 'includes', 'exports'])

// Node change status enum
export const CodeNodeChangeStatusSchema = z.enum(['added', 'modified', 'deleted']).optional()

// Node schema
export const CodeNodeSchema = z.object({
  id: z.string(),
  kind: CodeNodeKindSchema,
  name: z.string(),
  displayName: z.string(),
  filePath: z.string(),
  line: z.number().optional(),
  endLine: z.number().optional(),
  language: CodeGraphLanguageSchema,
  namespace: z.string().optional(),
  exported: z.boolean().optional(),
  position: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .optional(),
  changeStatus: CodeNodeChangeStatusSchema,
})

// Edge schema
export const CodeEdgeSchema = z.object({
  id: z.string(),
  kind: CodeEdgeKindSchema,
  source: z.string(),
  target: z.string(),
  resolved: z.boolean(),
  line: z.number().optional(),
  specifier: z.string().optional(),
})

// Full code graph schema
export const CodeGraphSchemaSchema = z.object({
  nodes: z.array(CodeNodeSchema),
  edges: z.array(CodeEdgeSchema),
  language: CodeGraphLanguageSchema,
  rootPath: z.string(),
  parsedAt: z.string(),
  parserVersion: z.string(),
})

// Parse result schema
export const CodeGraphParseResultSchema = z.object({
  success: z.boolean(),
  data: CodeGraphSchemaSchema.optional(),
  message: z.string().optional(),
})

// Language result schema
export const CodeGraphLanguageResultSchema = z.object({
  success: z.boolean(),
  data: CodeGraphLanguageSchema.optional(),
  message: z.string().optional(),
})

// Parse options schema
export const CodeGraphParseOptionsSchema = z.object({
  includeNodeModules: z.boolean().optional(),
  includeTests: z.boolean().optional(),
  includeTypeImports: z.boolean().optional(),
  maxDepth: z.number().optional(),
  excludePatterns: z.array(z.string()).optional(),
})

// Diff status result schema
export const CodeGraphDiffStatusResultSchema = z.object({
  success: z.boolean(),
  data: z.record(z.string(), z.enum(['added', 'modified', 'deleted'])).optional(),
  message: z.string().optional(),
})

// IPC schema definitions
export const codegraphIpcSchema = {
  'get-codegraph-schema': {
    args: z.tuple([z.string().optional(), CodeGraphParseOptionsSchema.optional()]),
    return: CodeGraphParseResultSchema,
  },
  'detect-codegraph-language': {
    args: z.tuple([z.string().optional()]),
    return: CodeGraphLanguageResultSchema,
  },
  'get-codegraph-diff-status': {
    args: z.tuple([z.string().optional()]),
    return: CodeGraphDiffStatusResultSchema,
  },
}

// Type exports
export type CodeGraphLanguage = z.infer<typeof CodeGraphLanguageSchema>
export type CodeNodeKind = z.infer<typeof CodeNodeKindSchema>
export type CodeEdgeKind = z.infer<typeof CodeEdgeKindSchema>
export type CodeNode = z.infer<typeof CodeNodeSchema>
export type CodeEdge = z.infer<typeof CodeEdgeSchema>
export type CodeGraphSchema = z.infer<typeof CodeGraphSchemaSchema>
export type CodeGraphParseResult = z.infer<typeof CodeGraphParseResultSchema>
export type CodeGraphLanguageResult = z.infer<typeof CodeGraphLanguageResultSchema>
export type CodeGraphParseOptions = z.infer<typeof CodeGraphParseOptionsSchema>
