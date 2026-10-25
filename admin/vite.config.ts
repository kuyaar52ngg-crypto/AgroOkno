import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// Режим заглушек: `npm run dev:mock` (mode=mock) или VITE_MOCK=1. Флаг подставляется в код статически,
// поэтому в обычной сборке src/api/mock.ts в бандл не попадает.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const mock = mode === 'mock' || env.VITE_MOCK === '1';
  return {
    plugins: [react()],
    define: { 'import.meta.env.VITE_MOCK': JSON.stringify(mock ? '1' : '') },
    server: { host: '127.0.0.1' },
  };
});
