import type { SecretStorage, ExtensionContext } from 'vscode';

/** SecretStorage key under which the MiniMax Subscription Key is stored. */
export const API_KEY_SECRET = 'minimaxUsage.apiKey';

/**
 * Thin wrapper over VS Code's `SecretStorage` API. We never log the key, never
 * write it to settings.json, and never include it in error reports.
 */
export class SecretsStore {
  private readonly storage: SecretStorage;
  /** Whether a key is currently stored (cached to avoid repeated reads). */
  private cached: boolean | null = null;

  constructor(context: ExtensionContext) {
    this.storage = context.secrets;
  }

  /** Returns the stored key, or `undefined` if none is set. */
  async getApiKey(): Promise<string | undefined> {
    const v = await this.storage.get(API_KEY_SECRET);
    this.cached = v !== undefined && v.length > 0;
    return v && v.length > 0 ? v : undefined;
  }

  /** Stores the key (overwriting any previous value). */
  async setApiKey(key: string): Promise<void> {
    const trimmed = key.trim();
    if (!trimmed) {
      throw new Error('API key must be non-empty');
    }
    await this.storage.store(API_KEY_SECRET, trimmed);
    this.cached = true;
  }

  /** Deletes the stored key. No-op if none is set. */
  async clearApiKey(): Promise<void> {
    await this.storage.delete(API_KEY_SECRET);
    this.cached = false;
  }

  /** Returns whether a key is currently stored (uses a cache to avoid repeated reads). */
  async hasApiKey(): Promise<boolean> {
    if (this.cached !== null) return this.cached;
    const k = await this.getApiKey();
    return k !== undefined;
  }

  /** Invalidates the cached "has key" flag. Call after any external write. */
  invalidateCache(): void {
    this.cached = null;
  }
}
