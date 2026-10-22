import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts so tests run without the IWSDK dev plugin.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
