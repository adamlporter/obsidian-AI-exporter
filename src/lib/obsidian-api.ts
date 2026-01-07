/**
 * Obsidian Local REST API client
 * API docs: https://github.com/coddingtonbear/obsidian-local-rest-api
 */

export interface ObsidianApiError {
  status: number;
  message: string;
}

export class ObsidianApiClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(port: number, apiKey: string) {
    this.baseUrl = `http://127.0.0.1:${port}`;
    this.apiKey = apiKey;
  }

  /**
   * Get authorization headers
   */
  private getHeaders(): HeadersInit {
    return {
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get file content from vault
   * @param path - Path relative to vault root (e.g., "AI/Gemini/conversation.md")
   * @returns File content as string, or null if file doesn't exist
   */
  async getFile(path: string): Promise<string | null> {
    try {
      const encodedPath = encodeURIComponent(path);
      const response = await fetch(`${this.baseUrl}/vault/${encodedPath}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw this.createError(response.status, `Failed to get file: ${response.statusText}`);
      }

      return await response.text();
    } catch (error) {
      if (error instanceof Error && error.message.includes('Failed to fetch')) {
        throw this.createError(0, 'Obsidian REST API is not running');
      }
      throw error;
    }
  }

  /**
   * Create or update file in vault
   * @param path - Path relative to vault root
   * @param content - File content (markdown)
   */
  async putFile(path: string, content: string): Promise<void> {
    try {
      const encodedPath = encodeURIComponent(path);
      const response = await fetch(`${this.baseUrl}/vault/${encodedPath}`, {
        method: 'PUT',
        headers: {
          ...this.getHeaders(),
          'Content-Type': 'text/markdown',
        },
        body: content,
      });

      if (!response.ok) {
        throw this.createError(response.status, `Failed to save file: ${response.statusText}`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('Failed to fetch')) {
        throw this.createError(0, 'Obsidian REST API is not running');
      }
      throw error;
    }
  }

  /**
   * Check if file exists in vault
   * @param path - Path relative to vault root
   */
  async fileExists(path: string): Promise<boolean> {
    try {
      const content = await this.getFile(path);
      return content !== null;
    } catch {
      return false;
    }
  }

  /**
   * Create an API error object
   */
  private createError(status: number, message: string): ObsidianApiError {
    return { status, message };
  }
}

/**
 * Type guard for ObsidianApiError
 */
export function isObsidianApiError(error: unknown): error is ObsidianApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    'message' in error
  );
}

/**
 * Get user-friendly error message
 */
export function getErrorMessage(error: unknown): string {
  if (isObsidianApiError(error)) {
    switch (error.status) {
      case 0:
        return 'Obsidian REST API is not running. Please ensure Obsidian is open and the Local REST API plugin is enabled.';
      case 401:
      case 403:
        return 'Invalid API key. Please check your settings.';
      case 404:
        return 'File not found in vault.';
      default:
        return error.message;
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unknown error occurred';
}
