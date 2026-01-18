/**
 * Mailmap Types
 *
 * Types for .mailmap author identity mapping operations.
 */

export interface AuthorIdentity {
  name: string
  email: string
  commitCount: number
}

export interface MailmapSuggestion {
  canonicalName: string
  canonicalEmail: string
  aliases: AuthorIdentity[]
  confidence: 'high' | 'medium' | 'low'
}

export interface MailmapEntry {
  canonicalName: string
  canonicalEmail: string
  aliasName?: string
  aliasEmail: string
}

export interface MailmapResult {
  success: boolean
  message: string
}
