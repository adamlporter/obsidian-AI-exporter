import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/lib/types.ts',    // Type definitions only
        'src/popup/index.ts',  // P5 - exclude until Phase 5
      ],
      // Phase 4 thresholds (75%) - update as coverage improves
      thresholds: {
        statements: 75,
        branches: 68,
        functions: 75,
        lines: 75,
      },
    },
  },
});
