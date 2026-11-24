import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      allowedHosts: true,
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/dnd-pdf-proxy': {
          target: 'https://media.wizards.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/dnd-pdf-proxy/, ''),
        }
      }
    },
  };
});
