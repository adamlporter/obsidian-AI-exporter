/**
 * YAML安全化ユーティリティ
 * YAML injection攻撃を防止
 */

/**
 * YAML文字列値をエスケープ
 * YAML 1.2仕様に準拠し、特殊文字を含む場合はダブルクォートで囲む
 *
 * 対応する特殊文字:
 * - YAML構文文字: : [ ] { } # & * ! | > ' " % @ `
 * - 制御文字: \n \r \t
 * - Unicode行終端: U+0085 (NEL), U+2028 (LS), U+2029 (PS)
 * - 予約語: null, true, false, ~
 */
export function escapeYamlValue(value: string): string {
  // 特殊文字を含む場合はクォートが必要
  const needsQuotes =
    /[:\[\]{}#&*!|>'"%@`\n\r\t\u0085\u2028\u2029]/.test(value) ||
    value.startsWith(' ') ||
    value.endsWith(' ') ||
    value === '' ||
    /^(null|true|false|~|yes|no|on|off)$/i.test(value) ||
    /^[0-9.+-]/.test(value); // 数値として解釈される可能性

  if (!needsQuotes) {
    return value;
  }

  // ダブルクォートでエスケープ
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/\u0085/g, '\\N') // NEL (Next Line)
    .replace(/\u2028/g, '\\L') // LS (Line Separator)
    .replace(/\u2029/g, '\\P'); // PS (Paragraph Separator)

  return `"${escaped}"`;
}

/**
 * YAMLリスト項目をエスケープ
 */
export function escapeYamlListItem(value: string): string {
  return escapeYamlValue(value);
}
