import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: ['tooling/**', 'node_modules/**', 'dist/**'],
  },
  define: {
    __DEV__: true,
  },
})
