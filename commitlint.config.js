/**
 * commitlint configuration for Release Please compatibility
 *
 * Format: "<type>: <emoji> <subject>"
 * Example: "feat: ✨ add new feature"
 *
 * This format ensures Release Please can parse the conventional commit type
 * while preserving emoji in the subject line for visual clarity.
 *
 * Supported type-emoji mappings (emoji in subject):
 * feat     ✨ - New feature
 * fix      🐛 - Bug fix
 * docs     📝 - Documentation
 * style    🎨 - Code style/formatting
 * refactor ♻️  - Code refactoring
 * perf     ⚡️ - Performance improvement
 * test     ✅ - Tests
 * chore    🔧 - Build/maintenance
 * security 🔒 - Security fix
 */
export default {
  extends: ['@commitlint/config-conventional'],
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
    'header-max-length': [2, 'always', 100],
  },
};
