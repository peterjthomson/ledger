/**
 * Preview Provider Registry
 *
 * Central registry for all preview providers. Built-in providers are
 * registered at startup. Plugins can register additional providers.
 */

import type { PreviewProvider, ProviderAvailability } from './preview-types'

/**
 * Provider with its availability status
 */
export interface ProviderWithAvailability {
  provider: PreviewProvider
  availability: ProviderAvailability
}

/**
 * Registry of all available preview providers
 */
class PreviewProviderRegistry {
  private providers = new Map<string, PreviewProvider>()

  /**
   * Register a preview provider
   */
  register(provider: PreviewProvider): void {
    if (this.providers.has(provider.id)) {
      console.warn(`[Preview] Provider "${provider.id}" already registered, replacing`)
    }
    this.providers.set(provider.id, provider)
    console.info(`[Preview] Registered provider: ${provider.name} (${provider.id})`)
  }

  /**
   * Unregister a provider (for plugin cleanup)
   */
  unregister(providerId: string): boolean {
    const existed = this.providers.has(providerId)
    this.providers.delete(providerId)
    if (existed) {
      console.info(`[Preview] Unregistered provider: ${providerId}`)
    }
    return existed
  }

  /**
   * Get a specific provider
   */
  get(providerId: string): PreviewProvider | undefined {
    return this.providers.get(providerId)
  }

  /**
   * Get all registered providers
   */
  getAll(): PreviewProvider[] {
    return Array.from(this.providers.values())
  }

  /**
   * Get all provider IDs
   */
  getIds(): string[] {
    return Array.from(this.providers.keys())
  }

  /**
   * Get available providers for a project.
   * Returns providers sorted by compatibility (compatible first).
   *
   * @param repoPath - Main repository path
   * @param targetPath - Specific path to check (worktree path)
   */
  async getAvailableProviders(
    repoPath: string,
    targetPath?: string
  ): Promise<ProviderWithAvailability[]> {
    const results = await Promise.all(
      this.getAll().map(async (provider) => {
        try {
          const availability = await provider.checkAvailability(repoPath, targetPath)
          return { provider, availability }
        } catch (error) {
          console.error(`[Preview] Error checking ${provider.id}:`, error)
          return {
            provider,
            availability: {
              available: false,
              compatible: false,
              reason: `Error: ${(error as Error).message}`,
            },
          }
        }
      })
    )

    // Sort: available+compatible first, then available, then others
    return results.sort((a, b) => {
      const scoreA = (a.availability.available ? 2 : 0) + (a.availability.compatible ? 1 : 0)
      const scoreB = (b.availability.available ? 2 : 0) + (b.availability.compatible ? 1 : 0)
      return scoreB - scoreA
    })
  }

  /**
   * Get the best (first compatible) provider for a project
   */
  async getBestProvider(
    repoPath: string,
    targetPath?: string
  ): Promise<ProviderWithAvailability | null> {
    const providers = await this.getAvailableProviders(repoPath, targetPath)
    const compatible = providers.find((p) => p.availability.available && p.availability.compatible)
    return compatible || null
  }

  /**
   * Stop all running previews from all providers
   */
  stopAll(): void {
    for (const provider of this.providers.values()) {
      if (provider.stopAll) {
        try {
          provider.stopAll()
        } catch (error) {
          console.error(`[Preview] Error stopping ${provider.id}:`, error)
        }
      }
    }
  }
}

// Singleton instance
export const previewRegistry = new PreviewProviderRegistry()
