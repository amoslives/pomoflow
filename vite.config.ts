import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

// Emits sw.js with the built file list, so the installed app can open offline.
// The version changes with any built file, so each deploy replaces the old cache.
function serviceWorker(): Plugin {
  return {
    name: 'pomoflow-service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle).filter((name) => name !== 'index.html' && !name.endsWith('.map')).sort();
      const precache = ['/', '/manifest.webmanifest', '/icon-apple2.svg', ...built.map((name) => `/${name}`)];
      const page = bundle['index.html'];
      const version = createHash('sha256')
        .update(JSON.stringify(precache))
        .update(page?.type === 'asset' ? page.source : '')
        .digest('hex')
        .slice(0, 12);
      const template = fs.readFileSync(path.resolve(__dirname, 'tooling/service-worker.js'), 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template.replace('__VERSION__', JSON.stringify(version)).replace('__PRECACHE__', JSON.stringify(precache)),
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), serviceWorker()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled via the DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during rapid edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during rapid edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
