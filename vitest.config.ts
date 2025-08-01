import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'src/**/__tests__/**/*.test.ts',
      'src/**/?(*.)+(spec|test).ts'
    ],
    exclude: [
      'node_modules',
      'dist',
      'coverage'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/__tests__/**',
        'src/services/emailStateManager.ts',
        'src/services/emailDatabase.ts'
      ],
      thresholds: {
        branches: 40,
        functions: 40,
        lines: 40,
        statements: 40
      }
    }
  }
});