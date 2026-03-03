import { defineConfig } from 'vite';

export default defineConfig({
    server: {
        host: true,
        allowedHosts: true,
        port: 1920,
        strictPort: false,
    },
    preview: {
        host: true,
        allowedHosts: true,
        port: 1920,
        strictPort: false,
    },
});
