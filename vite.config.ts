import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        about: resolve(__dirname, 'about.html'),
        bookings: resolve(__dirname, 'bookings.html'),
        contact: resolve(__dirname, 'contact.html'),
        dashboard: resolve(__dirname, 'dashboard.html'),
        register: resolve(__dirname, 'register.html'),
        workerProfile: resolve(__dirname, 'worker-profile.html'),
        workers: resolve(__dirname, 'workers.html'),
      },
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
});
