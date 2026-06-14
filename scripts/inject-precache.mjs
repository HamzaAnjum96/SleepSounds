// Post-build: fill the service worker's precache list with the real, content
// hashed files Vite emitted, and stamp the cache name with a build id so each
// deploy installs fresh. Runs after `vite build` (see package.json).
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const DIST = 'dist';
const SW = join(DIST, 'sw.js');

/** Recursively list files under a dist subdir as scope-relative './…' urls. */
function listDir(rel) {
  const abs = join(DIST, rel);
  let entries;
  try { entries = readdirSync(abs); } catch { return []; }
  const out = [];
  for (const name of entries) {
    const childRel = `${rel}/${name}`;
    if (statSync(join(DIST, childRel)).isDirectory()) out.push(...listDir(childRel));
    else out.push(`./${childRel}`);
  }
  return out;
}

const assets = [
  ...listDir('assets'),
  ...listDir('fonts'),
  ...listDir('worklets'),
];

// Build id: a short hash over the precached file names, so the cache version
// changes exactly when the asset set changes.
const version = createHash('sha256').update(assets.sort().join('|')).digest('hex').slice(0, 10);

const literal = assets.map((p) => `  '${p}',`).join('\n');

let sw = readFileSync(SW, 'utf8');
sw = sw.replace('__CACHE_VERSION__', version);
sw = sw.replace('  /*__INJECT_ASSETS__*/', literal);
writeFileSync(SW, sw);

console.log(`[sw] precached ${assets.length} assets, cache drift-away-${version}`);
