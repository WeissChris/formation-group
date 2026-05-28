import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      // Match the Next.js `@/*` alias used everywhere in the codebase
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['lib/**/*.test.ts', 'test/**/*.test.ts'],
    // Coverage opt-in via `npm run test:coverage`
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['lib/**/*.ts'],
      exclude: ['lib/**/*.test.ts', 'lib/seed.ts', 'lib/itemLibrary.ts'],
    },
  },
})
