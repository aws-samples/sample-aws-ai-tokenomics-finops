#!/usr/bin/env node
/**
 * Render the link-preview image (Open Graph / Twitter card) to site/static/og-image.png.
 *
 * Not part of `npm run build`: the PNG is committed source, and build-site.mjs copies it into dist/.
 * Re-run this only when the card's wording or look should change:
 *
 *   PUPPETEER_EXECUTABLE_PATH=/path/to/chrome node scripts/make-og-image.mjs
 *
 * The card is plain text and colour blocks rendered from inline HTML with no network access: no logos,
 * no trademarks beyond the product names written as text, nothing fetched. 1200x630 is the size
 * Open Graph and `twitter:card=summary_large_image` both expect.
 */

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(REPO_ROOT, 'site', 'static', 'og-image.png');

const chrome = process.env.PUPPETEER_EXECUTABLE_PATH;
if (!chrome) {
  console.error('✖ make-og-image: set PUPPETEER_EXECUTABLE_PATH to a Chrome/Chromium binary.');
  process.exit(2);
}

// Colours are the runbook's own design tokens (site/src/css/00-tokens.css).
const HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  html, body { margin: 0; width: 1200px; height: 630px; }
  body { background: #232F3E; color: #ffffff; font-family: "DejaVu Sans", "Helvetica Neue", Arial, sans-serif;
         display: flex; flex-direction: column; justify-content: space-between; box-sizing: border-box; padding: 72px 80px 60px; }
  .bar { display: flex; gap: 12px; }
  .bar span { height: 12px; width: 120px; border-radius: 6px; }
  h1 { font-size: 88px; line-height: 1.05; margin: 0 0 28px; letter-spacing: -1.5px; font-weight: 700; }
  p.sub { font-size: 36px; line-height: 1.3; margin: 0; color: #d6dde6; max-width: 980px; }
  .tags { display: flex; gap: 14px; flex-wrap: wrap; }
  .tags span { font-size: 24px; padding: 8px 18px; border-radius: 999px; border: 2px solid #4a5a6e; color: #e8edf3; }
  .foot { font-size: 22px; color: #9fb0c3; }
</style></head><body>
  <div class="bar"><span style="background:#0972D3"></span><span style="background:#8B5CF6"></span><span style="background:#FF9900"></span><span style="background:#7AA116"></span></div>
  <div>
    <h1>AI Tokenomics FinOps</h1>
    <p class="sub">A self-assessment runbook for cutting LLM token cost on Amazon Bedrock: AI coding assistants and agentic AI applications.</p>
  </div>
  <div class="tags"><span>GenAI FinOps</span><span>Token economics</span><span>Model routing</span><span>Prompt caching</span></div>
  <div class="foot">Open-source sample, MIT-0. Not official AWS documentation.</div>
</body></html>`;

const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--font-render-hinting=none'] });
try {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', (r) => (r.url().startsWith('data:') || r.url() === 'about:blank' ? r.continue() : r.abort()));
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
  await page.setContent(HTML, { waitUntil: 'load' });
  mkdirSync(dirname(OUT), { recursive: true });
  await page.screenshot({ path: OUT, type: 'png', clip: { x: 0, y: 0, width: 1200, height: 630 } });
  console.log(`✔ make-og-image -> ${OUT}`);
} finally {
  await browser.close();
}
