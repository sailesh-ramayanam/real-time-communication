import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In Docker, nginx proxies /api. For `npm run dev`, Vite does the same.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: process.env.ORDER_SERVICE_URL ?? 'http://localhost:3000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
