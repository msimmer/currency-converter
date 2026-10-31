import { execSync } from 'node:child_process';
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

// Shown in Settings → About: the build date and commit, e.g. "2026.10.31 (a3234b9)".
// A "+" after the commit means the build had uncommitted changes.
function appVersion(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
  try {
    const commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim() ? '+' : '';
    return `${date} (${commit}${dirty})`;
  } catch {
    return date;
  }
}

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  // Relative, so the same build works on GitHub Pages (/currency-converter/) and locally.
  base: './',
  plugins: [react(), serviceWorker()],
  server: { port: 8642 },
  preview: { port: 8642 },
});
