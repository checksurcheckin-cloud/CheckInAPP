import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Port distinct du web-manager (5173) : les deux tournent souvent ensemble.
// 127.0.0.1 explicite : par défaut Vite n'écoute que sur ::1 (IPv6), et un
// navigateur qui résout localhost en IPv4 ne trouve alors pas la console.
// Jamais exposé au réseau local (pas de host: true) : c'est une console
// interne qui voit toutes les entreprises.
export default defineConfig({
  plugins: [react()],
  server: { port: 5174, host: '127.0.0.1', strictPort: true },
});
