/**
 * Notion Types
 *
 * Core types for the Notion service integration.
 */

/**
 * A Notion database that can be queried for cards
 */
export interface NotionDatabase {
  id: string
  title: string
  url: string
  icon?: string
  description?: string
  properties: NotionProperty[]
  createdTime: string
  lastEditedTime: string
}

/**
 * A property definition from a Notion database
 */
export interface NotionProperty {
  id: string
  name: string
  type: NotionPropertyType
  options?: NotionPropertyOption[]
}

/**
 * Supported Notion property types
 */
export type NotionPropertyType =
  | 'title'
  | 'rich_text'
  | 'number'
  | 'select'
  | 'multi_select'
  | 'status'
  | 'date'
  | 'people'
  | 'files'
  | 'checkbox'
  | 'url'
  | 'email'
  | 'phone_number'
  | 'formula'
  | 'relation'
  | 'rollup'
  | 'created_time'
  | 'created_by'
  | 'last_edited_time'
  | 'last_edited_by'
  | 'unique_id'

/**
 * An option for select/multi-select/status properties
 */
export interface NotionPropertyOption {
  id: string
  name: string
  color?: string
}

/**
 * A card (page) from a Notion database
 */
export interface NotionCard {
  id: string
  title: string
  url: string
  icon?: string
  cover?: string
  properties: Record<string, NotionPropertyValue>
  content?: string // Page content as markdown
  createdTime: string
  lastEditedTime: string
  createdBy?: string
  lastEditedBy?: string
}

/**
 * A property value on a card
 */
export interface NotionPropertyValue {
  type: NotionPropertyType
  value: unknown
  displayValue: string
}

/**
 * Options for querying cards from a database
 */
export interface NotionQueryOptions {
  filter?: NotionFilter
  sorts?: NotionSort[]
  pageSize?: number
  startCursor?: string
}

/**
 * Filter for querying cards
 */
export interface NotionFilter {
  property: string
  type: NotionFilterType
  condition: NotionFilterCondition
  value: unknown
}

/**
 * Filter types that can be applied
 */
export type NotionFilterType =
  | 'title'
  | 'rich_text'
  | 'number'
  | 'select'
  | 'multi_select'
  | 'status'
  | 'date'
  | 'checkbox'

/**
 * Filter conditions for different property types
 */
export type NotionFilterCondition =
  | 'equals'
  | 'does_not_equal'
  | 'contains'
  | 'does_not_contain'
  | 'starts_with'
  | 'ends_with'
  | 'is_empty'
  | 'is_not_empty'
  | 'greater_than'
  | 'less_than'
  | 'greater_than_or_equal_to'
  | 'less_than_or_equal_to'
  | 'before'
  | 'after'
  | 'on_or_before'
  | 'on_or_after'

/**
 * Sort configuration for queries
 */
export interface NotionSort {
  property?: string
  timestamp?: 'created_time' | 'last_edited_time'
  direction: 'ascending' | 'descending'
}

/**
 * Result of querying cards
 */
export interface NotionQueryResult {
  cards: NotionCard[]
  hasMore: boolean
  nextCursor?: string
  totalCount?: number
}

/**
 * Settings for the Notion integration
 */
export interface NotionSettings {
  /** Internal integration token (secret_...) */
  apiKey?: string
  /** Connected workspace name */
  workspaceName?: string
  /** OAuth tokens if using OAuth flow (future) */
  accessToken?: string
  refreshToken?: string
  tokenExpiry?: number
}

/**
 * Content block types for rich text
 */
export type NotionBlockType =
  | 'paragraph'
  | 'heading_1'
  | 'heading_2'
  | 'heading_3'
  | 'bulleted_list_item'
  | 'numbered_list_item'
  | 'to_do'
  | 'toggle'
  | 'code'
  | 'quote'
  | 'callout'
  | 'divider'
  | 'image'
  | 'video'
  | 'file'
  | 'bookmark'
  | 'equation'
  | 'table_of_contents'

/**
 * A block of content in a page
 */
export interface NotionBlock {
  id: string
  type: NotionBlockType
  content: string
  children?: NotionBlock[]
  hasChildren: boolean
}

/**
 * Result type for service operations
 */
export interface NotionResult<T = void> {
  success: boolean
  data?: T
  error?: string
}
