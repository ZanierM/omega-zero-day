import { defineConfig } from 'vite';

export default defineConfig({
  // relative paths so the build works at any URL (GitHub Pages subpath included)
  base: './',
  server: {
    port: Number(process.env.PORT) || 5173,
    strictPort: !!process.env.PORT,
  },
});
