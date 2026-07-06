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

// The stable-named shell files the SW also precaches (see PRECACHE in
// public/sw.js; './' is index.html). They must be part of the build id too.
const shellFiles = [
  'index.html', 'manifest.json', 'privacy.html', 'favicon.svg',
  'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'fonts.css',
];

// Build id: a hash over every precached file's name AND bytes. Hashing names
// alone (the original scheme) meant an asset edited *in place* — a re-subset
// icon font, a retuned audio worklet — didn't change the cache version, so
// installed clients kept serving the old bytes (the 8.3.0 missing-icons bug).
// Content in the hash makes every byte-level change a new cache.
const hash = createHash('sha256');
for (const rel of [...assets.map((a) => a.slice(2)), ...shellFiles].sort()) {
  hash.update(rel);
  hash.update('\0');
  try { hash.update(readFileSync(join(DIST, rel))); } catch { /* absent shell file: name still counted */ }
}
const version = hash.digest('hex').slice(0, 10);

const literal = assets.map((p) => `  '${p}',`).join('\n');
const appVersion = JSON.parse(readFileSync('package.json', 'utf8')).version;

let sw = readFileSync(SW, 'utf8');
sw = sw.replace('__CACHE_VERSION__', version);
sw = sw.replace('__APP_VERSION__', appVersion);
sw = sw.replace('  /*__INJECT_ASSETS__*/', literal);
writeFileSync(SW, sw);

console.log(`[sw] precached ${assets.length} assets, cache starlight-${version}, app v${appVersion}`);
