import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      // Ignore large files and directories that can cause issues
      ignored: [
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/.git/**',
        '**/*.png',           // Ignore PNG images to prevent EBUSY errors
        '**/*.jpg',           // Ignore JPG images
        '**/*.jpeg',          // Ignore JPEG images
        '**/*.gif',           // Ignore GIF images
        '**/*.svg',           // Ignore SVG images
        '**/*.bmp',           // Ignore BMP images
        '**/*.tiff',          // Ignore TIFF images
        '**/backup/**',       // Ignore backup directory
        '**/temp_restore/**', // Ignore temp restore directory
        '**/logs/**',         // Ignore log files
      ],
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
