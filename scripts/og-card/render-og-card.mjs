// Renders public/og-starlight.jpg — the social-share preview (WhatsApp, iMessage,
// Twitter/X, Slack…) — from og-card.html: the app's own night scene (seeded
// starfield, the moon, the Cormorant wordmark). Generated, not borrowed.
//
// Usage (dev server must be running for fonts.css):
//   npm run dev &
//   node scripts/og-card/render-og-card.mjs
//
// Output is a 1200x630 progressive JPEG kept well under WhatsApp's ~300KB
// preview limit. If you change the card, keep the og:image meta in index.html
// (dimensions/alt) in sync.
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

function localChromium() {
  const root = '/opt/pw-browsers';
  if (!existsSync(root)) return undefined;
  for (const dir of readdirSync(root).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
    const bin = `${root}/${dir}/chrome-linux/chrome`;
    if (existsSync(bin)) return bin;
  }
  return undefined;
}

const here = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ executablePath: localChromium() });
const page = await (await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })).newPage();
await page.goto(`file://${join(here, 'og-card.html')}`);
await page.waitForTimeout(1500); // fonts + starfield canvas
const png = join(here, 'og-card.tmp.png');
await page.screenshot({ path: png });
await browser.close();

execSync(`python3 -c "
from PIL import Image
im = Image.open('${png}').convert('RGB')
im.save('public/og-starlight.jpg', quality=86, optimize=True, progressive=True)
import os; os.remove('${png}'); print('public/og-starlight.jpg', os.path.getsize('public/og-starlight.jpg'), 'bytes')
"`, { stdio: 'inherit' });
