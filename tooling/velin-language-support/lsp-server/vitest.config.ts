import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts'],
    environment: 'node',
    // TypeScript service integration tests spin up a real ts-morph program on
    // every call — cold-start easily exceeds the 5s default.
    testTimeout: 30000,
  },
});
