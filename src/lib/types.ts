/**
 * Shared TypeScript types for Gemini to Obsidian extension
 */

/**
 * Represents a single message in a conversation
 */
export interface ConversationMessage {
  /** Unique message identifier */
  id: string;
  /** Message author role */
  role: 'user' | 'assistant';
  /** Message content (plain text for user, may contain HTML for assistant) */
  content: string;
  /** Original HTML content (for assistant messages, used in HTML→Markdown conversion) */
  htmlContent?: string;
  /** Message timestamp (reserved for future use - not currently extracted) */
  timestamp?: Date;
  /** Zero-based message order in conversation */
  index: number;
}

/**
 * Extracted conversation data
 */
export interface ConversationData {
  id: string;
  title: string;
  url: string;
  source: 'gemini' | 'claude' | 'perplexity';
  type?: 'conversation' | 'deep-research';
  /** Deep Research link information (optional) */
  links?: DeepResearchLinks;
  messages: ConversationMessage[];
  extractedAt: Date;
  metadata: ConversationMetadata;
}

/**
 * Deep Research source information
 *
 * Design: Sources are stored in DOM order (0-based array).
 * Mapping to data-turn-source-index (1-based):
 *   data-turn-source-index="N" → sources[N-1]
 */
export interface DeepResearchSource {
  /** 0-based array index (DOM order) */
  index: number;
  /** Source URL */
  url: string;
  /** Source title */
  title: string;
  /** Domain name */
  domain: string;
}

/**
 * Deep Research links extraction result
 *
 * Design: Only sources array is stored. Inline citations are processed
 * during HTML→Markdown conversion using data-turn-source-index attribute.
 */
export interface DeepResearchLinks {
  /** Source list (DOM order, 0-based index) */
  sources: DeepResearchSource[];
}

/**
 * Additional metadata about the conversation
 */
export interface ConversationMetadata {
  /** Total number of messages */
  messageCount: number;
  /** Number of user messages */
  userMessageCount: number;
  /** Number of assistant (AI) messages */
  assistantMessageCount: number;
  /** Whether conversation contains code blocks */
  hasCodeBlocks: boolean;
  /** Estimated token count (reserved for future use - not currently calculated) */
  estimatedTokens?: number;
}

/**
 * Obsidian note structure
 */
export interface ObsidianNote {
  fileName: string;
  frontmatter: NoteFrontmatter;
  body: string;
  contentHash: string;
}

/**
 * YAML frontmatter fields
 */
export interface NoteFrontmatter {
  id: string;
  title: string;
  source: string;
  type?: string;
  url: string;
  created: string;
  modified: string;
  tags: string[];
  message_count: number;
}

/**
 * セキュア設定（local storage用）
 * API Keyなどの機密データはsyncではなくlocalに保存
 */
export interface SecureSettings {
  obsidianApiKey: string;
}

/**
 * 同期設定（sync storage用）
 * 非機密データはデバイス間同期可能
 */
export interface SyncSettings {
  obsidianPort: number;
  vaultPath: string;
  templateOptions: TemplateOptions;
}

/**
 * Extension settings stored in chrome.storage
 * Combined interface merging SecureSettings and SyncSettings
 */
export interface ExtensionSettings extends SecureSettings, SyncSettings {
  /** OpenAI API key for AI-powered features (reserved for future use) */
  openaiApiKey?: string;
  /** Enable automatic tag generation (reserved for future use) */
  enableAutoTags?: boolean;
}

/**
 * Template customization options
 */
export interface TemplateOptions {
  /** Include conversation ID in frontmatter */
  includeId: boolean;
  /** Include title in frontmatter */
  includeTitle: boolean;
  /** Include tags in frontmatter */
  includeTags: boolean;
  /** Include source platform in frontmatter */
  includeSource: boolean;
  /** Include created/modified dates in frontmatter */
  includeDates: boolean;
  /** Include message count in frontmatter */
  includeMessageCount: boolean;
  /** Message formatting style */
  messageFormat: 'callout' | 'plain' | 'blockquote';
  /** Callout type for user messages (e.g., 'QUESTION') */
  userCalloutType: string;
  /** Callout type for assistant messages (e.g., 'NOTE') */
  assistantCalloutType: string;
  /** Custom frontmatter fields (reserved for future use) */
  customFrontmatter?: Record<string, string>;
}

/**
 * Message types for chrome.runtime communication
 */
export type ExtensionMessage =
  | { action: 'saveToObsidian'; data: ObsidianNote }
  | { action: 'getExistingFile'; fileName: string; vaultPath: string }
  | { action: 'getSettings' }
  | { action: 'testConnection' };

/**
 * Response from background service worker
 */
export interface SaveResponse {
  success: boolean;
  error?: string;
  isNewFile?: boolean;
  messagesAppended?: number;
}

/**
 * Extraction result from content script
 */
export interface ExtractionResult {
  success: boolean;
  data?: ConversationData;
  error?: string;
  warnings?: string[];
}

/**
 * Validation result for extraction quality
 */
export interface ValidationResult {
  isValid: boolean;
  warnings: string[];
  errors: string[];
}

/**
 * Interface for AI platform extractors
 */
export interface IConversationExtractor {
  readonly platform: 'gemini' | 'claude' | 'perplexity';
  canExtract(): boolean;
  extract(): Promise<ExtractionResult>;
  getConversationId(): string | null;
  getTitle(): string;
  extractMessages(): ConversationMessage[];
  validate(result: ExtractionResult): ValidationResult;
}
