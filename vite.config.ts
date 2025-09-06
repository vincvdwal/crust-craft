import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        outDir: 'data',
        chunkSizeWarningLimit: 1000
    }
});
