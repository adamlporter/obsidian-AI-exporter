/**
 * commitlint configuration with emoji prefix support
 *
 * Format: "<emoji> <type>: <subject>"
 * Example: "✨ feat: add new feature"
 *
 * Supported emoji mappings:
 * ✨ feat     - New feature
 * 🐛 fix      - Bug fix
 * 📝 docs     - Documentation
 * 🎨 style    - Code style/formatting
 * ♻️  refactor - Code refactoring
 * ⚡️ perf     - Performance improvement
 * ✅ test     - Tests
 * 🔧 chore    - Build/maintenance
 * 🔒 security - Security fix
 */
export default {
  parserPreset: {
    parserOpts: {
      // Regex: emoji + space + type + optional(scope) + colon + space + subject
      headerPattern:
        /^(?:\p{Emoji_Presentation}|\p{Extended_Pictographic})\s+(\w+)(?:\(([^)]+)\))?:\s+(.+)$/u,
      headerCorrespondence: ['type', 'scope', 'subject'],
    },
  },
  rules: {
    'type-enum': [
      2, // Error level
      'always',
      [
        'feat', // New feature
        'fix', // Bug fix
        'docs', // Documentation
        'style', // Code style
        'refactor', // Refactoring
        'perf', // Performance
        'test', // Tests
        'chore', // Maintenance
        'revert', // Revert commit
        'build', // Build system
        'ci', // CI configuration
        'security', // Security fix
        'ui', // UI changes
        'release', // Release
      ],
    ],
    'type-case': [2, 'always', 'lower-case'],
    'type-empty': [2, 'never'],
    'subject-empty': [2, 'never'],
    'header-max-length': [2, 'always', 100],
  },
};
