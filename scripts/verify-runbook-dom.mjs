#!/usr/bin/env node
/**
 * Behavioural check for the runbook, in a real browser.
 *
 * `verify-runbook.mjs` proves the content is still on the page. This proves the page still WORKS:
 * the assessment engine wires up, each layer's summary panel counts only its own layer, the Figure 2
 * explorer builds itself from the lever-index table, the theme actually repaints, the print path
 * produces a document, and nothing throws.
 *
 * The lever format (§9) asks for exactly these checks before committing a change to it.
 *
 * It runs against BOTH shapes of the runbook, because they can diverge and only one of them ships:
 *
 *   1. `content/index.html` over file:// — the self-contained file someone may open from disk,
 *      with no server.
 *   2. `dist/` (from `npm run build`) over a local static server, mounted under the GitHub Pages
 *      project sub-path `/sample-aws-ai-tokenomics-finops/` and served with the site's
 *      Content-Security-Policy as a response header, so a broken relative path or a CSP violation
 *      fails here rather than on the live site.
 *
 * Browser: puppeteer-core against an already-installed Chrome. No browser is downloaded — this repo
 * had zero dependencies before the front-end work and a 200 MB Chromium is a poor trade for a check
 * that can reuse what is on the machine. Override with PUPPETEER_EXECUTABLE_PATH.
 *
 * Exit status: 0 = pass, 1 = a check failed, 2 = the check itself could not run.
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import { SITE_CSP } from './build-site.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UPSTREAM = join(REPO_ROOT, 'content', 'index.html');
const APP_DIR = join(REPO_ROOT, 'dist');
const ARTEFACT_DIR = join(REPO_ROOT, '.verify-out');

/** The GitHub Pages project sub-path the site is published under. */
const BASE_PATH = '/sample-aws-ai-tokenomics-finops/';
/** Where "Suggest a change" must send the reader. */
const ISSUE_FORM = 'https://github.com/aws-samples/sample-aws-ai-tokenomics-finops/issues/new?template=content-correction.yml';

/**
 * The site's Content-Security-Policy, imported from the build so the harness and the published <meta>
 * cannot drift: one statement of the fact. Serving dist/ under it as a header is the point: an inline
 * style, an inline script or a would-be CDN request fails here instead of silently on the live site.
 * `connect-src 'self'` with no other host: the page makes no network call at all.
 */
const SITE_CSP_HEADER = SITE_CSP;

/**
 * The policy itself is asserted here, independently of build-site.mjs, so loosening SITE_CSP cannot pass
 * by agreeing with itself. Each listed directive must be EXACTLY these sources; no directive may carry an
 * `unsafe-*` keyword, a wildcard, or a scheme/host source other than the listed data:/blob:.
 */
const REQUIRED_CSP = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'"],
  'connect-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'none'"]
};
function cspProblems(policy) {
  const problems = [];
  const dirs = new Map(policy.split(';').map((d) => d.trim()).filter(Boolean)
    .map((d) => { const [name, ...src] = d.split(/\s+/); return [name.toLowerCase(), src]; }));
  for (const [name, want] of Object.entries(REQUIRED_CSP)) {
    const got = dirs.get(name);
    if (!got) problems.push(`${name} missing`);
    else if (got.length !== want.length || want.some((w) => !got.includes(w))) problems.push(`${name} is "${got.join(' ')}", want "${want.join(' ')}"`);
  }
  for (const [name, src] of dirs) {
    for (const s of src) {
      if (/unsafe-/i.test(s) || s.includes('*') || (/:/.test(s) && !/^(data|blob):$/.test(s))) problems.push(`${name} allows ${s}`);
    }
  }
  return problems;
}

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

function bail(message, hint) {
  console.error(`\n${red('✖')} verify-runbook-dom: ${message}`);
  if (hint) console.error(`  ${hint}`);
  console.error('');
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Locate a Chrome
// ---------------------------------------------------------------------------

function findChrome() {
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

// ---------------------------------------------------------------------------
// Static server for the built site, under the Pages sub-path, with the site's CSP
// ---------------------------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json'
};

function serve(dir) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const fullPath = decodeURIComponent(req.url.split('?')[0]);
      // Chromium requests /favicon.ico even when the page declares no icon. That browser-generated
      // request is not a product asset and must not create a false console error in the local harness.
      if (fullPath === '/favicon.ico') {
        res.writeHead(204);
        return res.end();
      }
      // Only the project sub-path exists, exactly as on GitHub Pages. An asset referenced from the
      // origin root ("/styles.css") 404s here, raises a console error and fails the run -- which is how
      // this harness proves every path in the build is relative.
      if (!fullPath.startsWith(BASE_PATH)) {
        res.writeHead(404); return res.end('not found (outside the Pages sub-path)');
      }
      const path = '/' + fullPath.slice(BASE_PATH.length);
      const file = join(dir, path === '/' ? 'index.html' : path);
      if (!file.startsWith(dir) || !existsSync(file)) {
        res.writeHead(404); return res.end('not found');
      }
      res.writeHead(200, {
        'content-type': MIME[extname(file)] || 'application/octet-stream',
        'content-security-policy': SITE_CSP_HEADER
      });
      res.end(readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

// ---------------------------------------------------------------------------
// Check harness
// ---------------------------------------------------------------------------

const results = [];
function check(scenario, name, ok, detail = '') {
  results.push({ scenario, name, ok, detail });
  const mark = ok ? green('✓') : red('✖');
  console.log(`  ${mark} ${name.padEnd(56)} ${ok ? dim(detail) : red(detail)}`);
}

/**
 * Put the reader in a pane, the way a reader does: by clicking its tab.
 *
 * ANYTHING THAT MEASURES GEOMETRY OR DRIVES A REAL POINTER MUST DO THIS FIRST. A pane that is not active is
 * `display: none`, so it measures as a zero-size box at the origin and can never receive `:hover`. The
 * failures that produces are actively misleading -- "the command bar is at top 0", "neither end of the pair
 * lit", "the board did not resize" -- every one of which reads as a bug in the thing under test rather than
 * as a check looking at a pane that is not on screen. This is the same class of trap as the synthetic
 * `mouseenter` recorded below, and it is worth knowing for the same reason.
 *
 * Clicking the tab rather than setting `data-scope` directly is deliberate: it exercises the capture-phase
 * handler and the anchor's own scroll, which is what a reader triggers.
 */
async function setPane(page, key) {
  await page.evaluate((k) => {
    const tab = document.querySelector('.tabs .tab-' + k);
    if (tab) tab.click();
  }, key);
  const target = key === 'overview' ? 'tracks' : `track-${key.slice(1)}`;
  const state = await waitForFragment(page, target, key, false);
  if (!fragmentPass(state, target, key, false)) {
    throw new Error(`route ${key} did not settle: ${JSON.stringify(state)}`);
  }
}

const NAV_TARGETS = [
  { id: 'assessment-t1', scope: 't1' },
  { id: 'assessment-t2', scope: 't2' },
  { id: 'bound-the-reasoning-loop', scope: 't2', parent: 't2-agent-harness' }
];
const NAV_VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 }
];
const NAV_TOLERANCE = 4;

function navigationUrl(base, name, id) {
  const next = new URL(base);
  next.searchParams.set('navigation-case', name);
  next.hash = '#' + id;
  return next.href;
}

async function fragmentState(page, id) {
  return page.evaluate((targetId) => {
    const anchor = document.getElementById(targetId);
    const target = targetId === 'tracks'
      ? document.querySelector('[data-route-focus="tracks"]')
      : anchor;
    if (!anchor || !target) return { id: targetId, missing: true };
    const rect = target.getBoundingClientRect();
    const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
    const root = document.documentElement;
    const maxScroll = Math.max(0, root.scrollHeight - innerHeight);
    const intersects = rect.bottom > 0 && rect.top < innerHeight;
    // block:start cannot reach the requested margin near the real end of the document. That exception is
    // accepted only when the viewport is demonstrably at maxScroll and the target still intersects it.
    const clampedAtDocumentEnd = Math.abs(scrollY - maxScroll) <= 2
      && rect.top > margin + 4 && intersects;
    return {
      id: targetId,
      hash: location.hash,
      scope: root.getAttribute('data-scope'),
      route: root.getAttribute('data-route'),
      focused: document.activeElement && document.activeElement.id,
      focusRoute: document.activeElement && document.activeElement.getAttribute('data-route-focus'),
      tag: target.tagName,
      text: target.textContent.trim().replace(/\s+/g, ' '),
      ariaHidden: target.getAttribute('aria-hidden'),
      visibility: getComputedStyle(target).visibility,
      visible: target.checkVisibility ? target.checkVisibility() : target.offsetParent !== null,
      top: Math.round(rect.top * 10) / 10,
      bottom: Math.round(rect.bottom * 10) / 10,
      viewportHeight: innerHeight,
      scrollY: Math.round(scrollY * 10) / 10,
      maxScroll: Math.round(maxScroll * 10) / 10,
      scrollMarginTop: margin,
      intersects,
      clampedAtDocumentEnd,
      delta: Math.round(Math.abs(rect.top - margin) * 10) / 10
    };
  }, id);
}

async function waitForFragment(page, id, scope, geometry = true) {
  let timedOut = false;
  try {
    await page.waitForFunction(({ targetId, wantedScope, withGeometry, tolerance }) => {
      const anchor = document.getElementById(targetId);
      const target = targetId === 'tracks'
        ? document.querySelector('[data-route-focus="tracks"]')
        : anchor;
      if (!anchor || !target || document.documentElement.getAttribute('data-scope') !== wantedScope
        || document.activeElement !== target
        || !(target.checkVisibility ? target.checkVisibility() : target.offsetParent !== null)) return false;
      if (!withGeometry) return true;
      const rect = target.getBoundingClientRect();
      const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - innerHeight);
      const intersects = rect.bottom > 0 && rect.top < innerHeight;
      const clampedAtDocumentEnd = Math.abs(scrollY - maxScroll) <= 2
        && rect.top > margin + tolerance && intersects;
      return intersects && (Math.abs(rect.top - margin) <= tolerance || clampedAtDocumentEnd);
    }, { polling: 'raf', timeout: 5000 }, {
      targetId: id,
      wantedScope: scope,
      withGeometry: geometry,
      tolerance: NAV_TOLERANCE
    });
  } catch (e) {
    timedOut = true;
  }
  await new Promise((resolve) => setTimeout(resolve, 80));
  return { ...(await fragmentState(page, id)), timedOut };
}

function fragmentPass(state, id, scope, geometry = true) {
  const exactFocus = id === 'tracks' ? state.focusRoute === 'tracks' : state.focused === id;
  return !state.missing && !state.timedOut && state.hash === '#' + id && state.scope === scope
    && exactFocus && state.visible && (!geometry
      || (state.intersects && (state.delta <= NAV_TOLERANCE || state.clampedAtDocumentEnd)));
}

function recordFragmentCheck(label, viewport, phase, expected, state, geometry = true) {
  const ok = fragmentPass(state, expected.id, expected.scope, geometry);
  check(label, `${viewport} ${phase} #${expected.id} uses the fragment pipeline`, ok,
    `scope=${state.scope}, focus=${state.focused || state.focusRoute}, top=${state.top}, margin=${state.scrollMarginTop}, delta=${state.delta}, end-clamped=${state.clampedAtDocumentEnd}`);
  return { viewport, phase, ...state, ok };
}

async function openMobileSidebar(page, mobile) {
  if (!mobile) return;
  const open = await page.evaluate(() => document.getElementById('sidebar').classList.contains('open'));
  if (!open) await page.click('#navToggle');
  // The class flips synchronously but the drawer takes 220ms to cross the viewport. Waiting only for the
  // class reproduces the audit probe's harness failure: Puppeteer correctly refuses an off-screen pointer.
  await page.waitForFunction(() => {
    const sidebar = document.getElementById('sidebar');
    const rect = sidebar.getBoundingClientRect();
    return sidebar.classList.contains('open') && rect.left >= -1 && rect.right > 0;
  });
}

async function activateSidebarFragment(page, id, mode, mobile) {
  await openMobileSidebar(page, mobile);
  const selector = `.sidebar a[href="#${id}"]`;
  await page.$eval(selector, (link) => link.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.waitForFunction((query) => {
    const link = document.querySelector(query);
    if (!link || !(link.checkVisibility ? link.checkVisibility() : link.offsetParent !== null)) return false;
    const rect = link.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.left < innerWidth && rect.right > 0
      && rect.top < innerHeight && rect.bottom > 56;
  }, {}, selector);
  if (mode === 'pointer') await page.click(selector);
  else {
    await page.focus(selector);
    await page.keyboard.press('Enter');
  }
}

async function runFragmentNavigationRegressions(page, label, url) {
  const evidence = [];
  let caseNo = 0;
  for (const viewport of NAV_VIEWPORTS) {
    await page.setViewport({ width: viewport.width, height: viewport.height });
    for (const target of NAV_TARGETS) {
      await page.goto(navigationUrl(url, `direct-${caseNo++}`, target.id), { waitUntil: 'load', timeout: 30000 });
      evidence.push(recordFragmentCheck(label, viewport.name, 'direct', target,
        await waitForFragment(page, target.id, target.scope)));
      await page.reload({ waitUntil: 'load', timeout: 30000 });
      evidence.push(recordFragmentCheck(label, viewport.name, 'refresh', target,
        await waitForFragment(page, target.id, target.scope)));

      for (const mode of ['pointer', 'keyboard']) {
        const routeId = target.scope === 't1' ? 'track-1' : 'track-2';
        await page.goto(navigationUrl(url, `${mode}-${caseNo++}`, routeId), { waitUntil: 'load', timeout: 30000 });
        await waitForFragment(page, routeId, target.scope, false);
        if (target.parent) {
          await activateSidebarFragment(page, target.parent, mode, viewport.name === 'mobile');
          await waitForFragment(page, target.parent, target.scope);
        }
        await activateSidebarFragment(page, target.id, mode, viewport.name === 'mobile');
        evidence.push(recordFragmentCheck(label, viewport.name, mode, target,
          await waitForFragment(page, target.id, target.scope)));
      }
    }
  }
  check(label, 'real fragment matrix passes all 24 direct/refresh/pointer/keyboard cases',
    evidence.length === 24 && evidence.every((entry) => entry.ok),
    `${evidence.filter((entry) => entry.ok).length}/${evidence.length}; explicit document-end clamps=${evidence.filter((entry) => entry.clampedAtDocumentEnd).length}`);
  return evidence;
}

function chooserContextPass(state) {
  return fragmentPass(state, 'tracks', 'overview', false) && state.route === 'tracks'
    && state.tag === 'H1' && state.ariaHidden !== 'true' && state.visibility !== 'hidden'
    && /AI Tokenomics FinOps/.test(state.text || '');
}

async function runChooserFocusRegressions(page, label, url) {
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(navigationUrl(url, 'chooser-direct', 'tracks'), { waitUntil: 'load', timeout: 30000 });
  const direct = await waitForFragment(page, 'tracks', 'overview', false);
  check(label, 'direct #tracks focuses a visible semantic chooser heading', chooserContextPass(direct), JSON.stringify(direct));

  await page.reload({ waitUntil: 'load', timeout: 30000 });
  const refreshed = await waitForFragment(page, 'tracks', 'overview', false);
  check(label, 'refresh #tracks restores chooser focus and announcement context', chooserContextPass(refreshed), JSON.stringify(refreshed));

  await page.click('.tabs .tab-t1');
  const t1 = await waitForFragment(page, 'track-1', 't1', false);
  await page.click('.tabs .tab-t2');
  const t2 = await waitForFragment(page, 'track-2', 't2', false);
  await page.evaluate(() => history.back());
  const backT1 = await waitForFragment(page, 'track-1', 't1', false);
  await page.evaluate(() => history.back());
  const backChooser = await waitForFragment(page, 'tracks', 'overview', false);
  await page.evaluate(() => history.forward());
  const forwardT1 = await waitForFragment(page, 'track-1', 't1', false);
  await page.evaluate(() => history.forward());
  const forwardT2 = await waitForFragment(page, 'track-2', 't2', false);
  const historyStates = [t1, t2, backT1, backChooser, forwardT1, forwardT2];
  check(label, 'browser back/forward restores exact Track 1, Track 2 and chooser focus',
    fragmentPass(t1, 'track-1', 't1', false)
      && fragmentPass(t2, 'track-2', 't2', false)
      && fragmentPass(backT1, 'track-1', 't1', false)
      && chooserContextPass(backChooser)
      && fragmentPass(forwardT1, 'track-1', 't1', false)
      && fragmentPass(forwardT2, 'track-2', 't2', false),
    historyStates.map((state) => `${state.hash}:${state.scope}/${state.focused || state.focusRoute}`).join(' -> '));

  await page.goto(navigationUrl(url, 'chooser-invalid', 'not-a-route'), { waitUntil: 'load', timeout: 30000 });
  const invalid = await waitForFragment(page, 'tracks', 'overview', false);
  const invalidOk = chooserContextPass({ ...invalid, hash: '#tracks' }) && invalid.hash === '#not-a-route';
  check(label, 'invalid direct hash falls back to visible chooser focus without rewriting the URL', invalidOk,
    `hash=${invalid.hash}, route=${invalid.route}, focus=${invalid.focused || invalid.focusRoute}, tag=${invalid.tag}`);
}

function alphaOf(color) {
  if (!color || color === 'transparent') return 0;
  const match = color.match(/^rgba?\((.*)\)$/i);
  if (!match) return 1;
  const body = match[1];
  const slash = body.match(/\/\s*([\d.]+)%?\s*$/);
  if (slash) return slash[0].includes('%') ? Number(slash[1]) / 100 : Number(slash[1]);
  const parts = body.split(',').map((part) => part.trim());
  return parts.length > 3 ? Number(parts[3]) : 1;
}

async function runOpaqueStepperRegressions(page, label, url) {
  mkdirSync(ARTEFACT_DIR, { recursive: true });
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  await page.setViewport({ width: 390, height: 844 });
  for (const route of [
    { key: 't1', target: 'developer-education' },
    { key: 't2', target: 'bound-the-reasoning-loop' }
  ]) {
    await page.goto(navigationUrl(url, `stepper-${route.key}`, route.target), { waitUntil: 'load', timeout: 30000 });
    await waitForFragment(page, route.target, route.key);
    for (const theme of ['light', 'dark']) {
      await page.evaluate((mode) => document.documentElement.setAttribute('data-theme', mode), theme);
      await new Promise((resolve) => setTimeout(resolve, 80));
      const style = await page.evaluate(() => {
        const stepper = document.getElementById('trackStepper');
        const computed = getComputedStyle(stepper);
        return {
          visible: stepper.checkVisibility(),
          backgroundColor: computed.backgroundColor,
          backgroundImage: computed.backgroundImage,
          backdropFilter: computed.backdropFilter || computed.webkitBackdropFilter || 'none',
          overflow: document.documentElement.scrollWidth - innerWidth
        };
      });
      const opaque = style.visible && alphaOf(style.backgroundColor) === 1
        && style.backgroundImage === 'none' && style.backdropFilter === 'none' && style.overflow <= 1;
      check(label, `${route.key} ${theme} mobile stepper is opaque with no backdrop or overflow`, opaque,
        `${style.backgroundColor}; image=${style.backgroundImage}; backdrop=${style.backdropFilter}; overflow=${style.overflow}`);
      await page.screenshot({
        path: join(ARTEFACT_DIR, `${slug}-${route.key}-mobile-stepper-${theme}.png`),
        fullPage: false
      });
    }
  }
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await page.setViewport({ width: 1400, height: 1000 });
}

async function openLandingGuide(page) {
  await setPane(page, 'overview');
  await page.evaluate(() => {
    const details = document.querySelector('details.landing-library');
    if (details) details.open = true;
  });
  await new Promise((r) => setTimeout(r, 160));
}

/** Expected shape of the runbook. Kept here, not derived, so a silent drop is a failure. */
const EXPECT = {
  /** The three user-visible routes, in navigation order. */
  panes: ['overview', 't1', 't2'],
  tracks: {
    t1: { levers: 11, questions: 35, references: 58, scopes: ['t1-model-inference', 't1-agent-harness', 't1-end-user'] },
    t2: { levers: 15, questions: 34, references: 63, scopes: ['model-inference', 'agent-harness', 'end-user'] }
  },
  /** Every lever states a saving since the 2026-10-02 Track 2 consolidation (no `data-lever-kind="cross-reference"` lever remains). */
  savesHeads: 26,
  levers: 26,
  assessBlocks: 26,
  questions: 69,
  panels: 6,
  scopes: ['t1-model-inference', 't1-agent-harness', 't1-end-user', 'model-inference', 'agent-harness', 'end-user'],
  minExplorerChips: 26,
  figures: 5
};

/** Track 2 lever headings in document order; the scope pickers must list exactly these. */
const EXPECT_T2_LEVER_IDS = [
  'know-what-you-spend', 'route-to-the-right-model', 'route-to-the-right-price', 'cache-what-repeats',
  'distill-when-volume-justifies-it',
  'system-prompt', 'context-budget', 'design-memory-and-compaction-as-architecture', 'budget-the-tool-definition-weight',
  'bound-the-reasoning-loop', 'enforce-per-user-ceilings-at-the-gateway', 'audit-your-orchestration-for-hidden-invocations',
  'precise-specifications-to-avoid-rework', 'guided-prompting-to-reduce-input-ambiguity', 'show-the-user-what-their-session-costs'
];

const MODEL_INFERENCE_PHASES = [
  'FOUNDATION',
  'BEFORE THE CALL',
  'AT THE CALL BOUNDARY',
  'ON THE PAYLOAD',
  'AT SCALE'
];

const MODEL_INFERENCE_SEQUENCE = [
  'know-what-you-spend',
  'route-to-the-right-model',
  'route-to-the-right-price',
  'cache-what-repeats',
  'distill-when-volume-justifies-it'
];

async function runScenario(browser, label, url, { expectSplitBuild }) {
  console.log(`\n${bold(label)}\n  ${dim(url)}`);
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000 });

  const consoleErrors = [];
  const pageErrors = [];
  const cspViolations = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    // CSP violations are collected separately so the report says which kind of failure it was.
    if (/Content Security Policy/i.test(t)) cspViolations.push(t);
    else consoleErrors.push(t);
  });
  page.on('pageerror', (e) => pageErrors.push(e.message));

  // Every request that leaves the page's own origin. For the file:// scenario that is anything not
  // file://; for the served site, anything not on its host. The page loads only its own two assets,
  // so a healthy run records nothing at all.
  const offOriginRequests = [];
  const pageOrigin = url.startsWith('file:') ? 'file://' : new URL(url).origin;
  page.on('request', (req) => {
    const target = req.url();
    if (target.startsWith('data:') || target.startsWith('blob:')) return;
    if (target.startsWith(pageOrigin)) return;
    offOriginRequests.push(`${req.method()} ${target}`);
  });

  await page.goto(url, { waitUntil: 'load', timeout: 30000 });

  // --- structure -----------------------------------------------------------
  const counts = await page.evaluate(() => ({
    assessBlocks: document.querySelectorAll('.assess').length,
    questions: document.querySelectorAll('[data-assess-q]').length,
    panels: document.querySelectorAll('.assess-report').length,
    figures: document.querySelectorAll('figure').length,
    scopes: [...document.querySelectorAll('.assess-report')].map((p) => p.getAttribute('data-ar-scope')),
    styleTags: document.querySelectorAll('style').length,
    linkTags: document.querySelectorAll('link[rel="stylesheet"]').length,
    cspMeta: (document.querySelector('meta[http-equiv="Content-Security-Policy"]') || {}).content || null
  }));

  check(label, 'assessment blocks', counts.assessBlocks === EXPECT.assessBlocks, `${counts.assessBlocks} (want ${EXPECT.assessBlocks})`);
  check(label, 'assessment questions', counts.questions === EXPECT.questions, `${counts.questions} (want ${EXPECT.questions})`);
  check(label, 'per-layer summary panels', counts.panels === EXPECT.panels, `${counts.panels} (want ${EXPECT.panels})`);
  check(label, 'figures', counts.figures === EXPECT.figures, `${counts.figures} (want ${EXPECT.figures})`);
  check(label, 'panel scopes are the six expected',
    EXPECT.scopes.every((s) => counts.scopes.includes(s)) && counts.scopes.length === EXPECT.scopes.length,
    counts.scopes.join(', '));

  // --- the taxonomy says one thing in every place it is stated -------------
  // Three facts about a lever are written down more than once: which lever a question belongs to, whether
  // a lever has an assessment, and whether a topic is treated on both tracks. Each pair of statements
  // drifted at least once before these checks existed, and each drift was invisible in review because
  // both halves looked right on their own. See the prose-register design notes.
  const taxonomy = await page.evaluate(() => {
    const levers = [...document.querySelectorAll('section[id^="track-"] h4[id]')];

    // 1. `data-anchor` is the gap report's link back to the lever, and the canonical format says it is the
    //    lever's own <h4 id>. One question used to point at a paragraph inside its own guidance.
    const anchorMismatches = [];
    levers.forEach((h4) => {
      let node = h4.nextElementSibling;
      while (node && !/^H[1-6]$/.test(node.tagName)) {
        node.querySelectorAll('[data-assess-q]').forEach((q) => {
          const a = q.getAttribute('data-anchor');
          if (a !== h4.id) anchorMismatches.push(`${q.getAttribute('data-key')}: ${a} != ${h4.id}`);
        });
        node = node.nextElementSibling;
      }
    });

    // 2. A lever with no assessment must SAY it is a cross-reference. Otherwise a forgotten assessment
    //    block and a deliberate prose lever are indistinguishable, and the map reports the first as the
    //    second. Spec §3 sanctions the kind; this asserts the two sets are the same set.
    const kindOf = (h4) => h4.getAttribute('data-lever-kind') || 'lever';
    const hasAssess = (h4) => {
      let node = h4.nextElementSibling;
      while (node && !/^H[1-6]$/.test(node.tagName)) {
        if (node.matches('.assess') || node.querySelector('.assess')) return true;
        node = node.nextElementSibling;
      }
      return false;
    };
    const unassessed = levers.filter((h4) => !hasAssess(h4)).map((h4) => h4.id);
    const declared = levers.filter((h4) => kindOf(h4) === 'cross-reference').map((h4) => h4.id);

    // 3. The sidebar's "shared" marker is derived from the lever's own tag, so the two sets must be equal
    //    by construction. They were maintained by hand and disagreed on seven levers in both directions.
    const nav = document.getElementById('sidebar');
    const pilled = [...nav.querySelectorAll('a.nav-link .pill-s')]
      .map((p) => (p.closest('a').getAttribute('href') || '').slice(1)).sort();
    const tagged = levers.filter((h4) => h4.querySelector('.tag.shared')).map((h4) => h4.id).sort();

    return { anchorMismatches, unassessed: unassessed.sort(), declared: declared.sort(), pilled, tagged };
  });

  check(label, 'every question anchors to its own lever',
    taxonomy.anchorMismatches.length === 0,
    taxonomy.anchorMismatches.length ? taxonomy.anchorMismatches.join('; ') : 'all 64 resolve to their <h4 id>');
  check(label, 'a lever with no assessment declares itself a cross-reference',
    taxonomy.unassessed.join(',') === taxonomy.declared.join(','),
    `no assessment: [${taxonomy.unassessed.join(', ') || 'none'}] vs declared: [${taxonomy.declared.join(', ') || 'none'}]`);
  check(label, 'the sidebar\'s shared markers are exactly the levers that carry the tag',
    taxonomy.pilled.join(',') === taxonomy.tagged.join(','),
    `${taxonomy.pilled.length} in the sidebar, ${taxonomy.tagged.length} tagged`
      + (taxonomy.pilled.join(',') === taxonomy.tagged.join(',') ? '' :
        ` — only in nav: [${taxonomy.pilled.filter((p) => !taxonomy.tagged.includes(p)).join(', ')}]`
        + ` only tagged: [${taxonomy.tagged.filter((t) => !taxonomy.pilled.includes(t)).join(', ')}]`));

  // --- styling actually applied -------------------------------------------
  // The single most damaging silent failure is a stylesheet that never loads: the page still renders,
  // just unstyled, and every other check still passes. Assert a computed value that only the
  // stylesheet can produce.
  const styled = await page.evaluate(() => {
    const bar = document.querySelector('.topbar');
    // NOT `main.content h2` — the first of those is the mapcard's own heading, which is deliberately
    // overridden to `border: 0` by `.mapcard .maphd h2`. Use a section heading, which is the one the
    // 3px accent rule actually targets.
    const h2 = document.querySelector('main.content section > h2');
    return {
      topbarSticky: bar ? getComputedStyle(bar).position : null,
      h2Border: h2 ? `${getComputedStyle(h2).borderBottomWidth} ${getComputedStyle(h2).borderBottomStyle}` : null,
      h2Text: h2 ? h2.textContent.trim() : null
    };
  });
  check(label, 'stylesheet is in effect (.topbar is sticky)', styled.topbarSticky === 'sticky', String(styled.topbarSticky));
  check(label, 'stylesheet is in effect (section h2 accent rule)', styled.h2Border === '3px solid',
    `${styled.h2Border} on "${styled.h2Text}"`);

  // --- Figures 1, 3a and 3b: real SVG, themed, accessible ----------------
  // These were div-and-CSS mockups. Asserting each diagram separately stops a future edit quietly
  // replacing one with the other, and asserting the fills resolve catches the classic inline-SVG
  // mistake of styling with var() in a presentation attribute, which yields no paint at all.
  const figs = await page.evaluate((expectedSequence) => {
    const read = (el) => {
      if (!el) return null;
      const filled = [...el.querySelectorAll('rect, path')]
        .map((n) => getComputedStyle(n).fill)
        .filter((f) => f && f !== 'none' && f !== 'rgba(0, 0, 0, 0)');
      return {
        isSvg: el.tagName.toLowerCase() === 'svg',
        role: el.getAttribute('role'),
        ariaLen: (el.getAttribute('aria-label') || '').length,
        viewBox: el.getAttribute('viewBox'),
        painted: filled.length,
        inlineStyled: el.querySelectorAll('[style]').length,
        texts: el.querySelectorAll('text').length
      };
    };
    const hrefId = (a) => (a && a.getAttribute('href') || '').replace(/^#/, '');
    const lifecycle = document.getElementById('model-inference-lifecycle');

    const bodySequence = [];
    let bodyNode = document.getElementById('t2-model-inference')?.nextElementSibling || null;
    while (bodyNode && bodyNode.tagName !== 'H3') {
      if (bodyNode.matches('h4[id]')) bodySequence.push(bodyNode.id);
      bodyNode = bodyNode.nextElementSibling;
    }

    const sidebarSequence = [];
    const modelInferenceNav = document.querySelector('#sidebar a[href="#t2-model-inference"]');
    let navNode = modelInferenceNav?.closest('li')?.nextElementSibling || null;
    while (navNode) {
      const a = navNode.querySelector(':scope > a.nav-link');
      if (!a || a.classList.contains('lvl-lever')) break;
      const id = hrefId(a);
      if (expectedSequence.includes(id)) sidebarSequence.push(id);
      navNode = navNode.nextElementSibling;
    }

    const fallbackSequence = [...document.querySelectorAll('.lever-index tbody tr')]
      .filter((row) => {
        const cells = row.querySelectorAll(':scope > td');
        return cells[0]?.textContent.trim() === 'Track 2'
          && cells[1]?.textContent.trim() === 'Model Inference';
      })
      .map((row) => hrefId(row.querySelector(':scope > td:nth-child(3) a')));

    return {
      fig1: read(document.querySelector('svg.tokmeter')),
      lifecycle: read(lifecycle),
      routingRetirement: {
        svg: !!document.getElementById('model-routing-decision-flow'),
        caption: [...document.querySelectorAll('figcaption')].some((node) =>
          /^Figure 3b: Track 2 cost-aware routing decision flow\./.test(node.textContent.trim())),
        owner: !!document.querySelector('span[data-fact-owner="decision-guidance-cost-aware-model-routing"]:not([id])'),
        branch: !!document.getElementById('configured-router-branch'),
        branchLabel: !!document.getElementById('configured-router-branch-label'),
        option: !!document.getElementById('configured-router-option'),
        markerIds: ['df-arrow', 'df-arrow-go', 'df-arrow-stop'].filter((id) => !!document.getElementById(id))
      },
      lifecyclePhaseLabels: lifecycle
        ? [...lifecycle.querySelectorAll('.df-tag')].map((n) => n.textContent.trim())
        : [],
      bodySequence,
      sidebarSequence,
      fallbackSequence,
      lifecycleArrowheads: lifecycle ? lifecycle.querySelectorAll('polygon.df-arrowhead').length : 0,
      lifecycleEdges: lifecycle ? lifecycle.querySelectorAll('line.df-edge').length : 0,
    };
  }, MODEL_INFERENCE_SEQUENCE);
  for (const [name, f] of [
    ['Figure 1 (token cost meter)', figs.fig1],
    ['Figure 3a (Model Inference lifecycle)', figs.lifecycle]
  ]) {
    check(label, `${name} is inline SVG with role=img`, !!f && f.isSvg && f.role === 'img', f ? `role=${f.role}` : 'missing');
    check(label, `${name} keeps its full prose aria-label`, !!f && f.ariaLen > 200, f ? `${f.ariaLen} chars` : '0');
    check(label, `${name} shapes actually paint`, !!f && f.painted > 3, f ? `${f.painted} painted` : '0');
    check(label, `${name} carries no inline styles`, !!f && f.inlineStyled === 0, f ? `${f.inlineStyled}` : 'n/a');
    check(label, `${name} labels its parts as real text`, !!f && f.texts >= 8, f ? `${f.texts} <text>` : '0');
  }
  check(label, 'Figure 3a labels the five lifecycle phases in order',
    figs.lifecyclePhaseLabels.join('|') === MODEL_INFERENCE_PHASES.join('|'),
    figs.lifecyclePhaseLabels.join(' -> '));
  check(label, 'Figure 3a connects all five lifecycle phases',
    figs.lifecycleEdges === 4 && figs.lifecycleArrowheads === 4,
    `${figs.lifecycleEdges} edges, ${figs.lifecycleArrowheads} arrowheads`);
  check(label, 'Model Inference body follows the five-lever lifecycle sequence',
    figs.bodySequence.join('|') === MODEL_INFERENCE_SEQUENCE.join('|'),
    figs.bodySequence.join(' -> '));
  check(label, 'Model Inference sidebar follows the five-lever lifecycle sequence',
    figs.sidebarSequence.join('|') === MODEL_INFERENCE_SEQUENCE.join('|'),
    figs.sidebarSequence.join(' -> '));
  check(label, 'no-JS Model Inference index follows the five-lever lifecycle sequence',
    figs.fallbackSequence.join('|') === MODEL_INFERENCE_SEQUENCE.join('|'),
    figs.fallbackSequence.join(' -> '));
  const retiredRouting = figs.routingRetirement;
  check(label, 'Figure 3b routing SVG is absent', !retiredRouting.svg, `present=${retiredRouting.svg}`);
  check(label, 'Figure 3b caption is absent', !retiredRouting.caption, `present=${retiredRouting.caption}`);
  check(label, 'Figure 3b fact-owner marker is absent', !retiredRouting.owner, `present=${retiredRouting.owner}`);
  check(label, 'Figure 3b configured-router branch is absent', !retiredRouting.branch, `present=${retiredRouting.branch}`);
  check(label, 'Figure 3b configured-router label is absent', !retiredRouting.branchLabel, `present=${retiredRouting.branchLabel}`);
  check(label, 'Figure 3b configured-router option is absent', !retiredRouting.option, `present=${retiredRouting.option}`);
  check(label, 'Figure 3b SVG marker ids are absent', retiredRouting.markerIds.length === 0,
    retiredRouting.markerIds.join(', ') || 'none');

  // --- Figure 2: the cost structure map ------------------------------------
  const map = await page.evaluate(() => {
    const el = document.getElementById('trackExplorer');
    const rows = [...document.querySelectorAll('#trackExplorer .csm-lever')];
    return {
      present: !!el,
      hidden: el ? el.hidden : null,
      chips: rows.length,
      cells: document.querySelectorAll('#trackExplorer .csm-cell').length,
      banners: document.querySelectorAll('#trackExplorer .csm-rowh').length,
      colHeads: document.querySelectorAll('#trackExplorer .csm-colh').length,
      // Every row must state its state, and never by colour alone: a marker with its own silhouette, plus
      // a sentence on the row for a screen reader.
      allHaveState: rows.every((r) => !!r.getAttribute('data-state')),
      allHaveMarker: rows.every((r) => !!r.querySelector('.csm-mark')),
      allLabelled: rows.every((r) => /—/.test(r.getAttribute('aria-label') || '')),
      // The question counts on the rows must add up to the assessment's own total, which is what proves no
      // question is filed under a lever that does not exist.
      questionsOnRows: rows.reduce((a, r) => {
        const m = (r.querySelector('.csm-lever-n').textContent || '').match(/\/(\d+)/);
        return a + (m ? Number(m[1]) : 0);
      }, 0),
      // Two sources say a lever is shared: the lever's own pill (content) and the pairs list in costmap.mjs
      // (which lever on the other track). A pill with no pair gives the reader a badge whose hover does
      // nothing; a pair with no pill means the map claims something the runbook does not.
      sharedBadges: document.querySelectorAll('#trackExplorer .csm-lever.shared').length,
      sharedTwinned: document.querySelectorAll('#trackExplorer .csm-lever[data-twin]').length,
      pillsOnLevers: [...document.querySelectorAll('section[id^="track-"] h4[id] .tag.shared')].length,
      // Counting badges against pairs is not enough, and the gap was live: one pair named
      // `#manage-the-model-lifecycle`, which is a question id rather than a lever, so the counts agreed while
      // the hover drew nothing at all. What matters is that every twin names a row that is ON the board.
      twinTargetsResolve: [...document.querySelectorAll('#trackExplorer .csm-lever[data-twin]')].every((a) =>
        a.getAttribute('data-twin').split(/\s+/).filter(Boolean).every((h) =>
          !!document.querySelector('#trackExplorer .csm-lever[data-lever-id="' + h.slice(1) + '"]'))),
      // The pair can cross actor-layers, so "the other track" is not enough to find it by. Every badge has to
      // name the track AND the layer its counterpart sits in.
      twinTitlesNameLayer: [...document.querySelectorAll('#trackExplorer .csm-lever[data-twin] .te-badge')]
        .every((b) => /Track \d, (Model Inference|Agent Harness|End User): ./.test(b.title || '')),
      filters: document.querySelectorAll('#trackExplorer .csm-filter').length,
      hasSearch: !!document.getElementById('costMapSearch'),
      fallbackTable: !!document.querySelector('.lever-index table')
    };
  });
  check(label, 'cost map un-hides after building', map.present && map.hidden === false, `hidden=${map.hidden}`);
  check(label, 'cost map rendered every lever', map.chips === EXPECT.minExplorerChips, `${map.chips} rows (want ${EXPECT.minExplorerChips})`);
  check(label, 'cost map is a board of six layer cells under two track banners',
    map.cells === EXPECT.panels && map.banners === 2 && map.colHeads === 3,
    `${map.cells} cells, ${map.banners} banners, ${map.colHeads} column heads`);
  check(label, 'every lever row carries a state, a marker and a sentence',
    map.allHaveState && map.allHaveMarker && map.allLabelled,
    `state=${map.allHaveState}, marker=${map.allHaveMarker}, label=${map.allLabelled}`);
  // Regression guard: `data-anchor` is documented as the lever's h4 id, but one question deep-links a
  // paragraph instead. Attributing questions by position rather than by that attribute is what keeps the
  // map's totals equal to the assessment's, and this is the check that would catch a regression to it.
  check(label, "the map accounts for every question", map.questionsOnRows === EXPECT.questions,
    `${map.questionsOnRows} on rows vs ${EXPECT.questions} in the page`);
  check(label, 'cost map offers a search box and filter chips', map.hasSearch && map.filters === 6,
    `${map.filters} filters, search=${map.hasSearch}`);
  check(label, 'every shared lever is badged, and every badge has a counterpart to point at',
    map.sharedBadges === map.pillsOnLevers && map.sharedTwinned === map.sharedBadges,
    `${map.pillsOnLevers} pills, ${map.sharedBadges} badges, ${map.sharedTwinned} with a twin`);
  check(label, 'every twin names a lever row that is on the board', map.twinTargetsResolve, 'all resolve');
  check(label, "every shared badge names its counterpart's track and layer", map.twinTitlesNameLayer, 'named');
  check(label, 'no-JS fallback table survives', map.fallbackTable, 'present');

  // Filtering is NAVIGATION: it takes rows out of view and never out of the document.
  const filtering = await page.evaluate(async () => {
    const out = {};
    const answer = (sc, v) => {
      const qs = [...document.querySelectorAll(`.assess[data-assess-group="${sc}"] [data-assess-q]`)];
      qs.forEach((q, i) => { if (v[i]) q.querySelector(`.seg button[data-v="${v[i]}"]`).click(); });
    };
    const shown = () => [...document.querySelectorAll('.csm-lever')]
      .filter((r) => !r.classList.contains('is-out')).length;
    const inDom = () => document.querySelectorAll('.csm-lever').length;

    answer('t1-model-inference', ['yes', 'no', 'wip']);
    await new Promise((r) => setTimeout(r, 60));
    // Answering must move the row's own state, not only the layer's tally.
    out.rowState = document.querySelector('.csm-lever[data-lever-id="know-how-your-fleet-is-metered"]')
      .getAttribute('data-state');

    // A note on a question puts a marker on its lever.
    const ta = document.querySelector('.assess[data-assess-group="t1-model-inference"] [data-assess-note]');
    ta.value = 'follow up with the platform team';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 60));
    out.noteShown = !document.querySelector('.csm-lever[data-lever-id="know-how-your-fleet-is-metered"] .csm-lever-note').hidden;

    out.beforeFilter = shown();
    document.querySelector('.csm-filter-gap').click();
    await new Promise((r) => setTimeout(r, 60));
    out.afterFilter = shown();
    out.stillInDom = inDom();
    out.emptyCellExplains = [...document.querySelectorAll('.csm-cell.is-empty .csm-cell-empty')]
      .some((p) => !p.hidden);
    out.showing = (document.querySelector('.csm-showing') || {}).textContent;
    out.clearOffered = !document.querySelector('.csm-clear').hidden;

    // With a filter on, a shared lever's twin can be out of view. `is-out` is `display: none`, so its rect is
    // all zeros and a curve to it is drawn relative to the board's origin, which puts it off the board
    // entirely. Nothing is the right answer: there is no counterpart on screen to point at.
    const kept = document.querySelector('.csm-lever[data-lever-id="know-how-your-fleet-is-metered"]');
    const twinOut = document.querySelector('.csm-lever[data-lever-id="route-to-the-right-price"]')
      .classList.contains('is-out');
    kept.dispatchEvent(new MouseEvent('mouseenter'));
    await new Promise((r) => setTimeout(r, 80));
    out.hiddenTwinDrawsNothing = twinOut
      && [...document.querySelectorAll('.te-link')].every((p) => !p.getAttribute('d'));
    kept.dispatchEvent(new MouseEvent('mouseleave'));

    // Search narrows on the lever's own name.
    document.querySelector('.csm-clear').click();
    const input = document.getElementById('costMapSearch');
    input.value = 'cache';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 60));
    out.afterSearch = shown();

    // clean up: clear the filter, the note and the answers
    document.querySelector('.csm-clear').click();
    ta.value = '';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    answer('t1-model-inference', ['yes', 'no', 'wip']);
    try { localStorage.removeItem('tokenomics-assessment-v1'); localStorage.removeItem('tokenomics-assessment-notes-v1'); } catch (e) {}
    return out;
  });
  check(label, 'answering a question moves its lever row on the map', filtering.rowState === 'gap',
    `data-state=${filtering.rowState} after one gap answer`);
  check(label, 'a note on a question shows on its lever row', filtering.noteShown, 'note marker visible');
  check(label, 'a filter narrows the board', filtering.afterFilter < filtering.beforeFilter && filtering.afterFilter > 0,
    `${filtering.beforeFilter} -> ${filtering.afterFilter} rows`);
  // The whole point: focus is not deletion, here as everywhere else in this runbook.
  check(label, 'filtering removes NOTHING from the document',
    filtering.stillInDom === EXPECT.minExplorerChips, `${filtering.stillInDom} rows still in the DOM`);
  check(label, 'a filtered-out cell says so rather than vanishing', filtering.emptyCellExplains, 'empty note shown');
  check(label, 'no connector is drawn to a twin the filter has taken out of view',
    filtering.hiddenTwinDrawsNothing, 'no curve leaves the board');
  check(label, 'the bar says how much is hidden, and offers a way back',
    /Showing \d+ of \d+/.test(filtering.showing || '') && filtering.clearOffered, String(filtering.showing));
  check(label, 'search narrows on the lever name', filtering.afterSearch > 0 && filtering.afterSearch < EXPECT.minExplorerChips,
    `${filtering.afterSearch} rows match "cache"`);

  // The command bar is the FOURTH sticky layer now (top bar, tab bar, breadcrumb, then this), and if it
  // slides under the breadcrumb its filters cannot be used. It lives in the Cost map pane, so measuring it
  // requires being in that pane -- see setPane().
  await openLandingGuide(page);
  const sticky = await page.evaluate(async () => {
    const board = document.querySelector('.csm-board');
    window.scrollTo({ top: board.getBoundingClientRect().top + window.scrollY + 400, behavior: 'instant' });
    window.dispatchEvent(new Event('scroll'));
    await new Promise((r) => setTimeout(r, 200));
    const bar = document.querySelector('.csm-bar').getBoundingClientRect();
    const crumb = document.querySelector('.breadcrumb').getBoundingClientRect();
    window.scrollTo({ top: 0, behavior: 'instant' });
    return { barTop: Math.round(bar.top), crumbBottom: Math.round(crumb.bottom), position: getComputedStyle(document.querySelector('.csm-bar')).position };
  });
  check(label, 'the command bar sticks below the breadcrumb, not under it',
    sticky.position === 'sticky' && sticky.barTop >= sticky.crumbBottom,
    `bar top ${sticky.barTop} vs breadcrumb bottom ${sticky.crumbBottom}`);

  // A filter left on must not silently shrink a PRINTED map: on paper there is no bar to clear it with and
  // no "showing 2 of 30" to explain the absence. Checked under real print media, with a filter engaged.
  await page.evaluate(() => document.querySelector('.csm-filter-gap').click());
  await page.emulateMediaType('print');
  const printedMap = await page.evaluate(() => {
    const seen = (n) => !!n && (n.checkVisibility ? n.checkVisibility() : n.offsetParent !== null);
    return {
      barHidden: !seen(document.querySelector('.csm-bar')),
      rows: [...document.querySelectorAll('.csm-lever')].filter(seen).length,
      emptyNotesHidden: [...document.querySelectorAll('.csm-cell-empty')].every((n) => !seen(n)),
      bleedCancelled: getComputedStyle(document.querySelector('.csm')).marginLeft
    };
  });
  await page.emulateMediaType('screen');
  await page.evaluate(() => document.querySelector('.csm-clear').click());
  check(label, 'the printed map ignores the filter and drops the chrome',
    printedMap.barHidden && printedMap.rows === EXPECT.minExplorerChips
      && printedMap.emptyNotesHidden && printedMap.bleedCancelled === '0px',
    `bar hidden=${printedMap.barHidden}, ${printedMap.rows} rows printed, bleed=${printedMap.bleedCancelled}`);

  // --- assessment behaviour: scope independence ----------------------------
  // Answer one question in one layer and assert the other five panels do not move. This is the
  // property most easily broken by a refactor, and the one the spec calls out by name.
  const scopeTest = await page.evaluate((scopes) => {
    const readCounts = () => Object.fromEntries([...document.querySelectorAll('.assess-report')]
      .map((p) => [p.getAttribute('data-ar-scope'), (p.querySelector('[data-ar-count]') || {}).textContent || '']));

    const before = readCounts();
    const target = 't1-end-user';
    const block = document.querySelector(`.assess[data-assess-group="${target}"]`);
    if (!block) return { error: `no assess block for ${target}` };
    const q = block.querySelector('[data-assess-q]');
    const btn = q.querySelector('.seg button[data-v="no"]');
    btn.click();

    // Read every observation BEFORE the cleanup click. The buttons are toggles, so clicking the same
    // one again clears the answer and would make `data-state` read back empty.
    const after = readCounts();
    const state = q.getAttribute('data-state');
    const pressed = btn.getAttribute('aria-pressed');
    const gapOpen = (q.querySelector('details.assess-gap') || {}).open;
    const moved = Object.keys(after).filter((s) => after[s] !== before[s]);

    btn.click();
    try { localStorage.removeItem('tokenomics-assessment-v1'); localStorage.removeItem('tokenomics-assessment-notes-v1'); } catch (e) {}
    return { moved, target, gapText: after[target], state, pressed, gapOpen, clearedState: q.getAttribute('data-state') };
  }, EXPECT.scopes);

  if (scopeTest.error) {
    check(label, 'per-panel scope independence', false, scopeTest.error);
  } else {
    check(label, 'answering a question records its state', scopeTest.state === 'no', `data-state=${scopeTest.state}`);
    check(label, 'the chosen button reports aria-pressed', scopeTest.pressed === 'true', `aria-pressed=${scopeTest.pressed}`);
    check(label, 'a gap answer auto-opens its guidance collapse', scopeTest.gapOpen === true, `open=${scopeTest.gapOpen}`);
    check(label, 'only the answered layer\'s panel changes', scopeTest.moved.length === 1 && scopeTest.moved[0] === scopeTest.target,
      `moved: ${scopeTest.moved.join(', ') || 'none'}`);
    check(label, 'the answered layer reports a gap', /1 gap/.test(scopeTest.gapText || ''), (scopeTest.gapText || '').trim());
    check(label, 're-clicking the same answer clears it', !scopeTest.clearedState, `data-state=${JSON.stringify(scopeTest.clearedState)}`);
  }

  // --- coverage bar: CSSOM widths, no style attribute ----------------------
  // Answer one 'yes' and one 'no' in the same layer, then read the meter. Segment WIDTHS are in count
  // units (the viewBox is 0 0 total 12), so a segment's width is literally the number of questions in
  // that state -- which is what makes this assertable without reproducing the drawing maths.
  const coverage = await page.evaluate(() => {
    const scope = 't1-agent-harness';
    const block = document.querySelector(`.assess[data-assess-group="${scope}"]`);
    const qs = [...block.querySelectorAll('[data-assess-q]')];
    const total = document.querySelectorAll(`.assess[data-assess-group="${scope}"] [data-assess-q]`).length;
    qs[0].querySelector('.seg button[data-v="yes"]').click();
    if (qs[1]) qs[1].querySelector('.seg button[data-v="no"]').click();

    const cov = document.querySelector(`.assess-report[data-ar-scope="${scope}"] [data-ar-coverage]`);
    const bar = cov.querySelector('svg.cov-bar');
    const out = {
      total,
      answered: qs[1] ? 2 : 1,
      isSvg: !!bar,
      viewBox: bar ? bar.getAttribute('viewBox') : null,
      ariaLabel: bar ? bar.getAttribute('aria-label') : null,
      role: bar ? bar.getAttribute('role') : null,
      segClasses: [...cov.querySelectorAll('rect.cov-seg')].map((p) => p.getAttribute('class')),
      // No inline style anywhere: this is the CSP property the whole component exists to satisfy.
      inlineStyled: cov.querySelectorAll('[style]').length,
      legendNumbers: [...cov.querySelectorAll('.cov-key-n')].map((n) => n.textContent),
      trackPresent: !!cov.querySelector('rect.cov-track'),
      segFill: bar ? getComputedStyle(cov.querySelector('rect.cov-seg')).fill : null
    };
    qs[0].querySelector('.seg button[data-v="yes"]').click();
    if (qs[1]) qs[1].querySelector('.seg button[data-v="no"]').click();
    try { localStorage.removeItem('tokenomics-assessment-v1'); } catch (e) {}
    // Cleared state: the old bar blanked itself. This one keeps the track and the legend, which says
    // "this layer has N questions and none are answered" -- more useful than an empty box. So what
    // must be true is that no SEGMENT survives, not that the container is empty.
    out.clearedSegments = cov.querySelectorAll('rect.cov-seg').length;
    out.clearedOpenCount = (cov.querySelector('.cov-key-open .cov-key-n') || {}).textContent;
    return out;
  });
  check(label, 'coverage meter renders as SVG', coverage.isSvg && coverage.role === 'img', `role=${coverage.role}`);
  check(label, 'viewBox is in count units', coverage.viewBox === `0 0 ${coverage.total} 12`, String(coverage.viewBox));
  check(label, 'a track shows the unanswered remainder', coverage.trackPresent, 'rect.cov-track');
  check(label, 'one segment per answered state, in fixed order',
    coverage.segClasses.length === 2 && /cov-yes/.test(coverage.segClasses[0]) && /cov-no/.test(coverage.segClasses[1]),
    coverage.segClasses.join(' | '));
  check(label, 'segment fill comes from a theme token', !!coverage.segFill && coverage.segFill !== 'none', String(coverage.segFill));
  check(label, 'coverage meter uses no inline styles', coverage.inlineStyled === 0, `${coverage.inlineStyled} found`);
  check(label, 'every state is numbered, so identity is not colour-alone',
    coverage.legendNumbers.length >= 4, coverage.legendNumbers.join(','));
  check(label, 'accessible label states the counts',
    !!coverage.ariaLabel && /2 of \d+ questions answered/.test(coverage.ariaLabel), coverage.ariaLabel || 'missing');
  check(label, 'clearing answers removes every segment', coverage.clearedSegments === 0, `${coverage.clearedSegments} segments`);
  check(label, 'cleared meter reports the whole layer as unanswered',
    coverage.clearedOpenCount === String(coverage.total), `${coverage.clearedOpenCount} of ${coverage.total}`);

  // --- theme ---------------------------------------------------------------
  const theme = await page.evaluate(() => {
    const button = document.getElementById('themeToggle');
    const visibleText = () => (button.querySelector('[data-theme-label]') || {}).textContent || '';
    const before = { attr: document.documentElement.getAttribute('data-theme'), bg: getComputedStyle(document.body).backgroundColor, text: visibleText() };
    button.click();
    const after = { attr: document.documentElement.getAttribute('data-theme'), bg: getComputedStyle(document.body).backgroundColor, text: visibleText() };
    button.click();
    return { before, after };
  });
  check(label, 'theme toggle flips data-theme', theme.before.attr !== theme.after.attr, `${theme.before.attr} -> ${theme.after.attr}`);
  check(label, 'theme toggle actually repaints', theme.before.bg !== theme.after.bg, `${theme.before.bg} -> ${theme.after.bg}`);
  check(label, 'theme toggle has visible text in both states',
    /^(Light|Dark)$/.test(theme.before.text) && /^(Light|Dark)$/.test(theme.after.text) && theme.before.text !== theme.after.text,
    `${theme.before.text} -> ${theme.after.text}`);

  // --- markdown export ----------------------------------------------------
  // Drive the real handler rather than re-implementing it: stub the clipboard, click Copy, read back.
  const md = await page.evaluate(async () => {
    let captured = null;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (t) => { captured = t; return Promise.resolve(); } }
    });
    const panel = document.querySelector('.assess-report[data-ar-scope="model-inference"]');
    panel.querySelector('[data-ar-copy]').click();
    await new Promise((r) => setTimeout(r, 50));
    return captured;
  });
  check(label, 'Copy report produces markdown', typeof md === 'string' && md.length > 100, `${md ? md.length : 0} chars`);
  check(label, 'markdown has a coverage line and a gaps section',
    !!md && /^Coverage: /m.test(md) && /^## Gaps to address$/m.test(md), 'both present');
  // The static site has no sign-in, so the report is dated rather than attributed.
  check(label, 'markdown carries an assessor/date stamp', !!md && /^Assessed on \d/m.test(md),
    (md || '').split('\n').find((l) => l.startsWith('Assessed')) || 'missing');
  check(label, 'markdown report carries no injected link text', !!md && !/Suggest a change/.test(md), 'clean');
  check(label, 'markdown report heading carries the public brand',
    !!md && /^# AI Tokenomics FinOps assessment — /.test(md), (md || '').split('\n')[0]);

  // --- Track 2 assessment scope (site/src/js/scope.mjs) ----------------------
  // A lever taken out of scope must leave every count, be hidden with its sidebar entry and figure box,
  // survive a reload, name itself in the export, and come back on Reset. Each is a separate failure mode.
  const scope = await page.evaluate(async () => {
    const out = {};
    const t2Qs = () => [...document.querySelectorAll('#track-2 [data-assess-q]')].filter((q) => !q.closest('[hidden]')).length;
    const dashMax = () => document.querySelector('[data-track-dashboard="t2"] [data-ad-progress]').getAttribute('aria-valuemax');
    const harness = () => document.querySelector('.assess-report[data-ar-scope="agent-harness"] [data-ar-count]').textContent;
    out.pickers = document.querySelectorAll('[data-scope-picker]').length;
    out.pickerLevers = [...document.querySelectorAll('[data-scope-picker] input[data-scope-lever]')].map((i) => i.getAttribute('data-scope-lever'));
    out.boxes = document.querySelectorAll('svg.decflow [data-scope-lever]').length;
    out.before = { qs: t2Qs(), max: dashMax(), harness: harness() };
    document.querySelector('input[data-scope-lever="distill-when-volume-justifies-it"]').click();
    document.querySelector('svg#agent-harness-components [data-scope-lever="bound-the-reasoning-loop"] rect')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 30));
    out.after = {
      qs: t2Qs(), max: dashMax(), harness: harness(),
      heading: document.getElementById('bound-the-reasoning-loop').hidden,
      assess: document.querySelector('.assess[data-assess-lever="Orchestration"]').hasAttribute('data-scope-out'),
      nav: !!document.querySelector('#sidebar a[href="#bound-the-reasoning-loop"]').closest('li').hidden,
      box: document.querySelector('svg#agent-harness-components [data-scope-lever="bound-the-reasoning-loop"]').classList.contains('df-off'),
      checkbox: document.querySelector('input[data-scope-lever="bound-the-reasoning-loop"]').checked,
      notes: [...document.querySelectorAll('[data-scope-out-note]')].filter((n) => !n.hidden).map((n) => n.textContent)
    };
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem('tokenomics-assessment-scope-v1') || 'null'); } catch (e) {}
    out.stored = stored;
    let captured = '';
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t) => { captured = t; return Promise.resolve(); } } });
    document.querySelector('[data-track-dashboard="t2"] [data-ad-copy]').click();
    await new Promise((r) => setTimeout(r, 50));
    out.mdOutLine = (captured.match(/^Out of scope.*$/m) || [''])[0];
    const realConfirm = window.confirm; window.confirm = () => true;
    document.querySelector('[data-track-dashboard="t2"] [data-ad-reset]').click();
    window.confirm = realConfirm;
    await new Promise((r) => setTimeout(r, 30));
    out.reset = { qs: t2Qs(), max: dashMax(), off: document.querySelectorAll('svg .df-scope.df-off').length, out: document.querySelectorAll('.assess[data-scope-out]').length };
    out.readMore = {
      total: document.querySelectorAll('#track-2 details.read-more').length,
      nested: [...document.querySelectorAll('#track-2 details.read-more')].every((d) => !!d.closest('details.assess-gap')),
      leadFirst: [...document.querySelectorAll('#track-2 .gap-body')].every((g) => g.firstElementChild && g.firstElementChild.classList.contains('gap-lead')),
      t1Untouched: document.querySelectorAll('#track-1 details.read-more').length
    };
    return out;
  });
  check(label, 'one scope picker under each Track 2 figure, one box per lever', scope.pickers === 3 && scope.boxes === 15 && scope.pickerLevers.length === 15,
    `${scope.pickers} pickers, ${scope.boxes} boxes, ${scope.pickerLevers.length} inputs`);
  check(label, 'picker levers are exactly the Track 2 lever headings, in order',
    scope.pickerLevers.join(',') === EXPECT_T2_LEVER_IDS.join(','), scope.pickerLevers.join(','));
  check(label, 'scope starts complete', scope.before.qs === EXPECT.tracks.t2.questions && scope.before.max === String(EXPECT.tracks.t2.questions),
    `${scope.before.qs} visible, max ${scope.before.max}`);
  check(label, 'unticking a lever and clicking a figure box both remove their questions from every count',
    scope.after.qs === EXPECT.tracks.t2.questions - 6 && scope.after.max === String(EXPECT.tracks.t2.questions - 6) && /0\/13 answered/.test(scope.after.harness),
    `${scope.after.qs} visible, max ${scope.after.max}, harness "${scope.after.harness}"`);
  check(label, 'an excluded lever is hidden with its sidebar entry and figure box, and its checkbox clears',
    scope.after.heading && scope.after.assess && scope.after.nav && scope.after.box && !scope.after.checkbox, JSON.stringify(scope.after));
  check(label, 'each picker names what it excluded', scope.after.notes.length === 2 && scope.after.notes.every((n) => /^Out of scope: /.test(n)), scope.after.notes.join(' | '));
  check(label, 'scope persists under its own key', Array.isArray(scope.stored) && scope.stored.length === 2, JSON.stringify(scope.stored));
  check(label, 'the export says what was left out', /^Out of scope \(excluded from every count above\): .*Orchestration/.test(scope.mdOutLine), scope.mdOutLine || 'missing');
  check(label, 'Reset Track 2 re-includes every lever', scope.reset.qs === EXPECT.tracks.t2.questions && scope.reset.off === 0 && scope.reset.out === 0,
    `${scope.reset.qs} visible, ${scope.reset.off} boxes off, ${scope.reset.out} blocks out`);
  check(label, 'every Track 2 gap panel opens with a lead and nests its Read more; Track 1 has none',
    scope.readMore.leadFirst && scope.readMore.nested && scope.readMore.total >= 30 && scope.readMore.t1Untouched === 0, JSON.stringify(scope.readMore));

  // --- print path ---------------------------------------------------------
  const printed = await page.evaluate(() => {
    const panel = document.querySelector('.assess-report[data-ar-scope="end-user"]');
    // window.print would block a headless run, so neutralise it and inspect what was staged.
    const realPrint = window.print;
    let called = false;
    window.print = () => { called = true; };
    panel.querySelector('[data-ar-pdf]').click();
    const root = document.getElementById('assess-print-root');
    const out = {
      called,
      printing: document.body.classList.contains('assess-printing'),
      hasHeading: !!root && !!root.querySelector('h1'),
      heading: root && root.querySelector('h1') ? root.querySelector('h1').textContent.trim() : null,
      inlineStyles: root ? root.querySelectorAll('[style]').length : -1
    };
    window.print = realPrint;
    document.body.classList.remove('assess-printing');
    return out;
  });
  check(label, 'Export as PDF stages a print document', printed.called && printed.hasHeading, `print() called=${printed.called}`);
  check(label, 'print root carries no inline styles', printed.inlineStyles === 0, `${printed.inlineStyles} found`);
  // Was a check that the old version tag was a class rather than an inline style. The tag is gone with
  // the rebrand, so the check now pins the report's public heading instead (and inline styles stay at 0 above).
  check(label, 'print report heading carries the public brand', printed.heading === 'AI Tokenomics FinOps assessment',
    JSON.stringify(printed.heading));

  // --- the at-a-glance map, and Figure 2's cross-track connector ----------
  // Both live in the Cost map pane, and the connector checks drive a real pointer, so the pane has to be up.
  await openLandingGuide(page);
  const mapAndLinks = await page.evaluate(async () => {
    const out = {};
    const meta = () => [...document.querySelectorAll('.mapgrid a.cell')]
      .map((c) => (c.querySelector('[data-cell-meta]') || {}).textContent || '');

    out.glyphs = document.querySelectorAll('.mapgrid .col-h svg.col-glyph').length;
    // Lever counts must match the taxonomy: Track 1 is 4/2/4, Track 2 is 5/11/4.
    out.counts = meta().map((t) => (t.match(/^(\d+) lever/) || [])[1]);
    // On a first visit a row of 0/12 is discouraging noise, so coverage appears only once answered.
    out.coverageBeforeAnswering = meta().some((t) => /\d+\/\d+/.test(t));

    const answer = (sc, v) => {
      const qs = [...document.querySelectorAll(`.assess[data-assess-group="${sc}"] [data-assess-q]`)];
      qs.forEach((q, i) => { if (v[i]) q.querySelector(`.seg button[data-v="${v[i]}"]`).click(); });
    };
    answer('t1-model-inference', ['yes', 'no', 'wip']);
    out.coverageAfterAnswering = meta()[0];
    out.otherCellsStillQuiet = !/\d+\/\d+/.test(meta()[1]);
    out.cellTagged = document.querySelector('.mapgrid a.cell').getAttribute('data-track');
    // clean up
    answer('t1-model-inference', ['yes', 'no', 'wip']);
    try { localStorage.removeItem('tokenomics-assessment-v1'); } catch (e) {}

    // Connector: transient, and it must never intercept a click meant for a chip.
    //
    // Named levers, not "whichever chip is first": the pair that was broken was the one whose Track 1 end is
    // a question rather than a lever, and taking the first `[data-twin]` chip tested a pair that already
    // worked. `drawn()` counts curves rather than asking whether any exists, because a lever with two
    // counterparts that draws one curve is the other way this fails quietly.
    const rails = document.querySelector('.csm-board');
    const chipFor = (id) => document.querySelector('#trackExplorer .csm-lever[data-lever-id="' + id + '"]');
    const drawn = () => [...document.querySelectorAll('.te-link')].filter((p) => !!p.getAttribute('d')).length;
    const lit = () => document.querySelectorAll('#trackExplorer .te-chip.twinlit').length;
    out.overlayIgnoresClicks = getComputedStyle(document.querySelector('.te-links')).pointerEvents;
    out.noLinkAtRest = drawn() === 0;
    out.boardHeightAtRest = document.querySelector('.csm-board').offsetHeight;

    // Single-counterpart control: context hygiene crosses from Track 2 Agent Harness to Track 1 End User.
    const chip = chipFor('design-memory-and-compaction-as-architecture');
    chip.dispatchEvent(new MouseEvent('mouseenter'));
    await new Promise((r) => setTimeout(r, 80));
    out.linkOnHover = drawn() === 1;
    out.railsLit = rails.classList.contains('has-link');
    out.twinLit = lit();
    chip.dispatchEvent(new MouseEvent('mouseleave'));
    await new Promise((r) => setTimeout(r, 60));
    out.linkCleared = drawn() === 0;
    // Keyboard users get it too, not just mouse users.
    chip.dispatchEvent(new FocusEvent('focus'));
    await new Promise((r) => setTimeout(r, 60));
    out.linkOnFocus = drawn() === 1;
    chip.dispatchEvent(new FocusEvent('blur'));

    // Routing and lifecycle treatments converge on the same cross-track row, so duplicate curves collapse.
    const multi = chipFor('route-to-the-right-model');
    multi.dispatchEvent(new MouseEvent('mouseenter'));
    await new Promise((r) => setTimeout(r, 80));
    out.multiCurves = drawn();
    out.multiLit = lit();
    multi.dispatchEvent(new MouseEvent('mouseleave'));
    await new Promise((r) => setTimeout(r, 60));
    out.multiCleared = drawn() === 0;
    return out;
  });

  check(label, 'map columns carry a layer glyph', mapAndLinks.glyphs === 3, `${mapAndLinks.glyphs}`);
  check(label, 'map cells state how many levers they hold',
    mapAndLinks.counts.join(',') === '4,3,4,5,7,3', mapAndLinks.counts.join(','));
  check(label, 'map shows no coverage before anything is answered', !mapAndLinks.coverageBeforeAnswering, 'counts only');
  check(label, 'map shows coverage once answered, only for that cell',
    /3\/12/.test(mapAndLinks.coverageAfterAnswering) && mapAndLinks.otherCellsStillQuiet,
    mapAndLinks.coverageAfterAnswering);
  check(label, 'map cells know their track', mapAndLinks.cellTagged === 't1', String(mapAndLinks.cellTagged));
  check(label, 'connector is absent at rest', mapAndLinks.noLinkAtRest, 'no path');
  // Both ends light, not just the far one: on a board the twin can be two rows and a column away, so the
  // pair has to be identifiable as a pair rather than as one highlight and one curve. The lever exercised
  // here is the one whose counterpart is a question inside another lever, so this only passes if the anchor
  // was resolved to the lever that owns it.
  check(label, 'connector draws to the cross-track twin on hover, lighting both ends',
    mapAndLinks.linkOnHover && mapAndLinks.railsLit && mapAndLinks.twinLit === 2,
    `path=${mapAndLinks.linkOnHover}, rows lit=${mapAndLinks.twinLit}`);
  // A lever with two counterparts that drew one curve would say the other does not exist.
  check(label, 'duplicate shared treatments collapse to one curve and two ends',
    mapAndLinks.multiCurves === 1 && mapAndLinks.multiLit === 2,
    `${mapAndLinks.multiCurves} curve(s), ${mapAndLinks.multiLit} rows lit`);
  check(label, 'connector clears on leave', mapAndLinks.linkCleared && mapAndLinks.multiCleared, 'cleared');
  check(label, 'connector works on keyboard focus too', mapAndLinks.linkOnFocus, 'drawn on focus');
  check(label, 'connector overlay never intercepts a click', mapAndLinks.overlayIgnoresClicks === 'none',
    `pointer-events: ${mapAndLinks.overlayIgnoresClicks}`);

  // A REAL pointer, because a synthetic `mouseenter` never activates `:hover`. That blind spot hid two live
  // faults: the per-track `:hover` rule outweighs `.twinlit`, so the row under the pointer kept its hover
  // colour and the pair did not read as a pair; and counting the `twinlit` CLASS could never have caught it.
  // Both ends must RENDER alike, which is theme-independent and is the property a reader actually sees.
  const NEAR = 'route-to-the-right-model';
  const FAR = 'right-size-the-model-to-the-task';
  const pt = await page.evaluate(async (NEAR) => {
    const sel = `#trackExplorer .csm-lever[data-lever-id="${NEAR}"]`;
    document.querySelector(sel).scrollIntoView({ block: 'center', behavior: 'instant' });
    let last = -1;
    for (let i = 0; i < 40 && last !== window.scrollY; i++) { last = window.scrollY; await new Promise((r) => setTimeout(r, 50)); }
    const r = document.querySelector(sel).getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  }, NEAR);
  await page.mouse.move(pt.x - 200, pt.y - 120);
  await page.mouse.move(pt.x, pt.y, { steps: 12 });
  await new Promise((r) => setTimeout(r, 400));
  const hovered = await page.evaluate((NEAR, FAR) => {
    const row = (id) => document.querySelector(`#trackExplorer .csm-lever[data-lever-id="${id}"]`);
    const near = row(NEAR);
    const chips = [...near.parentElement.querySelectorAll('.csm-twin')];
    return {
      cssHover: !!document.querySelector(`#trackExplorer .csm-lever[data-lever-id="${NEAR}"]:hover`),
      nearBorder: getComputedStyle(near).borderTopColor,
      farBorder: getComputedStyle(row(FAR)).borderTopColor,
      chipShown: chips.length > 0 && chips.some((chip) => getComputedStyle(chip.parentElement).display !== 'none'),
      chipHrefs: chips.map((chip) => chip.getAttribute('href')),
      chipNamesLayer: chips.length > 0 && chips.every((chip) => /Track \d, (Model Inference|Agent Harness|End User): ./.test(chip.textContent)),
      deepTreatmentExists: !!document.getElementById('manage-the-model-lifecycle'),
      boardH: document.querySelector('.csm-board').offsetHeight
    };
  }, NEAR, FAR);
  await page.mouse.move(0, 0);
  check(label, 'a real pointer reaches the row (synthetic mouseenter never sets :hover)', hovered.cssHover, ':hover active');
  check(label, 'both ends of a pair RENDER alike, including the one under the pointer',
    hovered.cssHover && hovered.nearBorder === hovered.farBorder,
    `near ${hovered.nearBorder} vs far ${hovered.farBorder}`);
  // The counterpart is 820-1090px away on a 1489px board, so it is off screen at every realistic viewport.
  // The chip is what makes "shared" somewhere the reader can go rather than a line into the offscreen.
  check(label, 'hovering a shared lever offers a link to its counterpart, naming its track and layer',
    hovered.chipShown && hovered.chipNamesLayer, hovered.chipHrefs.join(', ') || 'no chip');
  // Routing and lifecycle now share one consolidated Track 2 row, so duplicate links to the same Track 1
  // row collapse to its owning lever. The deep lifecycle treatment must still remain a resolvable anchor.
  check(label, 'the consolidated counterpart links to its owner and preserves the deep treatment anchor',
    hovered.chipHrefs.includes('#right-size-the-model-to-the-task') && hovered.deepTreatmentExists,
    `${hovered.chipHrefs.join(', ')}; deep treatment=${hovered.deepTreatmentExists}`);
  // Revealing the chip must not reflow the board, or the ResizeObserver would wipe the curve on hover.
  check(label, 'revealing the counterpart does not resize the board',
    hovered.boardH === mapAndLinks.boardHeightAtRest,
    `${mapAndLinks.boardHeightAtRest} -> ${hovered.boardH}`);

  // --- dedicated track dashboards and isolated assessment actions ---------
  const dashboards = await page.evaluate(async () => {
    const answer = (scope, vals) => {
      const qs = [...document.querySelectorAll(`.assess[data-assess-group="${scope}"] [data-assess-q]`)];
      qs.forEach((q, i) => { if (vals[i]) q.querySelector(`.seg button[data-v="${vals[i]}"]`).click(); });
    };
    const t1 = document.querySelector('[data-track-dashboard="t1"]');
    const t2 = document.querySelector('[data-track-dashboard="t2"]');
    if (!t1 || !t2) return { missing: true };

    const emptyBefore = [t1, t2].every((dash) => !dash.querySelector('[data-ad-empty]').hidden);
    const startBefore = [t1, t2].map((dash) => ({
      text: dash.querySelector('[data-ad-start]').textContent,
      href: dash.querySelector('[data-ad-start]').getAttribute('href'),
      emptyHref: (dash.querySelector('[data-ad-empty] a') || {}).getAttribute?.('href') || null
    }));
    const note = document.querySelectorAll('.assess[data-assess-group="t1-model-inference"] [data-assess-note]')[1];
    note.value = 'Owner follow-up';
    note.dispatchEvent(new Event('input', { bubbles: true }));
    answer('t1-model-inference', ['yes', 'no', 'wip']);
    answer('agent-harness', ['yes', 'yes', 'no']);

    const readDash = (dash) => ({
      rows: dash.querySelectorAll('.ad-row').length,
      rowTitles: [...dash.querySelectorAll('.ad-row-title')].map((n) => n.textContent),
      rowLinks: [...dash.querySelectorAll('.ad-row-title')].map((n) => n.getAttribute('href')),
      compactBars: dash.querySelectorAll('.cov-compact svg.cov-bar').length,
      metrics: [...dash.querySelectorAll('.ad-metric-n')].map((n) => n.textContent),
      gaps: dash.querySelectorAll('[data-ad-gap-list] li').length,
      notes: (dash.querySelector('[data-ad-gap-list]') || {}).textContent || '',
      max: (dash.querySelector('[data-ad-progress]') || {}).getAttribute('aria-valuemax'),
      now: (dash.querySelector('[data-ad-progress]') || {}).getAttribute('aria-valuenow'),
      state: dash.getAttribute('data-assessment-state'),
      startText: dash.querySelector('[data-ad-start]').textContent,
      startHref: dash.querySelector('[data-ad-start]').getAttribute('href'),
      expandHidden: dash.querySelector('[data-ad-expand]').hidden,
      collapseHidden: dash.querySelector('[data-ad-collapse]').hidden
    });
    const t1BeforeReset = readDash(t1);
    const t2BeforeReset = readDash(t2);
    const cardsBeforeReset = [...document.querySelectorAll('[data-track-card]')].map((card) => ({
      key: card.getAttribute('data-track-card'),
      now: card.querySelector('[data-track-card-progressbar]').getAttribute('aria-valuenow'),
      max: card.querySelector('[data-track-card-progressbar]').getAttribute('aria-valuemax'),
      action: card.querySelector('[data-track-card-action]').textContent
    }));

    let captured = null;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true, value: { writeText: (text) => { captured = text; return Promise.resolve(); } }
    });
    t1.querySelector('[data-ad-copy]').click();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const t1Markdown = captured;

    const realPrint = window.print; let printed = false;
    window.print = () => { printed = true; };
    t2.querySelector('[data-ad-pdf]').click();
    const titleDuringPrint = document.title;
    const root = document.getElementById('assess-print-root');
    const printInfo = {
      printed,
      titleDuringPrint,
      cover: !!root && !!root.querySelector('.apr-cover'),
      text: root ? root.textContent : '',
      inlineStyles: root ? root.querySelectorAll('[style]').length : -1
    };
    window.print = realPrint;
    document.body.classList.remove('assess-printing');

    document.querySelectorAll('#track-1 details.lever-why, #track-1 details.assess-gap, #track-2 details.lever-why, #track-2 details.assess-gap')
      .forEach((details) => { details.open = false; });
    t1.querySelector('[data-ad-expand]').click();
    const expandIsolation = [...document.querySelectorAll('#track-1 details.lever-why, #track-1 details.assess-gap')].every((d) => d.open)
      && [...document.querySelectorAll('#track-2 details.lever-why, #track-2 details.assess-gap')].every((d) => !d.open);
    t1.querySelector('[data-ad-collapse]').click();
    const collapseIsolation = [...document.querySelectorAll('#track-1 details.lever-why, #track-1 details.assess-gap')].every((d) => !d.open);

    const realConfirm = window.confirm;
    window.confirm = () => true;
    t1.querySelector('[data-ad-reset]').click();
    const t1Cleared = [...document.querySelectorAll('#track-1 [data-assess-q]')].every((q) => !q.getAttribute('data-state'));
    const t2Preserved = [...document.querySelectorAll('#track-2 [data-assess-q]')].filter((q) => q.getAttribute('data-state')).length === 3;
    t2.querySelector('[data-ad-reset]').click();
    window.confirm = realConfirm;
    try { localStorage.removeItem('tokenomics-assessment-v1'); localStorage.removeItem('tokenomics-assessment-notes-v1'); } catch (e) {}

    return {
      emptyBefore,
      startBefore,
      cards: cardsBeforeReset,
      t1: t1BeforeReset,
      t2: t2BeforeReset,
      t1Markdown,
      print: printInfo,
      expandIsolation,
      collapseIsolation,
      t1Cleared,
      t2Preserved
    };
  });

  check(label, 'two dedicated dashboards exist and start empty', !dashboards.missing && dashboards.emptyBefore,
    `missing=${dashboards.missing}, empty=${dashboards.emptyBefore}`);
  check(label, 'each track has a primary Start assessment action and a linked empty-state next step',
    dashboards.startBefore.every((start) => start.text === 'Start assessment' && /^#question-/.test(start.href) && /^#t[12]-model-inference$/.test(start.emptyHref)),
    dashboards.startBefore.map((start) => `${start.text} ${start.href} empty=${start.emptyHref}`).join(' | '));
  check(label, 'primary actions advance to Continue assessment after progress',
    dashboards.t1.startText === 'Continue assessment' && /^#question-/.test(dashboards.t1.startHref)
      && dashboards.t2.startText === 'Continue assessment' && /^#question-/.test(dashboards.t2.startHref),
    `Track 1=${dashboards.t1.startText} ${dashboards.t1.startHref}; Track 2=${dashboards.t2.startText} ${dashboards.t2.startHref}`);
  check(label, 'only Expand all guidance is shown until every disclosure is open',
    !dashboards.t1.expandHidden && dashboards.t1.collapseHidden
      && !dashboards.t2.expandHidden && dashboards.t2.collapseHidden,
    `Track 1 expand=${!dashboards.t1.expandHidden}/collapse=${!dashboards.t1.collapseHidden}`);
  check(label, 'each track dashboard shows exactly its three layers',
    dashboards.t1.rows === 3 && dashboards.t2.rows === 3,
    `Track 1=${dashboards.t1.rows}, Track 2=${dashboards.t2.rows}`);
  check(label, 'dashboard totals use exact per-track question counts',
    dashboards.t1.max === '35' && dashboards.t2.max === '34' && dashboards.t1.now === '3' && dashboards.t2.now === '3',
    `Track 1 ${dashboards.t1.now}/${dashboards.t1.max}; Track 2 ${dashboards.t2.now}/${dashboards.t2.max}`);
  check(label, 'landing cards show isolated exact progress and continue actions',
    dashboards.cards[0].key === 't1' && dashboards.cards[0].now === '3' && dashboards.cards[0].max === '35'
      && dashboards.cards[1].key === 't2' && dashboards.cards[1].now === '3' && dashboards.cards[1].max === '34'
      && dashboards.cards.every((card) => /Continue assessment/.test(card.action)),
    dashboards.cards.map((card) => `${card.key}:${card.now}/${card.max} ${card.action}`).join(' | '));
  check(label, 'applicable-answer score excludes N/A and unanswered questions',
    dashboards.t1.metrics[2] === '33%' && dashboards.t2.metrics[2] === '67%',
    `Track 1=${dashboards.t1.metrics[2]}, Track 2=${dashboards.t2.metrics[2]}`);
  check(label, 'gap summaries and notes stay in their owning track',
    dashboards.t1.gaps === 2 && dashboards.t2.gaps === 1 && /Owner follow-up/.test(dashboards.t1.notes),
    `Track 1 gaps=${dashboards.t1.gaps}, Track 2 gaps=${dashboards.t2.gaps}`);
  check(label, 'dashboard rows use track-only links and compact coverage meters',
    dashboards.t1.compactBars === 3 && dashboards.t2.compactBars === 3
      && dashboards.t1.rowLinks.every((href) => /^#t1-/.test(href))
      && dashboards.t2.rowLinks.every((href) => !/^#t1-/.test(href)),
    `${dashboards.t1.rowLinks.join(',')} | ${dashboards.t2.rowLinks.join(',')}`);
  check(label, 'Track 1 markdown contains three Track 1 layers and no Track 2 layer',
    !!dashboards.t1Markdown
      && (dashboards.t1Markdown.match(/^\| Track 1 /gm) || []).length === 3
      && !/^\| Track 2 /m.test(dashboards.t1Markdown),
    `${(dashboards.t1Markdown || '').length} chars`);
  check(label, 'Track 2 print is concise, track-only and explicitly incomplete',
    dashboards.print.printed && dashboards.print.cover
      && /ai-tokenomics-assessment-track-2/.test(dashboards.print.titleDuringPrint)
      && /Track 2/.test(dashboards.print.text) && !/Track 1/.test(dashboards.print.text)
      && /Incomplete assessment/.test(dashboards.print.text)
      && /omits 31 unanswered questions/.test(dashboards.print.text)
      && !/\[unanswered\]/.test(dashboards.print.text),
    dashboards.print.titleDuringPrint || 'unchanged');
  check(label, 'track print report carries no inline styles', dashboards.print.inlineStyles === 0,
    `${dashboards.print.inlineStyles}`);
  check(label, 'expand and collapse actions touch only the current track',
    dashboards.expandIsolation && dashboards.collapseIsolation,
    `expand=${dashboards.expandIsolation}, collapse=${dashboards.collapseIsolation}`);
  check(label, 'reset-current-track clears Track 1 without changing Track 2',
    dashboards.t1Cleared && dashboards.t2Preserved,
    `Track 1 cleared=${dashboards.t1Cleared}, Track 2 preserved=${dashboards.t2Preserved}`);

  // --- wayfinder: track focus, rail map, stepper ---------------------------
  // The properties that matter here are (a) the reader can always tell which track and layer they are in,
  // and (b) focusing a track never removes content from the page -- only from the navigation.
  const wf = await page.evaluate(async () => {
    try { localStorage.removeItem('tokenomics-scope-v1'); } catch (e) {}
    // checkVisibility() walks ancestors; getComputedStyle(n).display does not, so a link inside a hidden
    // <ul> would read as visible.
    const vis = (n) => !!n && (n.checkVisibility ? n.checkVisibility() : n.offsetParent !== null);
    const out = {};

    // Before choosing: the rail keeps its no-JS fallback list and offers the choice.
    out.fallbackPresent = !!document.querySelector('.rail-fallback');
    out.choiceCards = document.querySelectorAll('[data-choose-track]').length;
    // The cards must be real anchors so they still jump with JS off.
    out.cardsAreLinks = [...document.querySelectorAll('[data-choose-track]')]
      .every((a) => a.tagName === 'A' && (a.getAttribute('href') || '').startsWith('#'));

    // Choose Track 2, wait for the route pipeline to finish, then land on a lever deep inside its second
    // layer. A fixed delay races the bounded post-scroll correction on slower or mobile-shaped layouts.
    document.querySelector('[data-choose-track="t2"]').click();
    for (let i = 0; i < 100 && document.activeElement?.id !== 'track-2'; i++) {
      await new Promise((r) => setTimeout(r, 25));
    }
    document.getElementById('bound-the-reasoning-loop').scrollIntoView({ behavior: 'instant', block: 'start' });
    window.dispatchEvent(new Event('scroll'));
    await new Promise((r) => setTimeout(r, 400));

    out.dataScope = document.documentElement.getAttribute('data-scope');

    // REGRESSION GUARD. Scroll-spy used to pick the topmost intersecting target, and section#track-2 is
    // thousands of pixels tall, so it always won: the breadcrumb said "Overview & levers" for the whole
    // track and never named the lever. The active id must now be the most specific heading.
    out.breadcrumbSection = (document.getElementById('bcSection') || {}).textContent;
    out.breadcrumbTrack = (document.getElementById('bcTrack') || {}).textContent;

    const map = document.getElementById('wayfinder');
    out.mapVisible = vis(map);
    out.fallbackHidden = document.querySelector('.rail-fallback').hidden;
    out.stops = map ? map.querySelectorAll('.trk-stop').length : 0;
    out.hereStop = map ? (map.querySelector('.trk-stop.is-here .trk-stop-name') || {}).textContent : null;
    out.rings = map ? map.querySelectorAll('.trk-ring').length : 0;
    // Only the current layer lists its levers.
    out.expandedLayers = map ? map.querySelectorAll('.trk-stop.is-here .trk-levers').length : 0;
    out.otherLayersExpanded = map ? map.querySelectorAll('.trk-stop:not(.is-here) .trk-levers').length : 0;
    out.hereLever = map ? (map.querySelector('.trk-lever[aria-current="true"]') || {}).textContent : null;
    // Names must not include the injected heading anchor or the "shared" pill.
    out.namesClean = map ? [...map.querySelectorAll('.trk-stop-name, .trk-lever')]
      .every((n) => !/#$/.test(n.textContent.trim()) && !/shared$/i.test(n.textContent.trim())) : false;

    // Focus is NAVIGATION only: Track 1 leaves the sidebar but stays in the document.
    out.t1NavHidden = !vis(document.querySelector('.sidebar ul[data-nav-scope="t1"]'));
    out.t2NavShown = vis(document.querySelector('.sidebar ul[data-nav-scope="t2"]'));
    // Wrap-up shows while WORKING (either track) but not while orienting -- see 65-wayfinder.css.
    out.wrapShownInTrack = vis(document.querySelector('.sidebar ul[data-nav-scope="wrap"]'));
    out.overviewHidden = !vis(document.querySelector('.sidebar ul[data-nav-scope="overview"]'));
    out.t1SectionStillInPage = !!document.getElementById('track-1');
    out.t1LeversStillInPage = document.querySelectorAll('#track-1 h4[id]').length;
    out.t1AssessStillInPage = document.querySelectorAll('.assess[data-assess-group^="t1-"]').length;

    out.switcherTrack = (document.querySelector('.tabs .tab[aria-current="page"] .tab-lead') || {}).textContent;

    // ONE SIDE CARRIES THE NUMBERS. The sidebar used to state coverage twice over -- a badge on every layer
    // link and `10 levers 3/30 3g` on every switcher row -- while the right rail said the same thing live.
    // The sidebar is navigation now, so nothing in it may show a count.
    out.sidebarDigits = [...document.querySelectorAll('.sidebar a.nav-link, .scope-opt')]
      .map((n) => n.textContent).filter((t) => /\d+\s*\/\s*\d+|\d+\s*levers?|\d+g\b/.test(t));
    out.deadNumberClasses = document.querySelectorAll(
      '.sidebar .nav-cov, .scope-opt-cov, .scope-opt-lev, .scope-opt-gaps').length;
    // ...and the rail still does, because that is where they went.
    out.railCounts = [...document.querySelectorAll('.rail .trk-stop-n')].filter((n) => /\d+\/\d+/.test(n.textContent)).length;
    // A reader in one track can still see the other track's progress without switching: it moved to the
    // cost structure map's track banners, which also name the gaps and can be jumped from.
    out.otherTrackProgressOnMap = [...document.querySelectorAll('.csm-rowh')]
      .every((b) => /\d+\s*levers/.test(b.textContent));
    // The map is reachable from every scope, including this one, and from the rail.
    out.mapNavShown = vis(document.querySelector('.sidebar ul[data-nav-scope="map"] a'));
    out.mapLinkInRail = !!document.querySelector('.rail .trk-map-link-2');
    // Measured HERE, inside a track, not further down after the Overview tab is clicked: renderRail() has
    // nothing to locate outside a track, so it returns before appending the footer and the link is not in the
    // DOM at all. Asserting it from orientation mode would have failed for a reason that is not the rule.
    out.resultsInRail = !!document.querySelector('.rail a[href="#your-assessment"]');
    out.persisted = (() => { try { return localStorage.getItem('tokenomics-scope-v1'); } catch (e) { return null; } })();

    // The TLDR tab is the way back to context, and it must restore the overview sections.
    document.querySelector('.tabs .tab-overview').click();
    await new Promise((r) => setTimeout(r, 60));
    out.backToOverview = document.documentElement.getAttribute('data-scope');
    out.overviewBack = vis(document.querySelector('.sidebar ul[data-nav-scope="overview"]'));
    out.tracksHiddenInOverview = !vis(document.querySelector('.sidebar ul[data-nav-scope="t1"]'))
      && !vis(document.querySelector('.sidebar ul[data-nav-scope="t2"]'));
    // Orientation mode is context only: no results, no reference, no track trees.
    out.wrapHiddenInOverview = !vis(document.querySelector('.sidebar ul[data-nav-scope="wrap"]'));
    out.overviewLinks = [...document.querySelectorAll('.sidebar ul[data-nav-scope="overview"] a')].length;
    // The Assessment group is its own group, and it is for WORKING. It used to show in every scope, because the
    // sidebar was the only route to the board; the tab bar is that route now, so in orientation mode the group
    // was a heading for a pane the reader is not in, above the three links that are actually on screen.
    out.mapGroupHiddenInOverview = !vis(document.querySelector('.sidebar ul[data-nav-scope="map"] a[href="#lever-progress"]'));
    out.mapGroupTitled = !!document.querySelector('.sidebar .nav-group-title[data-nav-scope="map"]');
    out.mapNotInOverviewGroup = !document.querySelector(
      '.sidebar ul[data-nav-scope="overview"] a[href="#lever-progress"]');
    // A SIDEBAR GROUP MAY NOT LINK OUT OF ITS OWN PANE.
    // The Overview group used to list Decision principles, which are single-homed in "Synthesis and next
    // steps" — the Reference pane. Clicking it threw the reader out of the pane they were orienting in, which
    // is not navigation, it is a trapdoor. Checked for every group rather than for that one link, because the
    // next section to move panes would recreate it silently.
    out.crossPaneNavLinks = [];
    document.querySelectorAll('.sidebar ul[data-nav-scope]').forEach((list) => {
      const groupPane = list.getAttribute('data-nav-scope');
      list.querySelectorAll('a[href^="#"]').forEach((a) => {
        const target = document.getElementById(a.getAttribute('href').slice(1));
        const owner = target && target.closest('[data-tab]');
        const panes = owner ? (owner.getAttribute('data-tab') || '').trim().split(/\s+/).filter(Boolean) : [];
        if (panes.length && !panes.includes(groupPane)) out.crossPaneNavLinks.push(`${groupPane} group -> ${a.getAttribute('href')} (${panes.join(' ')})`);
      });
    });
    // The dashboard is reachable from the tab bar and from the rail, and NOT from the sidebar. Asserted as
    // "nowhere in the sidebar" rather than "hidden in Overview", because the old single-item results list is
    // gone: a `!vis(null)` on a removed element passes for the wrong reason, and a check that cannot fail is
    // worse than no check. The intent it protects is unchanged -- offering "your assessment" to someone who has
    // answered nothing is the distraction orientation mode exists to remove.
    out.resultsNotInSidebar = !document.querySelector('.sidebar a[href="#your-assessment"]');
    out.noWrapUpLabel = ![...document.querySelectorAll('.sidebar .nav-group-title')].some((t) => /wrap.?up/i.test(t.textContent));
    return out;
  });

  check(label, 'rail keeps a no-JS fallback list', wf.fallbackPresent && wf.fallbackHidden === true, 'present and hidden once built');
  check(label, 'two track choice cards, both real links', wf.choiceCards === 2 && wf.cardsAreLinks, `${wf.choiceCards} cards`);
  check(label, 'choosing a track sets the scope', wf.dataScope === 't2', `data-scope=${wf.dataScope}`);
  check(label, 'a track scope hides the overview group', wf.overviewHidden && wf.t2NavShown, `overview hidden=${wf.overviewHidden}`);
  // 'results and reference are available while working a track' was here. It asserted the opposite of the rule
  // this sidebar now follows: a pane's navigation lists that pane and nothing else, and the tab bar is what
  // moves you. Reference is one click away from every pane instead of duplicated into each one.
  // 'the redundant Overview group title is gone' was here, measured in a TRACK scope where the whole Overview
  // group is hidden -- so `!vis(...)` was true for the wrong reason and the check could not fail. It is now
  // asserted across all five panes, next to the confinement walk.
  check(label, 'the sidebar carries no numbers at all',
    wf.sidebarDigits.length === 0 && wf.deadNumberClasses === 0,
    wf.sidebarDigits.length ? `found: ${wf.sidebarDigits.join(' | ')}` : `${wf.deadNumberClasses} legacy count elements`);
  check(label, 'the right rail still carries the live per-layer counts', wf.railCounts === 3, `${wf.railCounts} of 3 stops`);
  check(label, "the other track's progress is visible without switching", wf.otherTrackProgressOnMap,
    'on the cost map track banners');
  // Reachability moved to the tab bar, which names the Assessment pane from every pane. What matters here is
  // the inverse, and it is asserted by 'no sidebar link in any pane jumps to a different pane': a track's rail
  // and sidebar do not offer it, because offering it from there means teleporting out of the track.
  check(label, 'scroll-spy resolves to the LEVER, not the enclosing section',
    !!wf.breadcrumbSection && wf.breadcrumbSection !== 'Overview & levers',
    `breadcrumb: ${wf.breadcrumbTrack} > ${wf.breadcrumbSection}`);
  check(label, 'rail map renders one stop per layer', wf.mapVisible && wf.stops === 3, `${wf.stops} stops`);
  check(label, 'the map marks the layer you are in', (wf.hereStop || '').trim() === 'Agent Harness',
    `${wf.hereStop} (scrolled to a lever inside Agent Harness)`);
  check(label, 'every layer shows a coverage ring', wf.rings === 3, `${wf.rings}`);
  check(label, 'only the current layer lists its levers',
    wf.expandedLayers === 1 && wf.otherLayersExpanded === 0, `${wf.expandedLayers} expanded, ${wf.otherLayersExpanded} others`);
  check(label, 'the map marks the lever you are on', !!wf.hereLever, String(wf.hereLever));
  check(label, 'map names exclude the heading anchor and shared pill', wf.namesClean, 'clean');
  check(label, 'scope filters the sidebar', wf.t1NavHidden && wf.t2NavShown, `t1 hidden=${wf.t1NavHidden}, t2 shown=${wf.t2NavShown}`);
  // The whole point: focus is not deletion.
  check(label, 'the unfocused track is STILL IN THE PAGE',
    wf.t1SectionStillInPage && wf.t1LeversStillInPage === 11 && wf.t1AssessStillInPage === 11,
    `section=${wf.t1SectionStillInPage}, ${wf.t1LeversStillInPage} levers, ${wf.t1AssessStillInPage} assess blocks`);
  check(label, 'the tab bar marks the active pane', /Track 2/.test(wf.switcherTrack || ''), String(wf.switcherTrack));
  check(label, 'the choice is remembered', wf.persisted === 't2', String(wf.persisted));
  check(label, 'Overview scope restores the context sections',
    wf.backToOverview === 'overview' && wf.overviewBack && wf.tracksHiddenInOverview,
    `scope=${wf.backToOverview}, overview back=${wf.overviewBack}`);
  check(label, 'landing route shows chooser/shared-guide navigation but no track trees',
    wf.tracksHiddenInOverview && wf.overviewBack && wf.overviewLinks >= 4,
    `tracks hidden=${wf.tracksHiddenInOverview}, landing links=${wf.overviewLinks}`);
  check(label, 'no sidebar group links out of its own pane',
    wf.crossPaneNavLinks.length === 0,
    wf.crossPaneNavLinks.length ? wf.crossPaneNavLinks.join(' | ') : 'every group stays in its pane');
  check(label, 'the dashboard is offered by the tab bar, not by another pane\'s navigation',
    wf.resultsNotInSidebar, `absent from every sidebar group=${wf.resultsNotInSidebar}`);
  // Its own titled group, and shown in its own pane only. It shipped visible in four panes it did not belong
  // to, each time as a heading for a pane the reader was not in.
  check(label, 'Lever progress lives in the landing navigation and stays out of track trees',
    !wf.mapNotInOverviewGroup && !wf.mapNavShown,
    `on landing=${!wf.mapNotInOverviewGroup}, hidden in track=${!wf.mapNavShown}`);
  check(label, '"Wrap-up" is gone as a label', wf.noWrapUpLabel, 'no group titled Wrap-up');

  // The stepper is the same wayfinder at the width where the rail is not rendered. In a TRACK pane, because
  // the rail is a track instrument: outside one it had nothing to locate and fell back to a list spanning the
  // whole document, which under panes meant a rail headed "On this page" naming sections in other panes.
  await setPane(page, 't1');
  const stepper = await page.evaluate(() => ({ railVisible: getComputedStyle(document.querySelector('.rail')).display !== 'none' }));
  await page.setViewport({ width: 390, height: 844 });
  const narrow = await page.evaluate(async () => {
    // checkVisibility() walks ancestors; getComputedStyle(n).display does not, so a link inside a hidden
    // <ul> would read as visible.
    const vis = (n) => !!n && (n.checkVisibility ? n.checkVisibility() : n.offsetParent !== null);
    document.querySelector('.tabs .tab-t1').click();
    await new Promise((r) => setTimeout(r, 120));
    const target = document.getElementById('developer-education');
    target.scrollIntoView({ behavior: 'instant', block: 'start' });
    const st = document.getElementById('trackStepper');
    // Scroll-spy is observer/event driven, and changing from desktop to mobile can keep reflowing content
    // above this synthetic target after the first scrollIntoView call. Reassert the target while polling the
    // user-visible state; a real mobile page does not undergo this desktop-to-mobile transition mid-jump.
    for (let i = 0; i < 20 && !/Step 3 of 3: End User/.test((st?.querySelector('.stp-status') || {}).textContent || ''); i++) {
      target.scrollIntoView({ behavior: 'instant', block: 'start' });
      window.dispatchEvent(new Event('scroll'));
      await new Promise((r) => setTimeout(r, 50));
    }
    const out = {
      railHidden: !vis(document.querySelector('.rail')),
      stepperVisible: vis(st),
      steps: st ? st.querySelectorAll('.stp-step').length : 0,
      hereStep: st ? (st.querySelector('.stp-step[aria-current="true"] .stp-name') || {}).textContent : null,
      sticky: st ? getComputedStyle(st).position : null,
      status: st ? (st.querySelector('.stp-status') || {}).textContent : null,
      targetTop: Math.round(target.getBoundingClientRect().top),
      anchorOffset: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--anchor-offset'))
    };
    try { localStorage.removeItem('tokenomics-scope-v1'); } catch (e) {}
    return out;
  });
  await page.setViewport({ width: 1400, height: 1000 });
  check(label, 'rail is rendered at desktop width', stepper.railVisible, 'visible');
  check(label, 'stepper takes over where the rail is hidden',
    narrow.railHidden && narrow.stepperVisible, `rail hidden=${narrow.railHidden}, stepper=${narrow.stepperVisible}`);
  check(label, 'stepper shows one step per layer and marks the current one',
    narrow.steps === 3 && !!narrow.hereStep, `${narrow.steps} steps, here=${narrow.hereStep}`);
  check(label, 'stepper is sticky', narrow.sticky === 'sticky', String(narrow.sticky));
  check(label, 'mobile stepper names the current stage and position',
    /Step 3 of 3: End User/.test(narrow.status || ''),
    JSON.stringify({
      status: narrow.status || 'missing',
      targetTop: narrow.targetTop,
      anchorOffset: narrow.anchorOffset
    }));

  // --- panes: the runbook is five surfaces, and none of them deletes anything ----
  // Leadership opened this and went looking for a short version. The fix was to stop the site being one
  // 42-page scroll, so these checks are about the three properties that make panes safe rather than about
  // whether a tab looks active: content stays in the DOM, print ignores panes entirely, and a page with no
  // JavaScript is the single scrolling document it always was.
  await setPane(page, 'overview');
  const panes = await page.evaluate(async () => {
    const vis = (n) => !!n && (n.checkVisibility ? n.checkVisibility() : n.offsetParent !== null);
    const main = document.querySelector('main.content');
    const out = {};

    // Every top-level pane declares which tab it belongs to. An UNTAGGED section matches no hiding rule and
    // would therefore appear in all five panes -- which is how a feedback panel ends up on top of the TLDR.
    const sections = [...main.children].filter((n) => n.tagName === 'SECTION' || n.classList.contains('hero'));
    out.untagged = sections.filter((n) => !n.hasAttribute('data-tab')).map((n) => n.id || n.className);
    out.tabValues = [...new Set(sections.flatMap((n) => (n.getAttribute('data-tab') || '').trim().split(/\s+/).filter(Boolean)))];
    out.tabCount = document.querySelectorAll('.tabs .tab').length;
    out.tabsAreLinks = [...document.querySelectorAll('.tabs .tab')]
      .every((a) => a.tagName === 'A' && (a.getAttribute('href') || '').startsWith('#'));
    // Not role=tablist: role="tab" on an anchor strips the link semantics these deliberately keep.
    out.noTablistRole = !document.querySelector('.tabs [role="tab"], .tabs[role="tablist"]');

    // In the TLDR pane, Track 2's content is off screen but every lever of it is still in the document.
    out.t2Hidden = !vis(document.getElementById('track-2'));
    out.t2InPage = !!document.getElementById('track-2');
    out.t2LeversInPage = document.querySelectorAll('#track-2 h4[id]').length;
    out.tldrVisible = vis(document.getElementById('key-levers'));
    out.track2Names = [
      (document.querySelector('#track-2 > h2') || {}).textContent || '',
      (document.querySelector('.tab-t2 .tab-sub') || {}).textContent || '',
      (document.querySelector('.trk-card-t2 .trk-card-name') || {}).textContent || ''
    ].map((value) => value.trim());
    out.track2Definition = (document.querySelector('.trk-card-t2 .trk-card-econ') || {}).textContent || '';

    // THE NO-JAVASCRIPT CONTRACT, asserted rather than assumed: with no `data-scope` there is no pane, so
    // every section shows and the page is one scroll with every anchor resolving.
    const was = document.documentElement.getAttribute('data-scope');
    document.documentElement.removeAttribute('data-scope');
    out.allVisibleWithoutScope = sections.every((n) => vis(n));
    document.documentElement.setAttribute('data-scope', was);
    return out;
  });
  check(label, 'every top-level pane declares its tab', panes.untagged.length === 0,
    panes.untagged.length ? `untagged: ${panes.untagged.join(', ')}` : 'all tagged');
  check(label, 'surfaces use only the three known route values',
    panes.tabValues.every((v) => EXPECT.panes.includes(v)) && panes.tabValues.length === EXPECT.panes.length,
    panes.tabValues.sort().join(' '));
  check(label, 'the tab bar offers one real link per pane',
    panes.tabCount === EXPECT.panes.length && panes.tabsAreLinks && panes.noTablistRole,
    `${panes.tabCount} tabs, anchors=${panes.tabsAreLinks}, no tablist role=${panes.noTablistRole}`);
  check(label, 'Track 2 uses one stable Purpose-Built Agentic AI Application name',
    panes.track2Names.every((name) => /Purpose-Built Agentic AI Application/.test(name)),
    panes.track2Names.join(' | '));
  check(label, 'Track 2 chooser defines the model loop, inference and agent harness in plain language',
    /model plan, use tools and take actions/i.test(panes.track2Definition)
      && /model call \(inference\)/i.test(panes.track2Definition)
      && /application code \(agent harness\)/i.test(panes.track2Definition),
    panes.track2Definition);
  // The same guarantee the sidebar's focus filtering makes, now that scope hides content and not just nav.
  check(label, 'a pane hides content from VIEW, never from the document',
    panes.t2Hidden && panes.t2InPage && panes.t2LeversInPage === EXPECT.tracks.t2.levers && panes.tldrVisible,
    `t2 hidden=${panes.t2Hidden}, in page=${panes.t2InPage}, ${panes.t2LeversInPage} levers still there`);
  check(label, 'with no data-scope every pane is visible (the JavaScript-off contract)',
    panes.allVisibleWithoutScope, 'one scrolling document');

  // WHICH PANE EACH SURFACE IS IN. Leadership's second note was that the Cost map tab repeated long prose it
  // had already read. The instrument and the explanation are now separated: Assessment holds the board and the
  // dashboard, Reference holds the cost-structure argument and Figure 1's token meter. That split is the whole
  // point of the pane, so it is asserted rather than left to whoever next moves a section.
  const split = await page.evaluate(() => {
    const tabOf = (id) => {
      const n = document.getElementById(id);
      const owner = n && n.closest('[data-tab]');
      return owner ? owner.getAttribute('data-tab') : null;
    };
    return {
      board: tabOf('trackExplorer'),
      leverIndex: tabOf('lever-progress'),
      dashboardT1: tabOf('assessment-t1'),
      dashboardT2: tabOf('assessment-t2'),
      prose: tabOf('cost-structure-overview'),
      figure1: tabOf('overview'),
      citations: tabOf('references'),
      proseHasNoBoard: !document.querySelector('#cost-structure-overview #trackExplorer')
    };
  });
  check(label, 'landing owns the optional shared guide while each track owns its dashboard',
    split.board === 'overview' && split.leverIndex === 'overview'
      && split.dashboardT1 === 't1' && split.dashboardT2 === 't2'
      && split.prose === 'overview' && split.figure1 === 'overview' && split.proseHasNoBoard,
    `board=${split.board}, Track 1 dashboard=${split.dashboardT1}, Track 2 dashboard=${split.dashboardT2}`);
  check(label, 'the single references section is shared by all three routes',
    split.citations === 'overview t1 t2', `citations=${split.citations}`);

  const scopedReferences = await page.evaluate(async () => {
    const count = () => [...document.querySelectorAll('#references li[id^="ref-"]')].filter((item) => !item.hidden).length;
    const seen = {};
    document.querySelector('.tabs .tab-t1').click();
    await new Promise((resolve) => setTimeout(resolve, 80));
    seen.t1 = count();
    seen.t1Visible = document.getElementById('references').checkVisibility();
    seen.t1Note = document.querySelector('[data-reference-note]').textContent;
    document.querySelector('.tabs .tab-t2').click();
    await new Promise((resolve) => setTimeout(resolve, 80));
    seen.t2 = count();
    seen.t2Visible = document.getElementById('references').checkVisibility();
    seen.t2Note = document.querySelector('[data-reference-note]').textContent;
    document.querySelector('.tabs .tab-overview').click();
    await new Promise((resolve) => setTimeout(resolve, 80));
    seen.overview = count();
    return seen;
  });
  check(label, 'references are scoped to exactly 58 for Track 1 and 59 for Track 2',
    scopedReferences.t1 === EXPECT.tracks.t1.references && scopedReferences.t2 === EXPECT.tracks.t2.references
      && scopedReferences.t1Visible && scopedReferences.t2Visible,
    `Track 1=${scopedReferences.t1}, Track 2=${scopedReferences.t2}`);
  check(label, 'landing retains all 136 canonical references', scopedReferences.overview === 136,
    `${scopedReferences.overview} visible reference entries`);
  check(label, 'reference copy names the active track and count',
    /58 references.*Track 1/.test(scopedReferences.t1Note) && /63 references.*Track 2/.test(scopedReferences.t2Note),
    `${scopedReferences.t1Note} | ${scopedReferences.t2Note}`);

  // Print takes the WHOLE runbook, not the pane you happen to be on. 66-tabs.css scopes the hiding rules to
  // `@media screen` so there is nothing to undo here -- a 12-page PDF that silently dropped 30 pages would
  // be a lie, and on paper there is no tab bar to switch with. Same precedent as the cost map's filter.
  await page.emulateMediaType('print');
  const printedPanes = await page.evaluate(() => {
    const vis = (n) => !!n && (n.checkVisibility ? n.checkVisibility() : n.offsetParent !== null);
    return {
      allPanes: [...document.querySelectorAll('main.content > [data-tab]')].every(vis),
      barHidden: !vis(document.querySelector('.tabs'))
    };
  });
  await page.emulateMediaType('screen');
  check(label, 'print ignores panes and takes the whole runbook',
    printedPanes.allPanes && printedPanes.barHidden,
    `all panes printed=${printedPanes.allPanes}, tab bar hidden=${printedPanes.barHidden}`);

  // A CROSS-PANE ANCHOR MUST STILL LAND. Thirteen levers are treated on both tracks and link to each other,
  // the lever index links into both, and URLs into specific levers have already been shared. An anchor into a
  // hidden pane scrolls nowhere, which is the one way panes could break something that used to work.
  const crossPane = await page.evaluate(async () => {
    const vis = (n) => !!n && (n.checkVisibility ? n.checkVisibility() : n.offsetParent !== null);
    const link = document.querySelector('#leverSheet a[href="#bound-the-reasoning-loop"]');
    if (!link) return { found: false };
    link.click();
    await new Promise((r) => setTimeout(r, 200));
    return {
      found: true,
      scope: document.documentElement.getAttribute('data-scope'),
      targetVisible: vis(document.getElementById('bound-the-reasoning-loop'))
    };
  });
  check(label, 'a link into another pane switches pane and lands on its target',
    crossPane.found && crossPane.scope === 't2' && crossPane.targetVisible,
    `scope=${crossPane.scope}, target visible=${crossPane.targetVisible}`);

  const directTrack2Url = url + '#track-2';
  await page.goto(directTrack2Url, { waitUntil: 'load', timeout: 30000 });
  await waitForFragment(page, 'track-2', 't2', false);
  const directTrack2 = await page.evaluate(() => ({
    scope: document.documentElement.getAttribute('data-scope'),
    hash: location.hash,
    focused: document.activeElement && document.activeElement.id,
    track1Visible: document.getElementById('track-1').checkVisibility(),
    track2Visible: document.getElementById('track-2').checkVisibility()
  }));
  await page.evaluate(() => document.querySelector('.tabs .tab-t1').click());
  await waitForFragment(page, 'track-1', 't1', false);
  await page.evaluate(() => history.back());
  await waitForFragment(page, 'track-2', 't2', false);
  const afterBack = await page.evaluate(() => ({ scope: document.documentElement.getAttribute('data-scope'), hash: location.hash }));
  await page.evaluate(() => history.forward());
  await waitForFragment(page, 'track-1', 't1', false);
  const afterForward = await page.evaluate(() => ({ scope: document.documentElement.getAttribute('data-scope'), hash: location.hash }));

  await page.evaluate(() => { location.hash = '#bound-the-reasoning-loop'; });
  await waitForFragment(page, 'bound-the-reasoning-loop', 't2');
  await page.reload({ waitUntil: 'load', timeout: 30000 });
  await waitForFragment(page, 'bound-the-reasoning-loop', 't2');
  const refreshedDeepLink = await page.evaluate(() => ({
    scope: document.documentElement.getAttribute('data-scope'),
    hash: location.hash,
    focused: document.activeElement && document.activeElement.id,
    targetVisible: document.getElementById('bound-the-reasoning-loop').checkVisibility()
  }));
  await setPane(page, 't1');
  const hiddenTrackLeak = await page.evaluate(() => [...document.querySelectorAll('#track-2 a, #track-2 button, #track-2 input, #track-2 textarea, #track-2 select, #track-2 [tabindex]')]
    .filter((node) => node.checkVisibility()).length);

  check(label, 'direct Track 2 route shows only Track 2 and restores focus',
    directTrack2.scope === 't2' && directTrack2.hash === '#track-2' && directTrack2.focused === 'track-2'
      && !directTrack2.track1Visible && directTrack2.track2Visible,
    JSON.stringify(directTrack2));
  check(label, 'browser back and forward restore assessment routes',
    afterBack.scope === 't2' && afterBack.hash === '#track-2'
      && afterForward.scope === 't1' && afterForward.hash === '#track-1',
    `back=${afterBack.scope}${afterBack.hash}, forward=${afterForward.scope}${afterForward.hash}`);
  check(label, 'deep-link refresh restores Track 2, target visibility and focus',
    refreshedDeepLink.scope === 't2' && refreshedDeepLink.hash === '#bound-the-reasoning-loop'
      && refreshedDeepLink.targetVisible && refreshedDeepLink.focused === 'bound-the-reasoning-loop',
    JSON.stringify(refreshedDeepLink));
  check(label, 'the hidden track contributes no visible focus targets', hiddenTrackLeak === 0,
    `${hiddenTrackLeak} visible controls or links from Track 2 while Track 1 is active`);

  // The audit's real failure surface: every managed fragment must use the same route/settle/scroll/focus
  // pipeline, and the chooser must announce itself as a visible semantic heading through history as well.
  await runChooserFocusRegressions(page, label, url);
  await runFragmentNavigationRegressions(page, label, url);
  await runOpaqueStepperRegressions(page, label, url);

  // AN ANCHOR MUST NOT LAND ITS TARGET UNDER THE STICKY BARS.
  // `scroll-margin-top` was a hard-coded 120px, tuned when the sticky stack was the top bar plus the
  // breadcrumb. The tab bar made the stack about 44px taller and every jumped-to heading landed hidden behind
  // it — visible in a screenshot, invisible to every other check. It is derived from the measured `--sticky-2`
  // now, and this asserts the result rather than the arithmetic.
  // A TAB'S SIDEBAR MAY NEVER LINK OUT OF THAT TAB.
  // Walked across all five panes, and measured on VISIBILITY rather than on the group's declared scope: the
  // rule the reader experiences is "nothing I can click here moves me somewhere else", and the previous
  // pairwise CSS satisfied the declared-scope form while still showing the Assessment group in four panes it
  // did not belong to. This is the check that would have caught that, and it is the one the CSS is now written
  // against.
  const confinement = await page.evaluate(async (panes) => {
    const vis = (n) => !!n && (n.checkVisibility ? n.checkVisibility() : n.offsetParent !== null);
    const escapes = [];
    const seen = {};
    const titles = {};
    for (const key of panes) {
      document.querySelector('.tabs .tab-' + key).click();
      await new Promise((r) => setTimeout(r, 150));
      let visible = 0;
      // The RAIL counts too. It is titled "On this page", and its footer used to offer the dashboard and the
      // lever board -- two links that, once those moved to the Assessment pane, were not on this page.
      for (const a of document.querySelectorAll('.sidebar a[href^="#"], .rail a[href^="#"]')) {
        if (!vis(a)) continue;
        visible++;
        const target = document.getElementById(a.getAttribute('href').slice(1));
        const owner = target && target.closest('[data-tab]');
        const panes = owner ? (owner.getAttribute('data-tab') || '').trim().split(/\s+/).filter(Boolean) : [];
        if (panes.length && !panes.includes(key)) escapes.push(`${key}: ${a.getAttribute('href')} -> ${panes.join(' ')}`);
      }
      seen[key] = visible;
      titles[key] = [...document.querySelectorAll('.sidebar .nav-group-title')].filter(vis).map((n) => n.textContent.trim());
    }
    return { escapes, seen, titles };
  }, EXPECT.panes);
  check(label, 'no sidebar link in any pane jumps to a different pane',
    confinement.escapes.length === 0,
    confinement.escapes.length ? confinement.escapes.join(' | ')
      : EXPECT.panes.map((k) => `${k}:${confinement.seen[k]}`).join(' '));
  // ...and every pane still offers its own navigation, so the rule above cannot be met by an empty sidebar.
  check(label, 'every pane still has its own sidebar links',
    EXPECT.panes.every((k) => confinement.seen[k] > 0),
    EXPECT.panes.map((k) => `${k}:${confinement.seen[k]}`).join(' '));
  // The tab bar names the pane. A sidebar group title repeats it, and two of them had drifted from it: the
  // TLDR pane's said "Overview", and the track panes showed none, so the treatment was inconsistent too.
  check(label, 'no pane repeats its own name as a sidebar group title',
    EXPECT.panes.every((k) => confinement.titles[k].length === 0),
    EXPECT.panes.map((k) => `${k}:[${confinement.titles[k].join(',')}]`).join(' '));

  // Jump WITHIN the active pane, so this measures the scroll offset and nothing else. And assert the scroll
  // actually happened: a first draft of this check jumped across panes, the smooth scroll had not settled, and
  // the heading measured 10,270px down the viewport — which satisfied "below the breadcrumb" for entirely the
  // wrong reason. A check that cannot fail is worse than no check.
  await setPane(page, 't1');
  const landing = await page.evaluate(async () => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    const target = document.getElementById('developer-education');
    // This check follows a mobile viewport scenario. Reassert the synthetic jump while desktop layout
    // settles so the assertion measures scroll-margin behavior rather than an in-flight responsive reflow.
    for (let i = 0; i < 20; i++) {
      target.scrollIntoView({ behavior: 'instant', block: 'start' });
      await new Promise((r) => setTimeout(r, 50));
      if (target.getBoundingClientRect().top < window.innerHeight / 2) break;
    }
    const h = target.getBoundingClientRect();
    const crumb = document.querySelector('.breadcrumb').getBoundingClientRect();
    return { headingTop: Math.round(h.top), crumbBottom: Math.round(crumb.bottom), viewport: window.innerHeight };
  });
  check(label, 'a jumped-to heading lands below the sticky bars, not under them',
    landing.headingTop >= landing.crumbBottom && landing.headingTop < landing.viewport / 2,
    `heading top ${landing.headingTop}, breadcrumb bottom ${landing.crumbBottom} (scrolled: ${landing.headingTop < landing.viewport / 2})`);

  // --- the TLDR pane: the two instruments that answer the feedback ---------
  await setPane(page, 'overview');
  const tldr = await page.evaluate(() => {
    const vis = (n) => !!n && (n.checkVisibility ? n.checkVisibility() : n.offsetParent !== null);
    const words = (sel) => [...document.querySelectorAll(sel)]
      .reduce((n, el) => n + el.textContent.trim().split(/\s+/).filter(Boolean).length, 0);
    return {
      sheetBuilt: vis(document.getElementById('leverSheet')),
      heatBuilt: vis(document.getElementById('leverHeat')),
      fallbackHidden: !vis(document.querySelector('#key-levers .sheet-fallback')),
      rows: document.querySelectorAll('#leverSheet .ls-lever').length,
      savesShown: document.querySelectorAll('#leverSheet .ls-saves').length,
      refRows: document.querySelectorAll('#leverSheet .ls-saves.is-ref').length,
      // `no headline` is the UNDECLARED absence. A declared cross-reference lever reads `reference`; anything
      // else missing a headline is an authoring slip, and it must fail here rather than reach a reader.
      undeclared: [...document.querySelectorAll('#leverSheet .ls-saves.is-none')].length,
      headsInDoc: document.querySelectorAll('.saves-head').length,
      layers: document.querySelectorAll('#leverSheet .ls-layer').length,
      principles: document.querySelectorAll('#leverSheet .ls-principles .ls-lever').length,
      placed: document.querySelectorAll('#leverHeat .hm-chip').length,
      // The "Prerequisites" band was removed as confusing. Its six levers must not have silently become
      // "low impact" on the way out -- they carry no rating, so they belong nowhere on this grid at all.
      // They still state their saving in the sheet, which the row count below covers.
      bandGone: document.querySelectorAll('#leverHeat .hm-band').length === 0,
      lowImpactCells: document.querySelectorAll('#leverHeat .hm-cell[data-impact="low"] .hm-chip').length,
      // Coverage is stated, never implied: a view showing 10 of 30 without saying so reads as the whole set.
      statesCoverage: /\d+ of \d+ levers placed/.test((document.querySelector('.hm-foot') || {}).textContent || ''),
      // The regression guard for the actual feedback: prose before the levers, excluding the instruments.
      prose: words('.hero .lede') + words('#key-levers > p:not(.sheet-fallback)') + words('#which-track-am-i-in .note')
    };
  });
  check(label, 'the TLDR pane builds both instruments and retires its fallback',
    tldr.sheetBuilt && tldr.heatBuilt && tldr.fallbackHidden,
    `sheet=${tldr.sheetBuilt}, heatmap=${tldr.heatBuilt}, fallback hidden=${tldr.fallbackHidden}`);
  check(label, 'the sheet lists every lever, grouped by track and layer',
    tldr.rows === EXPECT.levers + tldr.principles && tldr.layers === 6,
    `${tldr.rows} rows (${EXPECT.levers} levers + ${tldr.principles} principles), ${tldr.layers} layers`);
  check(label, 'every lever states a saving, or declares why it has none',
    tldr.headsInDoc === EXPECT.savesHeads && tldr.refRows === 0 && tldr.undeclared === 0,
    `${tldr.headsInDoc} headlines, ${tldr.refRows} declared reference, ${tldr.undeclared} undeclared`);
  check(label, 'the decision principles are named, not only linked', tldr.principles === 3, `${tldr.principles} principles`);
  // The six enabler levers are absent from the grid because they are unrated -- NOT filed as low impact,
  // which would tell a reader to skip the levers that make every other saving measurable.
  check(label, 'no prerequisites band, and no enabler misfiled as low impact',
    tldr.bandGone && tldr.lowImpactCells === 0,
    `band removed=${tldr.bandGone}, ${tldr.lowImpactCells} chips in a low-impact cell`);
  check(label, 'the heatmap states how much of the 30 it has placed', tldr.statesCoverage && tldr.placed > 0,
    `${tldr.placed} placed, coverage stated=${tldr.statesCoverage}`);
  // 1,691 words and four to six screens is what the feedback was about. This is the guard on it.
  check(label, 'the TLDR pane leads with levers, not an essay', tldr.prose <= 300,
    `${tldr.prose} words of prose before the levers (was 1,691)`);

  // --- "Suggest a change" -------------------------------------------------
  //
  // Replaces the old identity greeting and feedback service. One link per h4 section and one in the
  // footer, each an ordinary <a href> to the repository's GitHub issue form, prefilled with the
  // section title and anchor. Asserted rather than eyeballed, because the ways it breaks are quiet:
  // a link inside a heading changes every lever name the nav and report read, a missing anchor
  // makes the issue unfindable, a missing rel leaks the opener, and an inline style is blocked by CSP.
  const suggest = await page.evaluate((formPrefix) => {
    const headings = [...document.querySelectorAll('main.content h4[id]')];
    const bars = [...document.querySelectorAll('main.content .suggest-change')];
    const links = bars.map((b) => b.querySelector('a.suggest-link')).filter(Boolean);
    const wellFormed = headings.filter((h) => {
      const bar = h.nextElementSibling;
      const a = bar && bar.classList.contains('suggest-change') ? bar.querySelector('a.suggest-link') : null;
      if (!a) return false;
      let u;
      try { u = new URL(a.href); } catch (e) { return false; }
      const section = u.searchParams.get('section') || '';
      const title = u.searchParams.get('title') || '';
      return a.href.startsWith(formPrefix)
        && section.endsWith('(#' + h.id + ')')
        && title.startsWith('Content correction: ')
        && a.target === '_blank'
        && /\bnoopener\b/.test(a.rel)
        && /Suggest a change to: /.test(a.getAttribute('aria-label') || '');
    }).length;
    const footer = document.querySelector('main.content footer.page .suggest-footer a.suggest-link');
    return {
      headings: headings.length,
      bars: bars.length,
      links: links.length,
      wellFormed,
      insideHeadings: document.querySelectorAll('h1 .suggest-link, h2 .suggest-link, h3 .suggest-link, h4 .suggest-link').length,
      inlineStyles: document.querySelectorAll('.suggest-change[style], .suggest-link[style], .suggest-footer[style]').length,
      footer: !!footer && footer.href.startsWith(formPrefix) && footer.target === '_blank',
      // The old chrome must be gone for good: no greeting, no feedback controls.
      legacy: document.querySelectorAll('#whoami, .fb-lever, .fb-open, .fb-footer, .fb-dialog, .fb-panel').length
    };
  }, ISSUE_FORM);
  check(label, 'a Suggest a change link under every h4 section', suggest.headings > 0 && suggest.bars === suggest.headings && suggest.links === suggest.headings,
    `${suggest.links} link(s) for ${suggest.headings} h4[id] heading(s)`);
  check(label, 'each link opens the prefilled content-correction issue form for its own section',
    suggest.wellFormed === suggest.headings, `${suggest.wellFormed}/${suggest.headings} well-formed (form, title, #anchor, _blank, noopener, aria-label)`);
  check(label, 'no Suggest a change link inside a heading', suggest.insideHeadings === 0, `${suggest.insideHeadings} found`);
  check(label, 'Suggest a change carries no inline style', suggest.inlineStyles === 0, `${suggest.inlineStyles} found`);
  check(label, 'the footer carries a general Suggest a change link', suggest.footer === true, String(suggest.footer));
  check(label, 'no identity greeting or feedback controls remain', suggest.legacy === 0, `${suggest.legacy} element(s) (want 0)`);
  // The model still reads clean names: the injected links changed nothing that derives from the document.
  // Scroll to a lever first so the scroll-spy has re-rendered the rail, breadcrumb and stepper from it.
  await page.evaluate(() => { const h = document.querySelector('#track-2 h4[id]'); if (h) h.scrollIntoView({ block: 'start', behavior: 'instant' }); });
  await new Promise((r) => setTimeout(r, 250));
  const leaked = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const places = [];
    let n;
    while ((n = walker.nextNode())) {
      if (!/Suggest a change/.test(n.nodeValue || '')) continue;
      const p = n.parentElement;
      // The only legitimate homes: the injected link bars, the footer line, and the hero note that names them.
      if (!p || p.closest('script, style')) continue; // source text, not rendered text
      if (p && p.closest('.suggest-change, .suggest-footer, .beta-note')) continue;
      places.push((p && (p.id || p.className || p.tagName)) || '?');
    }
    return places;
  });
  check(label, 'lever names and derived views are unpolluted by the injected links', leaked.length === 0,
    leaked.length ? leaked.slice(0, 5).join(', ') : 'no link text in the rail, sidebar, cost map, lever sheet or dashboards');
  await page.emulateMediaType('print');
  const suggestPrinted = await page.evaluate(() => [...document.querySelectorAll('.suggest-change, .suggest-footer')]
    .filter((n) => getComputedStyle(n).display !== 'none').length);
  await page.emulateMediaType('screen');
  check(label, 'Suggest a change links do not print', suggestPrinted === 0, `${suggestPrinted} visible in print`);

  // The page makes no network request of its own. `no CSP violations` below would catch a call that
  // CSP blocks; counting off-origin requests also catches one to a host that happens to be allowed.
  check(label, 'no off-origin requests were attempted', offOriginRequests.length === 0,
    offOriginRequests.slice(0, 3).join(' | ') || 'none');

  // --- errors -------------------------------------------------------------
  check(label, 'no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | ') || 'none');
  check(label, 'no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | ') || 'none');
  check(label, 'no CSP violations', cspViolations.length === 0, cspViolations.slice(0, 3).join(' | ') || 'none');

  if (expectSplitBuild) {
    check(label, 'served page uses the split same-origin assets', counts.linkTags === 1 && counts.styleTags === 0,
      `${counts.linkTags} stylesheet link(s), ${counts.styleTags} inline style block(s)`);
    check(label, 'served page carries the site CSP <meta>', counts.cspMeta === SITE_CSP,
      counts.cspMeta ? 'matches build-site.mjs SITE_CSP' : 'missing');
    const problems = cspProblems(counts.cspMeta || '');
    check(label, 'the site CSP is strict (self-only scripts, styles and connections; nothing unsafe)', problems.length === 0,
      problems.join('; ') || 'strict');
  } else {
    check(label, 'the self-contained file carries no CSP <meta> (it would block its own inline blocks)', counts.cspMeta === null,
      counts.cspMeta ? 'present' : 'absent');
  }

  // --- artefacts for eyeballing -------------------------------------------
  mkdirSync(ARTEFACT_DIR, { recursive: true });
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const captureRoute = async (key, viewport, suffix, target) => {
    await page.setViewport(viewport);
    await setPane(page, key);
    await page.evaluate((id) => {
      window.scrollTo({ top: 0, behavior: 'instant' });
      if (id) document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'instant' });
    }, target || null);
    await new Promise((resolve) => setTimeout(resolve, 120));
    await page.screenshot({ path: join(ARTEFACT_DIR, `${slug}-${key}-${suffix}.png`), fullPage: false });
  };

  for (const mode of ['light', 'dark']) {
    await page.evaluate((m) => document.documentElement.setAttribute('data-theme', m), mode);
    await captureRoute('overview', { width: 1440, height: 1000 }, `desktop-${mode}`);
  }
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await captureRoute('overview', { width: 1440, height: 1000 }, 'desktop-chooser', 'which-track-am-i-in');
  await captureRoute('overview', { width: 390, height: 844 }, 'mobile-light');
  await captureRoute('overview', { width: 390, height: 844 }, 'mobile-chooser', 'which-track-am-i-in');
  for (const [key, dashboard] of [['t1', 'assessment-t1'], ['t2', 'assessment-t2']]) {
    await captureRoute(key, { width: 1440, height: 1000 }, 'desktop-top');
    await captureRoute(key, { width: 1440, height: 1000 }, 'desktop-assessment', dashboard);
    await captureRoute(key, { width: 390, height: 844 }, 'mobile-top');
    await captureRoute(key, { width: 390, height: 844 }, 'mobile-assessment', dashboard);

    await page.setViewport({ width: 1440, height: 1000 });
    await setPane(page, key);
    await page.evaluate((trackKey) => {
      const dash = document.querySelector(`[data-track-dashboard="${trackKey}"]`);
      const realPrint = window.print;
      window.print = () => {};
      dash.querySelector('[data-ad-pdf]').click();
      window.print = realPrint;
    }, key);
    await page.emulateMediaType('print');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: join(ARTEFACT_DIR, `${slug}-${key}-assessment-print-preview.png`), fullPage: false });
    await page.pdf({ path: join(ARTEFACT_DIR, `${slug}-${key}-assessment-print.pdf`), format: 'A4', printBackground: true });
    await page.emulateMediaType('screen');
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  }
  await page.setViewport({ width: 1400, height: 1000 });
  console.log(`  ${dim(`artefacts -> .verify-out/${slug}-{overview,t1,t2}-*.{png,pdf}`)}`);

  await page.close();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const chrome = findChrome();
if (!chrome) {
  bail('no Chrome found.', 'Install Google Chrome, or set PUPPETEER_EXECUTABLE_PATH to a Chrome/Chromium binary.');
}
if (!existsSync(UPSTREAM)) bail(`missing ${UPSTREAM}`);
if (!existsSync(join(APP_DIR, 'index.html'))) {
  bail('dist/index.html is missing.', 'Run `npm run build` first — the served assets are generated.');
}

console.log(`\n${bold('verify-runbook-dom')} — behaviour in a real browser`);
console.log(`  chrome  ${dim(chrome)}`);

const { server, port } = await serve(APP_DIR);
let browser;
try {
  browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    args: ['--no-sandbox', '--allow-file-access-from-files', '--font-render-hinting=none']
  });

  await runScenario(browser, 'Self-contained file (file://)', pathToFileURL(UPSTREAM).href, { expectSplitBuild: false });
  await runScenario(browser, 'Built Pages site (sub-path, site CSP)', `http://127.0.0.1:${port}${BASE_PATH}`, { expectSplitBuild: true });

} catch (e) {
  console.error(`\n${red('✖')} verify-runbook-dom: ${e.message}`);
  process.exitCode = 2;
} finally {
  if (browser) await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log('');
if (failed.length) {
  console.error(red(bold(`✖ ${failed.length} of ${results.length} checks failed`)));
  for (const f of failed) console.error(`  • [${f.scenario}] ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
  console.error('');
  process.exit(1);
}
console.log(green(bold(`✓ all ${results.length} checks passed`)) + ' across both the self-contained file and the built Pages site.\n');
