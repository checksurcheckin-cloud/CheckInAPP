import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Port distinct du web-manager (5173) : les deux tournent souvent ensemble.
export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
});
