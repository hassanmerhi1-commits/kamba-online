import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // The built admin lives under /admin on the Kamba server.
  base: command === 'build' ? '/admin/' : '/',
  server: { port: 5173 },
}));
