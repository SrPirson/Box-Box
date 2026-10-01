import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// En desarrollo, /socket.io se redirige al servidor de BOX (npm run server).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/socket.io': { target: 'ws://localhost:3000', ws: true } } },
});
