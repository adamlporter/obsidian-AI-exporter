/**
 * Generate a hash string for content deduplication
 *
 * Uses a variant of the djb2 algorithm for fast, consistent hashing.
 * This is NOT cryptographically secure - use only for content fingerprinting
 * and deduplication purposes.
 *
 * Algorithm: hash = ((hash << 5) - hash) + charCode
 * Equivalent to: hash = hash * 31 + charCode
 *
 * @param content - The string content to hash
 * @returns 8-character hexadecimal hash string (32-bit hash as hex)
 *
 * @example
 * ```typescript
 * const hash = generateHash('Hello, World!');
 * // Returns: "7c211433" (example output)
 * ```
 *
 * @remarks
 * - Deterministic: Same input always produces same output
 * - Fast: O(n) complexity where n is string length
 * - Collision-resistant for typical use cases (not cryptographic)
 * - Output format: 8 hex characters, zero-padded
 */
export function generateHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash | 0; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}
