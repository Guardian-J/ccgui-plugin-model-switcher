import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/mockData',
        'scripts/',
        'src/index.tsx',
        'src/components/**',
        'src/icons.tsx',
      ],
    },
  },
});
