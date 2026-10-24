import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist-smoke',
    lib: {
      entry: 'src/test/dependencySmoke.ts',
      formats: ['es'],
      fileName: 'dependency-smoke',
    },
  },
});
