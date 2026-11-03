import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Schnelle Tests der Logik (ohne Browser). Handy-Bausteine werden durch kleine Ersatzmodule ersetzt.
export default defineConfig({
  resolve: {
    alias: {
      'react-native': path.resolve(import.meta.dirname, 'tests/stubs/react-native.ts'),
      '@react-native-async-storage/async-storage': path.resolve(import.meta.dirname, 'tests/stubs/async-storage.ts'),
    },
  },
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node', testTimeout: 30_000 },
});
