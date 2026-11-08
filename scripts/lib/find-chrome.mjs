/**
 * Locate a Chrome/Chromium binary for the headless-browser verifiers (verify-runbook-dom, verify-deck).
 * PUPPETEER_EXECUTABLE_PATH wins; otherwise puppeteer's own cache (highest build first), then the usual
 * system install paths. Returns null when nothing is found; the caller decides how to fail.
 */

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export function findChrome() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;

  // Prefer puppeteer's own cache: headless-shell is faster and is built for exactly this.
  const cache = join(process.env.HOME || '', '.cache', 'puppeteer');
  for (const flavour of ['chrome-headless-shell', 'chrome']) {
    const dir = join(cache, flavour);
    if (!existsSync(dir)) continue;
    // Highest version first, so a check does not silently pin itself to an ancient build.
    const builds = readdirSync(dir).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const b of builds) {
      for (const rel of [
        join('chrome-headless-shell-mac-arm64', 'chrome-headless-shell'),
        join('chrome-headless-shell-mac-x64', 'chrome-headless-shell'),
        join('chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
        join('chrome-mac-x64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing')
      ]) {
        const p = join(dir, b, rel);
        if (existsSync(p)) return p;
      }
    }
  }

  for (const p of [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium'
  ]) if (existsSync(p)) return p;

  return null;
}
