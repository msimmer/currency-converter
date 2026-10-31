import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { build, defineConfig, type Plugin, type ResolvedConfig } from 'vite';

// Files in public/ the app needs offline; the build adds its own output to these.
const PUBLIC_SHELL = [
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

// Builds src/sw.ts to sw.js beside the app, as its own lib build: a service worker
// needs a fixed (unhashed) URL and a single classic script. It's given the app's
// file list to precache, and a version that changes whenever any of those files do,
// so a deploy always installs a fresh shell.
function serviceWorker(): Plugin {
  let config: ResolvedConfig;
  let files: string[] = [];
  let version = '';

  return {
    name: 'rates:service-worker',
    apply: 'build',
    configResolved(resolved) {
      config = resolved;
    },
    async writeBundle(_, bundle) {
      const output = Object.keys(bundle).filter((f) => !f.endsWith('.map')).sort();
      const hash = createHash('sha256');
      for (const f of output) {
        const item = bundle[f];
        hash.update(item.type === 'chunk' ? item.code : item.source);
      }
      for (const f of PUBLIC_SHELL) hash.update(await readFile(path.join(config.publicDir, f)));
      files = ['./', ...output, ...PUBLIC_SHELL];
      version = hash.digest('hex').slice(0, 10);
    },
    async closeBundle() {
      await build({
        configFile: false,
        root: config.root,
        publicDir: false,
        logLevel: 'warn',
        define: {
          __SHELL_FILES__: JSON.stringify(files),
          __SHELL_VERSION__: JSON.stringify(version),
        },
        build: {
          outDir: path.resolve(config.root, config.build.outDir),
          emptyOutDir: false,
          lib: { entry: 'src/sw.ts', formats: ['iife'], name: 'sw', fileName: () => 'sw.js' },
        },
      });
      config.logger.info(`sw.js: shell-${version}, ${files.length} files precached`);
    },
  };
}

export default defineConfig({
  // Relative, so the same build works on GitHub Pages (/currency-converter/) and locally.
  base: './',
  plugins: [react(), serviceWorker()],
  server: { port: 8642 },
  preview: { port: 8642 },
});
