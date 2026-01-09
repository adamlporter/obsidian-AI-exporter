/**
 * パスセキュリティユーティリティ
 * パストラバーサル攻撃を防止
 */

/**
 * パストラバーサル攻撃の検出
 *
 * 注意: 単純な path.includes('..') は foo..bar のような
 * 正当なファイル名を誤検出するため、より正確な正規表現を使用
 */
export function containsPathTraversal(path: string): boolean {
  // ../ または ..\ を検出（パス区切り文字と組み合わさった場合のみ）
  // ^.. : 先頭の..
  // /.. or \.. : パス区切り後の..
  // ../ or ..\ : ..の後にパス区切り
  // ..$ : 末尾の..
  if (/(?:^|[\\/])\.\.(?:[\\/]|$)/.test(path)) return true;
  // 絶対パスを検出
  if (path.startsWith('/') || /^[a-zA-Z]:/.test(path)) return true;
  // URLエンコードされた .. を検出（パス区切りと組み合わせ）
  if (/(?:^|%2f|%5c)%2e%2e(?:%2f|%5c|$)/i.test(path)) return true;
  return false;
}

/**
 * パスを正規化してバリデーション
 */
export function validatePath(path: string, fieldName: string): string {
  if (containsPathTraversal(path)) {
    throw new Error(`Invalid ${fieldName}: path traversal detected`);
  }
  // 前後の空白とスラッシュを正規化
  return path.trim().replace(/^\/+|\/+$/g, '');
}

/**
 * 安全なファイルパスを構築
 */
export function buildSafePath(vaultPath: string, fileName: string): string {
  const safePath = validatePath(vaultPath, 'vaultPath');
  const safeFileName = validatePath(fileName, 'fileName');
  return safePath ? `${safePath}/${safeFileName}` : safeFileName;
}
