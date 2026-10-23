import { defineConfig } from 'tsup';

// Бандл сервера: общий код из ../app/src/reports и ../app/api/_lib попадает в сборку,
// npm-пакеты (fastify, exceljs, pdf-lib…) остаются внешними и ставятся из server/package.json.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  shims: false,
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
