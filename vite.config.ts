import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { sgcarmartProxy } from './server/sgcarmartProxy.ts';

export default defineConfig({
  // sgcarmartProxy: dev + preview only; the browser fetches listings via /api/sgcarmart (no CORS).
  plugins: [react(), tailwindcss(), sgcarmartProxy()],
  // Fixed port so this app never collides with other Vite apps on 5173.
  // strictPort: fail loudly instead of silently moving to another port.
  server: { port: 5280, strictPort: true },
  // allowedHosts: lets a temporary Cloudflare quick tunnel (*.trycloudflare.com) reach the preview build.
  preview: { port: 5281, strictPort: true, allowedHosts: ['.trycloudflare.com'] },
});
