import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/extension.ts'],
    },
  },
  resolve: {
    alias: {
      vscode: path.resolve(__dirname, './src/__mocks__/vscode.ts'),
    },
  },
});
