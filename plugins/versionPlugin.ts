/**
 * Vite plugin: VersionStamp
 * - Generates `public/version.json` with a unique build hash at build time.
 * - Injects `__APP_VERSION__` as a global constant available at runtime.
 * - The companion hook `useVersionCheck` polls `version.json` periodically
 *   to detect when a newer build has been deployed.
 */
import type { Plugin } from 'vite';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { createHash } from 'crypto';

export function versionStampPlugin(): Plugin {
  let buildHash = '';

  return {
    name: 'version-stamp',

    config(_, { command }) {
      // Generate a unique hash per build from the current timestamp + random salt
      const raw = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      buildHash = createHash('md5').update(raw).digest('hex').slice(0, 12);

      return {
        define: {
          '__APP_VERSION__': JSON.stringify(buildHash),
        },
      };
    },

    // Write version.json to the output dir AFTER build completes
    writeBundle(options) {
      const outDir = options.dir || resolve(process.cwd(), 'dist');
      const versionData = JSON.stringify(
        { version: buildHash, builtAt: new Date().toISOString() },
        null,
        2
      );
      writeFileSync(resolve(outDir, 'version.json'), versionData, 'utf-8');
    },

    // Also write to public/ so `vite dev` can serve it (optional, for local testing)
    buildStart() {
      const publicDir = resolve(process.cwd(), 'public');
      mkdirSync(publicDir, { recursive: true });
      const versionData = JSON.stringify(
        { version: buildHash, builtAt: new Date().toISOString() },
        null,
        2
      );
      writeFileSync(resolve(publicDir, 'version.json'), versionData, 'utf-8');
    },
  };
}
