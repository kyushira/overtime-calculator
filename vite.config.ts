import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Fixed port so this app never collides with other Vite apps on 5173.
  // strictPort: fail loudly instead of silently moving to another port.
  server: { port: 5280, strictPort: true },
  // allowedHosts: lets a temporary Cloudflare quick tunnel (*.trycloudflare.com) reach the preview build.
  preview: { port: 5281, strictPort: true, allowedHosts: ['.trycloudflare.com'] },
});
