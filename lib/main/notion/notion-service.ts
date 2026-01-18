/**
 * Notion Service
 *
 * Main service for interacting with the Notion API.
 * Handles database listing, card querying, and content retrieval.
 */

import { Client, isFullPage, isFullDatabase } from '@notionhq/client'
import type {
  PageObjectResponse,
  DatabaseObjectResponse,
  BlockObjectResponse,
  RichTextItemResponse,
  QueryDatabaseParameters,
} from '@notionhq/client/build/src/api-endpoints'
import type {
  NotionDatabase,
  NotionCard,
  NotionProperty,
  NotionPropertyValue,
  NotionPropertyType,
  NotionQueryOptions,
  NotionQueryResult,
  NotionSettings,
  NotionBlock,
  NotionResult,
} from './types'

/**
 * Notion Service class
 */
class NotionServiceImpl {
  private client: Client | null = null
  private settings: NotionSettings | null = null
  private onSettingsChange?: (settings: NotionSettings) => void

  /**
   * Initialize the service with settings
   */
  initialize(
    settings: NotionSettings,
    onSettingsChange?: (settings: NotionSettings) => void
  ): void {
    this.settings = settings
    this.onSettingsChange = onSettingsChange

    if (settings.apiKey) {
      this.client = new Client({
        auth: settings.apiKey,
      })
    } else {
      this.client = null
    }
  }

  /**
   * Update settings and reinitialize client if needed
   */
  updateSettings(settings: NotionSettings): void {
    this.settings = settings
    if (settings.apiKey) {
      this.client = new Client({
        auth: settings.apiKey,
      })
    } else {
      this.client = null
    }
    this.onSettingsChange?.(settings)
  }

  /**
   * Check if the service is configured with valid credentials
   */
  isConfigured(): boolean {
    return !!(this.client && this.settings?.apiKey)
  }

  /**
   * Set the API key
   */
  setApiKey(apiKey: string): void {
    this.settings = { ...(this.settings ?? {}), apiKey }
    this.client = new Client({ auth: apiKey })
    this.onSettingsChange?.(this.settings)
  }

  /**
   * Clear the API key
   */
  clearApiKey(): void {
    this.settings = { ...(this.settings ?? {}), apiKey: undefined }
    this.client = null
    this.onSettingsChange?.(this.settings)
  }

  /**
   * Test the connection by fetching user info
   */
  async testConnection(): Promise<NotionResult<{ workspaceName: string }>> {
    if (!this.client) {
      return { success: false, error: 'Not configured' }
    }

    try {
      const response = await this.client.users.me({})
      // The workspace name comes from the bot owner for integrations
      const workspaceName = response.name || 'Connected Workspace'

      if (this.settings) {
        this.settings.workspaceName = workspaceName
        this.onSettingsChange?.(this.settings)
      }

      return { success: true, data: { workspaceName } }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      }
    }
  }

  /**
   * List all databases the integration has access to
   */
  async listDatabases(): Promise<NotionResult<NotionDatabase[]>> {
    if (!this.client) {
      return { success: false, error: 'Not configured' }
    }

    try {
      const response = await this.client.search({
        filter: { property: 'object', value: 'database' },
        page_size: 100,
      })

      const databases: NotionDatabase[] = []

      for (const result of response.results) {
        if (isFullDatabase(result)) {
          databases.push(this.transformDatabase(result))
        }
      }

      return { success: true, data: databases }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list databases',
      }
    }
  }

  /**
   * Get a specific database by ID
   */
  async getDatabase(databaseId: string): Promise<NotionResult<NotionDatabase>> {
    if (!this.client) {
      return { success: false, error: 'Not configured' }
    }

    try {
      const response = await this.client.databases.retrieve({
        database_id: databaseId,
      })

      if (!isFullDatabase(response)) {
        return { success: false, error: 'Partial database response' }
      }

      return { success: true, data: this.transformDatabase(response) }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get database',
      }
    }
  }

  /**
   * Query cards from a database
   */
  async queryCards(
    databaseId: string,
    options?: NotionQueryOptions
  ): Promise<NotionResult<NotionQueryResult>> {
    if (!this.client) {
      return { success: false, error: 'Not configured' }
    }

    try {
      const queryParams: QueryDatabaseParameters = {
        database_id: databaseId,
        page_size: options?.pageSize || 50,
      }

      if (options?.startCursor) {
        queryParams.start_cursor = options.startCursor
      }

      if (options?.sorts) {
        queryParams.sorts = options.sorts.map((sort) => {
          if (sort.property) {
            return {
              property: sort.property,
              direction: sort.direction,
            }
          }
          return {
            timestamp: sort.timestamp || 'last_edited_time',
            direction: sort.direction,
          }
        })
      }

      if (options?.filter) {
        queryParams.filter = this.buildFilter(options.filter)
      }

      const response = await this.client.databases.query(queryParams)

      const cards: NotionCard[] = []
      for (const page of response.results) {
        if (isFullPage(page)) {
          cards.push(this.transformPage(page))
        }
      }

      return {
        success: true,
        data: {
          cards,
          hasMore: response.has_more,
          nextCursor: response.next_cursor || undefined,
        },
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to query cards',
      }
    }
  }

  /**
   * Get a specific card by ID
   */
  async getCard(pageId: string): Promise<NotionResult<NotionCard>> {
    if (!this.client) {
      return { success: false, error: 'Not configured' }
    }

    try {
      const response = await this.client.pages.retrieve({ page_id: pageId })

      if (!isFullPage(response)) {
        return { success: false, error: 'Partial page response' }
      }

      const card = this.transformPage(response)

      // Also fetch the page content
      const contentResult = await this.getPageContent(pageId)
      if (contentResult.success && contentResult.data) {
        card.content = contentResult.data
      }

      return { success: true, data: card }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get card',
      }
    }
  }

  /**
   * Get the content blocks of a page as markdown
   */
  async getPageContent(pageId: string): Promise<NotionResult<string>> {
    if (!this.client) {
      return { success: false, error: 'Not configured' }
    }

    try {
      const blocks: NotionBlock[] = []
      let cursor: string | undefined

      do {
        const response = await this.client.blocks.children.list({
          block_id: pageId,
          start_cursor: cursor,
          page_size: 100,
        })

        for (const block of response.results) {
          if ('type' in block) {
            blocks.push(this.transformBlock(block as BlockObjectResponse))
          }
        }

        cursor = response.has_more ? (response.next_cursor || undefined) : undefined
      } while (cursor)

      const markdown = this.blocksToMarkdown(blocks)
      return { success: true, data: markdown }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get page content',
      }
    }
  }

  /**
   * Update a property on a card
   */
  async updateCardProperty(
    pageId: string,
    propertyName: string,
    value: unknown
  ): Promise<NotionResult> {
    if (!this.client) {
      return { success: false, error: 'Not configured' }
    }

    try {
      // First get the page to understand property types
      const page = await this.client.pages.retrieve({ page_id: pageId })
      if (!isFullPage(page)) {
        return { success: false, error: 'Partial page response' }
      }

      const property = page.properties[propertyName]
      if (!property) {
        return { success: false, error: `Property "${propertyName}" not found` }
      }

      const propertyValue = this.buildPropertyValue(property.type, value)

      await this.client.pages.update({
        page_id: pageId,
        properties: {
          [propertyName]: propertyValue,
        },
      })

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update property',
      }
    }
  }

  /**
   * Append content to a page
   */
  async appendToPage(pageId: string, markdown: string): Promise<NotionResult> {
    if (!this.client) {
      return { success: false, error: 'Not configured' }
    }

    try {
      const blocks = this.markdownToBlocks(markdown)

      await this.client.blocks.children.append({
        block_id: pageId,
        children: blocks,
      })

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to append content',
      }
    }
  }

  /**
   * Add a comment to a page
   */
  async addComment(pageId: string, content: string): Promise<NotionResult> {
    if (!this.client) {
      return { success: false, error: 'Not configured' }
    }

    try {
      await this.client.comments.create({
        parent: { page_id: pageId },
        rich_text: [{ type: 'text', text: { content } }],
      })

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add comment',
      }
    }
  }

  // ==========================================================================
  // Private helper methods
  // ==========================================================================

  /**
   * Transform a Notion database to our format
   */
  private transformDatabase(db: DatabaseObjectResponse): NotionDatabase {
    const title = this.extractPlainText(db.title)
    const description = db.description
      ? this.extractPlainText(db.description)
      : undefined

    const properties: NotionProperty[] = Object.entries(db.properties).map(
      ([name, prop]) => ({
        id: prop.id,
        name,
        type: prop.type as NotionPropertyType,
        options: this.extractPropertyOptions(prop),
      })
    )

    return {
      id: db.id,
      title,
      url: db.url,
      icon: this.extractIcon(db.icon),
      description,
      properties,
      createdTime: db.created_time,
      lastEditedTime: db.last_edited_time,
    }
  }

  /**
   * Transform a Notion page to our card format
   */
  private transformPage(page: PageObjectResponse): NotionCard {
    const properties: Record<string, NotionPropertyValue> = {}

    let title = 'Untitled'

    for (const [name, prop] of Object.entries(page.properties)) {
      const transformed = this.transformPropertyValue(prop)
      properties[name] = transformed

      // Extract title from title property
      if (prop.type === 'title' && transformed.displayValue) {
        title = transformed.displayValue
      }
    }

    return {
      id: page.id,
      title,
      url: page.url,
      icon: this.extractIcon(page.icon),
      cover: this.extractCover(page.cover),
      properties,
      createdTime: page.created_time,
      lastEditedTime: page.last_edited_time,
    }
  }

  /**
   * Transform a Notion block to our format
   */
  private transformBlock(block: BlockObjectResponse): NotionBlock {
    const blockType = block.type as NotionBlock['type']
    let content = ''

    // Extract content based on block type
    const blockData = block[block.type as keyof typeof block]
    if (blockData && typeof blockData === 'object' && 'rich_text' in blockData) {
      content = this.extractPlainText(
        blockData.rich_text as RichTextItemResponse[]
      )
    } else if (blockData && typeof blockData === 'object' && 'text' in blockData) {
      // For code blocks
      const textBlock = blockData as { rich_text: RichTextItemResponse[] }
      content = this.extractPlainText(textBlock.rich_text)
    }

    return {
      id: block.id,
      type: blockType,
      content,
      hasChildren: block.has_children,
    }
  }

  /**
   * Transform a property value to our format
   */
  private transformPropertyValue(
    prop: PageObjectResponse['properties'][string]
  ): NotionPropertyValue {
    const type = prop.type as NotionPropertyType

    let value: unknown
    let displayValue = ''

    switch (prop.type) {
      case 'title':
        value = prop.title
        displayValue = this.extractPlainText(prop.title)
        break
      case 'rich_text':
        value = prop.rich_text
        displayValue = this.extractPlainText(prop.rich_text)
        break
      case 'number':
        value = prop.number
        displayValue = prop.number?.toString() || ''
        break
      case 'select':
        value = prop.select
        displayValue = prop.select?.name || ''
        break
      case 'multi_select':
        value = prop.multi_select
        displayValue = prop.multi_select.map((s) => s.name).join(', ')
        break
      case 'status':
        value = prop.status
        displayValue = prop.status?.name || ''
        break
      case 'date':
        value = prop.date
        displayValue = prop.date?.start || ''
        break
      case 'checkbox':
        value = prop.checkbox
        displayValue = prop.checkbox ? 'Yes' : 'No'
        break
      case 'url':
        value = prop.url
        displayValue = prop.url || ''
        break
      case 'email':
        value = prop.email
        displayValue = prop.email || ''
        break
      case 'phone_number':
        value = prop.phone_number
        displayValue = prop.phone_number || ''
        break
      case 'created_time':
        value = prop.created_time
        displayValue = prop.created_time
        break
      case 'last_edited_time':
        value = prop.last_edited_time
        displayValue = prop.last_edited_time
        break
      default:
        value = null
        displayValue = ''
    }

    return { type, value, displayValue }
  }

  /**
   * Extract plain text from rich text array
   */
  private extractPlainText(richText: RichTextItemResponse[]): string {
    return richText.map((t) => t.plain_text).join('')
  }

  /**
   * Extract icon URL or emoji
   */
  private extractIcon(
    icon: DatabaseObjectResponse['icon'] | PageObjectResponse['icon']
  ): string | undefined {
    if (!icon) return undefined
    if (icon.type === 'emoji') return icon.emoji
    if (icon.type === 'external') return icon.external.url
    if (icon.type === 'file') return icon.file.url
    return undefined
  }

  /**
   * Extract cover image URL
   */
  private extractCover(
    cover: PageObjectResponse['cover']
  ): string | undefined {
    if (!cover) return undefined
    if (cover.type === 'external') return cover.external.url
    if (cover.type === 'file') return cover.file.url
    return undefined
  }

  /**
   * Extract options from select/multi_select/status properties
   */
  private extractPropertyOptions(
    prop: DatabaseObjectResponse['properties'][string]
  ): NotionProperty['options'] {
    if (prop.type === 'select' && prop.select?.options) {
      return prop.select.options.map((o) => ({
        id: o.id,
        name: o.name,
        color: o.color,
      }))
    }
    if (prop.type === 'multi_select' && prop.multi_select?.options) {
      return prop.multi_select.options.map((o) => ({
        id: o.id,
        name: o.name,
        color: o.color,
      }))
    }
    if (prop.type === 'status' && prop.status?.options) {
      return prop.status.options.map((o) => ({
        id: o.id,
        name: o.name,
        color: o.color,
      }))
    }
    return undefined
  }

  /**
   * Build a Notion API filter from our format
   */
  private buildFilter(
    filter: NotionQueryOptions['filter']
  ): QueryDatabaseParameters['filter'] {
    if (!filter) return undefined

    const { property, type, condition, value } = filter

    // Build the filter based on type and condition
    switch (type) {
      case 'select':
      case 'status':
        if (condition === 'equals') {
          return { property, [type]: { equals: value as string } }
        }
        if (condition === 'does_not_equal') {
          return { property, [type]: { does_not_equal: value as string } }
        }
        if (condition === 'is_empty') {
          return { property, [type]: { is_empty: true } }
        }
        if (condition === 'is_not_empty') {
          return { property, [type]: { is_not_empty: true } }
        }
        break
      case 'multi_select':
        if (condition === 'contains') {
          return { property, multi_select: { contains: value as string } }
        }
        if (condition === 'does_not_contain') {
          return { property, multi_select: { does_not_contain: value as string } }
        }
        if (condition === 'is_empty') {
          return { property, multi_select: { is_empty: true } }
        }
        if (condition === 'is_not_empty') {
          return { property, multi_select: { is_not_empty: true } }
        }
        break

      case 'checkbox':
        if (condition === 'equals') {
          return { property, checkbox: { equals: value as boolean } }
        }
        if (condition === 'does_not_equal') {
          return { property, checkbox: { does_not_equal: value as boolean } }
        }
        break

      case 'title':
      case 'rich_text': {
        if (condition === 'is_empty') {
          return { property, [type]: { is_empty: true } }
        }
        if (condition === 'is_not_empty') {
          return { property, [type]: { is_not_empty: true } }
        }
        const textFilter: Record<string, unknown> = {}
        textFilter[condition] = value
        return { property, [type]: textFilter }
      }

      case 'number': {
        if (condition === 'is_empty') {
          return { property, number: { is_empty: true } }
        }
        if (condition === 'is_not_empty') {
          return { property, number: { is_not_empty: true } }
        }
        const numFilter: Record<string, unknown> = {}
        numFilter[condition] = value
        return { property, number: numFilter }
      }

      case 'date': {
        if (condition === 'is_empty') {
          return { property, date: { is_empty: true } }
        }
        if (condition === 'is_not_empty') {
          return { property, date: { is_not_empty: true } }
        }
        const dateFilter: Record<string, unknown> = {}
        dateFilter[condition] = value
        return { property, date: dateFilter }
      }
    }

    return undefined
  }

  /**
   * Build a property value for updating
   */
  private buildPropertyValue(
    type: string,
    value: unknown
  ): Record<string, unknown> {
    switch (type) {
      case 'title':
        return {
          title: [{ type: 'text', text: { content: value as string } }],
        }
      case 'rich_text':
        return {
          rich_text: [{ type: 'text', text: { content: value as string } }],
        }
      case 'number':
        return { number: value as number }
      case 'select':
        return { select: { name: value as string } }
      case 'multi_select': {
        const names = Array.isArray(value) ? value : [value]
        return { multi_select: names.map((n) => ({ name: n as string })) }
      }
      case 'status':
        return { status: { name: value as string } }
      case 'checkbox':
        return { checkbox: value as boolean }
      case 'url':
        return { url: value as string }
      case 'date':
        return { date: { start: value as string } }
      default:
        return {}
    }
  }

  /**
   * Convert blocks to markdown
   */
  private blocksToMarkdown(blocks: NotionBlock[]): string {
    return blocks
      .map((block) => {
        switch (block.type) {
          case 'paragraph':
            return block.content + '\n'
          case 'heading_1':
            return `# ${block.content}\n`
          case 'heading_2':
            return `## ${block.content}\n`
          case 'heading_3':
            return `### ${block.content}\n`
          case 'bulleted_list_item':
            return `- ${block.content}\n`
          case 'numbered_list_item':
            return `1. ${block.content}\n`
          case 'to_do':
            return `- [ ] ${block.content}\n`
          case 'quote':
            return `> ${block.content}\n`
          case 'code':
            return `\`\`\`\n${block.content}\n\`\`\`\n`
          case 'divider':
            return '---\n'
          default:
            return block.content ? block.content + '\n' : ''
        }
      })
      .join('\n')
  }

  /**
   * Convert markdown to Notion blocks (simplified)
   */
  private markdownToBlocks(
    markdown: string
  ): Parameters<Client['blocks']['children']['append']>[0]['children'] {
    const lines = markdown.split('\n')
    const blocks: Parameters<
      Client['blocks']['children']['append']
    >[0]['children'] = []

    for (const line of lines) {
      if (!line.trim()) continue

      if (line.startsWith('### ')) {
        blocks.push({
          type: 'heading_3',
          heading_3: {
            rich_text: [{ type: 'text', text: { content: line.slice(4) } }],
          },
        })
      } else if (line.startsWith('## ')) {
        blocks.push({
          type: 'heading_2',
          heading_2: {
            rich_text: [{ type: 'text', text: { content: line.slice(3) } }],
          },
        })
      } else if (line.startsWith('# ')) {
        blocks.push({
          type: 'heading_1',
          heading_1: {
            rich_text: [{ type: 'text', text: { content: line.slice(2) } }],
          },
        })
      } else if (line.startsWith('- [ ] ')) {
        blocks.push({
          type: 'to_do',
          to_do: {
            rich_text: [{ type: 'text', text: { content: line.slice(6) } }],
            checked: false,
          },
        })
      } else if (line.startsWith('- [x] ')) {
        blocks.push({
          type: 'to_do',
          to_do: {
            rich_text: [{ type: 'text', text: { content: line.slice(6) } }],
            checked: true,
          },
        })
      } else if (line.startsWith('- ')) {
        blocks.push({
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{ type: 'text', text: { content: line.slice(2) } }],
          },
        })
      } else if (line.startsWith('> ')) {
        blocks.push({
          type: 'quote',
          quote: {
            rich_text: [{ type: 'text', text: { content: line.slice(2) } }],
          },
        })
      } else if (line.startsWith('---')) {
        blocks.push({
          type: 'divider',
          divider: {},
        })
      } else {
        blocks.push({
          type: 'paragraph',
          paragraph: {
            rich_text: [{ type: 'text', text: { content: line } }],
          },
        })
      }
    }

    return blocks
  }
}

// Export singleton instance
export const notionService = new NotionServiceImpl()
