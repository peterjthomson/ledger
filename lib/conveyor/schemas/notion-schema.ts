import { z } from 'zod'

// Notion Property Type schema
export const NotionPropertyTypeSchema = z.enum([
  'title',
  'rich_text',
  'number',
  'select',
  'multi_select',
  'status',
  'date',
  'people',
  'files',
  'checkbox',
  'url',
  'email',
  'phone_number',
  'formula',
  'relation',
  'rollup',
  'created_time',
  'created_by',
  'last_edited_time',
  'last_edited_by',
  'unique_id',
])

// Property option schema
export const NotionPropertyOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().optional(),
})

// Property schema
export const NotionPropertySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: NotionPropertyTypeSchema,
  options: z.array(NotionPropertyOptionSchema).optional(),
})

// Database schema
export const NotionDatabaseSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  icon: z.string().optional(),
  description: z.string().optional(),
  properties: z.array(NotionPropertySchema),
  createdTime: z.string(),
  lastEditedTime: z.string(),
})

// Property value schema
export const NotionPropertyValueSchema = z.object({
  type: NotionPropertyTypeSchema,
  value: z.unknown(),
  displayValue: z.string(),
})

// Card schema
export const NotionCardSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  icon: z.string().optional(),
  cover: z.string().optional(),
  properties: z.record(z.string(), NotionPropertyValueSchema),
  content: z.string().optional(),
  createdTime: z.string(),
  lastEditedTime: z.string(),
  createdBy: z.string().optional(),
  lastEditedBy: z.string().optional(),
})

// Filter condition schema
export const NotionFilterConditionSchema = z.enum([
  'equals',
  'does_not_equal',
  'contains',
  'does_not_contain',
  'starts_with',
  'ends_with',
  'is_empty',
  'is_not_empty',
  'greater_than',
  'less_than',
  'greater_than_or_equal_to',
  'less_than_or_equal_to',
  'before',
  'after',
  'on_or_before',
  'on_or_after',
])

// Filter type schema
export const NotionFilterTypeSchema = z.enum([
  'title',
  'rich_text',
  'number',
  'select',
  'multi_select',
  'status',
  'date',
  'checkbox',
])

// Filter schema
export const NotionFilterSchema = z.object({
  property: z.string(),
  type: NotionFilterTypeSchema,
  condition: NotionFilterConditionSchema,
  value: z.unknown(),
})

// Sort schema
export const NotionSortSchema = z.object({
  property: z.string().optional(),
  timestamp: z.enum(['created_time', 'last_edited_time']).optional(),
  direction: z.enum(['ascending', 'descending']),
})

// Query options schema
export const NotionQueryOptionsSchema = z.object({
  filter: NotionFilterSchema.optional(),
  sorts: z.array(NotionSortSchema).optional(),
  pageSize: z.number().optional(),
  startCursor: z.string().optional(),
})

// Query result schema
export const NotionQueryResultSchema = z.object({
  cards: z.array(NotionCardSchema),
  hasMore: z.boolean(),
  nextCursor: z.string().optional(),
  totalCount: z.number().optional(),
})

// Settings schema
export const NotionSettingsSchema = z.object({
  apiKey: z.string().optional(),
  workspaceName: z.string().optional(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  tokenExpiry: z.number().optional(),
})

// Result schemas
const SuccessResultSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
})

const TestConnectionResultSchema = z.object({
  success: z.boolean(),
  workspaceName: z.string().optional(),
  error: z.string().optional(),
})

// IPC schemas for Notion service
export const notionIpcSchema = {
  // Settings
  'notion:get-settings': {
    args: z.tuple([]),
    return: NotionSettingsSchema.nullable(),
  },
  'notion:save-settings': {
    args: z.tuple([NotionSettingsSchema]),
    return: SuccessResultSchema,
  },
  'notion:set-api-key': {
    args: z.tuple([z.string()]),
    return: SuccessResultSchema,
  },
  'notion:remove-api-key': {
    args: z.tuple([]),
    return: SuccessResultSchema,
  },

  // Connection
  'notion:is-configured': {
    args: z.tuple([]),
    return: z.boolean(),
  },
  'notion:test-connection': {
    args: z.tuple([]),
    return: TestConnectionResultSchema,
  },

  // Databases
  'notion:list-databases': {
    args: z.tuple([]),
    return: z.object({
      success: z.boolean(),
      databases: z.array(NotionDatabaseSchema).optional(),
      error: z.string().optional(),
    }),
  },
  'notion:get-database': {
    args: z.tuple([z.string()]), // databaseId
    return: z.object({
      success: z.boolean(),
      database: NotionDatabaseSchema.optional(),
      error: z.string().optional(),
    }),
  },

  // Cards
  'notion:query-cards': {
    args: z.tuple([z.string(), NotionQueryOptionsSchema.optional()]), // databaseId, options
    return: z.object({
      success: z.boolean(),
      result: NotionQueryResultSchema.optional(),
      error: z.string().optional(),
    }),
  },
  'notion:get-card': {
    args: z.tuple([z.string()]), // pageId
    return: z.object({
      success: z.boolean(),
      card: NotionCardSchema.optional(),
      error: z.string().optional(),
    }),
  },

  // Content
  'notion:get-page-content': {
    args: z.tuple([z.string()]), // pageId
    return: z.object({
      success: z.boolean(),
      content: z.string().optional(),
      error: z.string().optional(),
    }),
  },

  // Mutations
  'notion:update-card-property': {
    args: z.tuple([z.string(), z.string(), z.unknown()]), // pageId, propertyName, value
    return: SuccessResultSchema,
  },
  'notion:append-to-page': {
    args: z.tuple([z.string(), z.string()]), // pageId, markdown
    return: SuccessResultSchema,
  },
  'notion:add-comment': {
    args: z.tuple([z.string(), z.string()]), // pageId, content
    return: SuccessResultSchema,
  },
}

// Type exports
export type NotionPropertyType = z.infer<typeof NotionPropertyTypeSchema>
export type NotionPropertyOption = z.infer<typeof NotionPropertyOptionSchema>
export type NotionProperty = z.infer<typeof NotionPropertySchema>
export type NotionDatabase = z.infer<typeof NotionDatabaseSchema>
export type NotionPropertyValue = z.infer<typeof NotionPropertyValueSchema>
export type NotionCard = z.infer<typeof NotionCardSchema>
export type NotionFilter = z.infer<typeof NotionFilterSchema>
export type NotionSort = z.infer<typeof NotionSortSchema>
export type NotionQueryOptions = z.infer<typeof NotionQueryOptionsSchema>
export type NotionQueryResult = z.infer<typeof NotionQueryResultSchema>
export type NotionSettings = z.infer<typeof NotionSettingsSchema>
