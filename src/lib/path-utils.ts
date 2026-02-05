/**
 * Path security utilities
 * Prevents path traversal attacks
 */

/**
 * Detect path traversal attacks
 *
 * Note: A naive path.includes('..') would produce false positives for
 * legitimate filenames like foo..bar, so a more precise regex is used.
 */
export function containsPathTraversal(path: string): boolean {
  // Detect ../ or ..\ only when combined with path separators:
  // ^..   : leading ..
  // /.. or \.. : .. after path separator
  // ../ or ..\ : .. before path separator
  // ..$   : trailing ..
  if (/(?:^|[\\/])\.\.(?:[\\/]|$)/.test(path)) return true;
  // Detect absolute paths
  if (path.startsWith('/') || /^[a-zA-Z]:/.test(path)) return true;
  // Detect URL-encoded .. combined with path separators
  if (/(?:^|%2f|%5c)%2e%2e(?:%2f|%5c|$)/i.test(path)) return true;
  return false;
}

/**
 * Normalize and validate a path
 */
export function validatePath(path: string, fieldName: string): string {
  if (containsPathTraversal(path)) {
    throw new Error(`Invalid ${fieldName}: path traversal detected`);
  }
  // Trim whitespace and normalize leading/trailing slashes
  return path.trim().replace(/^\/+|\/+$/g, '');
}
