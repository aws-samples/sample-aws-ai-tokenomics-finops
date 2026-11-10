#!/usr/bin/env node
/**
 * verify-deck: the public-safety and integrity gate for the presenter deck.
 *
 *   deck/tokenomics-for-ai-workloads.bento.html   (source, edited with Bento)
 *   dist/deck/index.html                           (published copy, from `npm run build`)
 *
 * Three parts, all must pass:
 *
 *   1. Document. Decodes the #bento-doc JSON and fails on: internal-only markers (internal only/use,
 *      analyst-relations gating, NDA/confidential wording), Amazon-internal hosts and aliases, a bare
 *      12-digit run (possible account ID), live-session keys (doc.collab secrets), any remote resource
 *      (every image/svg/media source must be an embedded data: URI or asset: key), any svg markup that
 *      references another origin, element links that do not resolve to a slide, and slide-count drift.
 *   2. Shell. Exactly one executable inline script (the Bento loader), no <script src>, no external
 *      stylesheet, frame, object, embed or <base>; the Bento licence NOTICE is still present; the
 *      published copy equals the source plus exactly the CSP <meta> from build-site.mjs.
 *   3. Browser. Opens the published copy under its own <meta> CSP at the Pages sub-path, steps through
 *      every slide in present mode, and fails on any off-origin request, any page error, any CSP
 *      refusal other than the three designed ones (the loader's inline and eval fallbacks, and the
 *      runtime's update check to bento.page), and any error or non-font-metric warning from
 *      window.bento.validate(). Text/table overflow depends on the host's system-ui fonts, so it is
 *      reported, not failed.
 *      Screenshots of the title, a pricing slide and the call-to-action land in .verify-out/deck/.
 *
 * Pinned counts are exact. When the deck changes on purpose, update them here in the same PR.
 */

import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { findChrome } from './lib/find-chrome.mjs';
import {
  DECK_SOURCE, DECK_OUT, DECK_DOC_RE, DECK_PLAYER_STYLE, deckCsp, deckLoaderHash, deckExecutableScripts, publishedDeckDoc
} from './build-site.mjs';
import { contrastFindings, parseColor, ratio } from './lib/contrast.mjs';
import { OUT_OF_SCOPE, NEEDLE_RE, ALIAS_RE } from './lib/public-safety.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(REPO_ROOT, '.verify-out', 'deck');

// ---- pinned facts (exact) ------------------------------------------------------------------------
const EXPECT = {
  slides: 26,           // every slide in the document, including drill-down state slides
  stateSlides: 1,       // s-t1-worth-sens (reached by a button on the worth slide)
  hiddenSlides: 0,      // public deck: removed, not hidden
  mainSequence: 25,     // slides a presenter steps through (slides minus state slides)
  uberSlides: 1,        // Uber is one public reference example, never a customer story
  screenshots: { 's-cover': 'title', 's-hook': 'headlines', 's-uber': 'uber-reference', 's-model': 'two-tracks',
    's-t2-worth': 'pricing', 's-next': 'cta' }
};

// Public credit is the team. doc.meta.author is exactly this, and every "Deck by" credit names it.
const AUTHOR = 'AWS AI/ML specialist team, cost pillar';

// A public example must never read as an outcome of, or input to, this runbook. Every slide that names
// Uber carries this exact line as one of its text elements, and nothing on it calls Uber a customer.
const UBER_INDEPENDENCE = "Uber's own published results; independent of this runbook.";
const UBER_FORBIDDEN = /customer|case study|engagement|we helped/gi;

// OUT_OF_SCOPE, NEEDLE_RE and ALIAS_RE live in lib/public-safety.mjs, shared with verify-skill.mjs.

// The designed CSP refusals. Anything else fails.
const ALLOWED_REFUSALS = [
  { why: "loader's inline-script fallback", match: (v) => v.directive === 'script-src-elem' && v.blockedURI === 'inline' },
  { why: "loader's eval fallback", match: (v) => v.directive === 'script-src' && v.blockedURI === 'eval' },
  { why: 'Bento update check (refused in the browser)', match: (v) => v.directive === 'connect-src' && v.blockedURI.startsWith('https://bento.page/') }
];

// ---- reporting -----------------------------------------------------------------------------------
const results = [];
const check = (part, name, ok, detail = '') => {
  results.push({ part, name, ok, detail });
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✖\x1b[0m'} ${name}${detail ? `\x1b[2m — ${detail}\x1b[0m` : ''}`);
};
const bail = (msg) => { console.error(`\n\x1b[31m✖\x1b[0m verify-deck: ${msg}\n`); process.exit(2); };

// ---- 1. document ---------------------------------------------------------------------------------
if (!existsSync(DECK_SOURCE)) bail(`missing ${DECK_SOURCE}`);
const src = readFileSync(DECK_SOURCE, 'utf8');
console.log('\n\x1b[1mverify-deck\x1b[0m — presenter deck public-safety gate');
console.log('\n\x1b[1m  Document\x1b[0m');

const docBlocks = [...src.matchAll(/<script type="application\/bento\+json" id="bento-doc">([\s\S]*?)<\/script>/g)];
check('doc', 'exactly one #bento-doc block', docBlocks.length === 1, `${docBlocks.length}`);
let doc;
try { doc = JSON.parse(docBlocks[0][1]); } catch (e) { bail(`#bento-doc is not JSON: ${e.message}`); }
check('doc', 'format is bento/slides', doc.format === 'bento/slides', doc.format);

const slides = doc.slides || [];
const stateSlides = slides.filter((s) => s.stateOf).length;
const hiddenSlides = slides.filter((s) => s.hidden).length;
check('doc', `slide count is ${EXPECT.slides}`, slides.length === EXPECT.slides, `${slides.length}`);
check('doc', `state slides: ${EXPECT.stateSlides}`, stateSlides === EXPECT.stateSlides, `${stateSlides}`);
check('doc', 'no hidden slides (remove, do not hide)', hiddenSlides === EXPECT.hiddenSlides, `${hiddenSlides}`);

// Everything a reader or presenter can see: text, notes, comments, names, alt text, meta, svg markup.
const { assets = {}, ...rest } = doc;
const svgAssets = Object.entries(assets).filter(([, v]) => !String(v).startsWith('data:'));
const readable = JSON.stringify(rest) + JSON.stringify(Object.fromEntries(svgAssets));
const hits = [...new Set((readable.match(NEEDLE_RE) || []).map((h) => h.toLowerCase()))];
check('doc', 'no internal marker, host or account-like number', hits.length === 0, hits.join(', ') || 'none');
check('doc', `doc.meta.author is "${AUTHOR}"`, doc.meta?.author === AUTHOR, String(doc.meta?.author));
const credits = readable.match(/Deck by [^."<\\]*/g) || [];
const badCredits = credits.filter((c) => c !== `Deck by the ${AUTHOR}`);
check('doc', 'every "Deck by" credit names the team', credits.length > 0 && badCredits.length === 0,
  badCredits.join('; ') || `${credits.length} credits`);
const uber = slides.filter((s) => /uber/i.test(JSON.stringify(s)));
check('doc', `Uber appears on exactly ${EXPECT.uberSlides} slide`, uber.length === EXPECT.uberSlides,
  uber.map((s) => s.id).join(', ') || 'none');
const noLine = uber.filter((s) => !(s.elements || []).some((e) => e.html === UBER_INDEPENDENCE)).map((s) => s.id);
check('doc', 'every Uber slide carries the independence line', noLine.length === 0, noLine.join(', ') || 'all');
const storyWords = uber.flatMap((s) => (JSON.stringify(s).match(UBER_FORBIDDEN) || []).map((w) => `${s.id}: ${w}`));
check('doc', 'no customer/case-study/engagement wording on an Uber slide', storyWords.length === 0, storyWords.join('; ') || 'none');
const story = readable.match(/customer stor(?:y|ies)|case stud(?:y|ies)/gi) || [];
check('doc', 'no customer story or case study anywhere in the deck', story.length === 0, story.join(', ') || 'none');
const scope = [...new Set(readable.match(OUT_OF_SCOPE) || [])];
check('doc', 'no out-of-scope (non-Bedrock) client named', scope.length === 0, scope.join(', ') || 'none');
const aliases = [...new Set(readable.match(ALIAS_RE) || [])];
check('doc', 'no alias@ handles', aliases.length === 0, aliases.join(', ') || 'none');

const collab = doc.collab || {};
const secrets = ['ownerPriv', 'writerPriv', 'invite'].filter((k) => collab[k]);
check('doc', 'no live-session keys (doc.collab)', secrets.length === 0, secrets.join(', ') || 'none');

const ids = new Set(slides.map((s) => s.id));
const remote = [];
const badLinks = [];
const ASSET_TYPES = /^data:image\/(png|jpeg|gif|webp|svg\+xml)[;,]/;
for (const [k, v] of Object.entries(assets)) {
  if (String(v).startsWith('data:') && !ASSET_TYPES.test(v)) remote.push(`asset ${k}: ${String(v).slice(0, 30)}`);
  if (!String(v).startsWith('data:') && !/^\s*<svg[\s>]/i.test(v)) remote.push(`asset ${k}: not a data: URI or svg markup`);
}
// An svg (inline or in assets) may name the SVG/XLink namespaces; any other http(s) URL is a fetch risk.
const OFF_ORIGIN_IN_MARKUP = /(?:href|src)\s*=\s*["']?\s*(?:https?:)?\/\/|url\(\s*["']?\s*(?:https?:)?\/\/|@import/gi;
const markupRemote = (m) => (String(m).match(OFF_ORIGIN_IN_MARKUP) || []);
for (const [k, v] of svgAssets) if (markupRemote(v).length) remote.push(`svg asset ${k}`);
for (const s of slides) {
  if (s.stateOf && !ids.has(s.stateOf)) badLinks.push(`${s.id} stateOf ${s.stateOf}`);
  for (const e of s.elements || []) {
    for (const key of ['src', 'poster']) {
      const v = e[key];
      if (typeof v === 'string' && v && !v.startsWith('data:') && !v.startsWith('asset:')) remote.push(`${s.id}/${e.id} ${key}=${v.slice(0, 60)}`);
      if (typeof v === 'string' && v.startsWith('asset:') && !(v.slice(6) in assets)) remote.push(`${s.id}/${e.id} missing ${v}`);
    }
    if (e.asset && !(e.asset in assets)) remote.push(`${s.id}/${e.id} missing asset ${e.asset}`);
    if (e.markup && markupRemote(e.markup).length) remote.push(`${s.id}/${e.id} svg markup`);
    if (e.css && markupRemote(e.css).length) remote.push(`${s.id}/${e.id} svg css`);
    if (e.type === 'media' || e.type === 'embed') remote.push(`${s.id}/${e.id} ${e.type} element`);
    if (e.link !== undefined && !ids.has(e.link)) badLinks.push(`${s.id}/${e.id} -> ${e.link}`);
  }
}
check('doc', 'every image, svg and media source is embedded (no remote load)', remote.length === 0, remote.join('; ') || 'none');
check('doc', 'every element link resolves to a slide', badLinks.length === 0, badLinks.join('; ') || 'none');
check('doc', 'every slide has speaker notes', slides.every((s) => (s.notes || '').trim().length > 0),
  slides.filter((s) => !(s.notes || '').trim()).map((s) => s.id).join(', ') || 'all');
const { findings: lowContrast, checked } = contrastFindings(doc);
check('doc', 'WCAG contrast: 4.5:1 body text, 3:1 large text, against its own fill or the slide',
  lowContrast.length === 0, lowContrast.join('; ') || `${checked} text elements`);

// ---- 2. shell ------------------------------------------------------------------------------------
console.log('\n\x1b[1m  Shell\x1b[0m');
const exec = deckExecutableScripts(src);
check('shell', 'one executable inline script (the Bento loader), no <script src>', exec.length === 1 && !exec[0].src, `${exec.length}`);
const outsideBlocks = src.replace(/<script[^>]*type="(?:application\/bento\+json|bento\/deflate-b86)"[^>]*>[\s\S]*?<\/script>/g, '');
const extTags = outsideBlocks.match(/<(?:link[^>]+rel\s*=\s*"?stylesheet|iframe|object|embed|base|frame)\b[^>]*>|<meta[^>]+http-equiv/gi) || [];
check('shell', 'no external stylesheet, frame, object, embed, <base> or meta refresh/CSP in the source', extTags.length === 0, extTags.join(' ') || 'none');
const shellHits = [...new Set((outsideBlocks.match(NEEDLE_RE) || []).map((h) => h.toLowerCase()))];
check('shell', 'no internal marker outside the document and runtime blocks', shellHits.length === 0, shellHits.join(', ') || 'none');
check('shell', 'Bento licence NOTICE is present', /NOTICE\s+—\s+bento\/slides/.test(src) && /MIT License/.test(src));
const tpn = join(dirname(DECK_SOURCE), 'THIRD-PARTY-NOTICES.md');
check('shell', 'deck/THIRD-PARTY-NOTICES.md carries Bento\'s MIT licence',
  existsSync(tpn) && /Copyright \(c\) 2026 The Bento authors/.test(readFileSync(tpn, 'utf8'))
    && /Permission is hereby granted, free of charge/.test(readFileSync(tpn, 'utf8')));

if (!existsSync(DECK_OUT)) bail('dist/deck/index.html is missing. Run `npm run build` first.');
const pub = readFileSync(DECK_OUT, 'utf8');
const csp = deckCsp(deckLoaderHash(src));
const metaTag = `\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />\n    ${DECK_PLAYER_STYLE}`;
check('shell', 'the player style is one CSS rule and no script', /^<style>[^<]*<\/style>$/.test(DECK_PLAYER_STYLE)
  && !/@import|url\(|expression|javascript:/i.test(DECK_PLAYER_STYLE), DECK_PLAYER_STYLE);
const anchor = '<meta charset="UTF-8" />';
check('shell', 'source is an editable deck (no readonly flag)', !doc.readonly, String(doc.readonly));
const pubDocText = (pub.match(DECK_DOC_RE) || [])[2] || '';
let pubDoc = null;
try { pubDoc = JSON.parse(pubDocText); } catch { /* reported below */ }
check('shell', 'published document = source document in player mode (readonly + controls), nothing else',
  pubDoc !== null && JSON.stringify(pubDoc) === JSON.stringify(publishedDeckDoc(doc)) && pubDoc.readonly === true
    && pubDoc.present?.controls === true && !pubDocText.includes('<'),
  pubDoc ? `readonly=${pubDoc.readonly}, controls=${pubDoc.present?.controls}` : 'unparseable');
const pubShell = pub.replace(DECK_DOC_RE, (_, open, _body, close) => open + '\u0000' + close);
const srcShell = src.replace(DECK_DOC_RE, (_, open, _body, close) => open + '\u0000' + close);
check('shell', 'published copy outside the document = source + the deck CSP <meta> + the player style, nothing else',
  pubShell === srcShell.replace(anchor, anchor + metaTag), 'runtime, loader and NOTICE byte-identical');
check('shell', 'deck CSP closes the network and pins scripts',
  /connect-src 'none'/.test(csp) && /default-src 'none'/.test(csp) && !/unsafe-eval/.test(csp) && !/script-src[^;]*unsafe-inline/.test(csp), csp);

// ---- 3. browser ----------------------------------------------------------------------------------
console.log('\n\x1b[1m  Browser (published copy, Pages sub-path, meta CSP)\x1b[0m');
const chrome = findChrome();
if (!chrome) bail('no Chrome found. Set PUPPETEER_EXECUTABLE_PATH to a Chrome/Chromium binary.');
mkdirSync(OUT, { recursive: true });
// Requests are answered by interception, not a server: no listening socket. The origin is a reserved
// test name, so nothing here can reach the network even by accident.
const ORIGIN = 'https://deck.test';
const PAGE = `${ORIGIN}/sample-aws-ai-tokenomics-finops/deck/`;
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const offOrigin = [];
  const pageErrors = [];
  await page.setRequestInterception(true);
  // The editable source is served too, under the SAME policy as a header: the player has no
  // window.bento.validate(), so Bento's own validation runs on the source it was built from.
  const SRC_PAGE = `${ORIGIN}/source/deck.bento.html`;
  page.on('request', (r) => {
    const u = r.url().split('#')[0];
    if (u === PAGE) return r.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: pub });
    if (u === SRC_PAGE) {
      return r.respond({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': csp }, body: src });
    }
    if (u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
    offOrigin.push(r.url().slice(0, 160));
    return r.abort();
  });
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.evaluateOnNewDocument(() => {
    window.__cspRefusals = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__cspRefusals.push({ directive: e.effectiveDirective, blockedURI: e.blockedURI || '' });
    }, true);
  });
  await page.goto(SRC_PAGE, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.bento?.validate === 'function', { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1500));

  // The deck's theme uses the system-ui font stack, so Bento's overflow findings are measurements of
  // whichever fonts this machine has (CI's Ubuntu fallback is wider than macOS or Windows UIs). They
  // are reported, not failed. Every error, and every other warning, fails.
  const FONT_METRIC = new Set(['text-overflow', 'table-overflow']);
  const v = await page.evaluate(() => window.bento.validate().findings
    .filter((f) => f.severity !== 'info')
    .map((f) => ({ severity: f.severity, code: f.code, where: `${f.slide || ''}/${f.element || ''}` })));
  const blocking = v.filter((f) => f.severity === 'error' || !FONT_METRIC.has(f.code));
  const metric = v.filter((f) => !blocking.includes(f));
  check('browser', 'Bento validate(): no errors, no structural warnings', blocking.length === 0,
    blocking.map((f) => `${f.where} ${f.code}`).join('; ') || 'none');
  if (metric.length) {
    console.log(`  \x1b[2m· ${metric.length} font-dependent overflow finding(s) on this machine's fonts (not failed): `
      + `${metric.map((f) => f.where).join(', ')}\x1b[0m`);
  }

  // What a public visitor gets at /deck/: the show, not the editor. Player mode never builds the editor
  // (its #app stays empty) and exposes no editing API on window.bento.
  await page.goto('about:blank');
  await page.goto(PAGE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.bento?.doc && document.querySelector('.reveal .slides > section.present'), { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2500));
  const landing = await page.evaluate(() => ({
    readonly: window.bento.readonly === true,
    editorApi: typeof window.bento.validate === 'function' || typeof window.bento.loadDoc === 'function',
    appChildren: document.getElementById('app')?.children.length ?? 0,
    arrows: !!document.querySelector('.reveal .controls .navigate-right'),
    arrowColor: getComputedStyle(document.querySelector('.reveal .controls') || document.body).color
  }));
  const arrow = parseColor(landing.arrowColor);
  const slideBg = parseColor(doc.theme.background);
  const arrowRatio = arrow && slideBg ? ratio([0, 1, 2].map((i) => arrow[i] * arrow[3] + slideBg[i] * (1 - arrow[3])), slideBg) : 0;
  check('browser', 'next/prev arrows meet WCAG 3:1 for UI controls on the slide background', arrowRatio >= 3,
    `${landing.arrowColor} = ${arrowRatio.toFixed(2)}:1`);
  delete landing.arrowColor;
  check('browser', '/deck/ opens the presentation, not the editor',
    landing.readonly && !landing.editorApi && landing.appChildren === 0, JSON.stringify(landing));
  check('browser', 'on-screen next/prev arrows are shown', landing.arrows);
  await page.screenshot({ path: join(OUT, 'landing.png') });

  // Step through the show. Builds (fragments) take key presses too, so track the section index.
  const state = () => page.evaluate(() => {
    const all = [...document.querySelectorAll('.reveal .slides > section')];
    const i = all.findIndex((s) => s.classList.contains('present'));
    // One <section> per slide in document order; state slides are sections too (data-bento-state),
    // which the show's navigation skips.
    return { i, n: all.length, id: window.bento.doc.slides[i]?.id };
  });
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  // Walk the whole show. A slide's builds consume presses without moving, so the walk ends only after
  // many presses in a row go nowhere (the last slide).
  const visited = new Set([(await state()).id]);
  let last = await state();
  for (let presses = 0, stuck = 0; presses < 400 && stuck < 12; presses++) {
    await page.keyboard.press('ArrowRight');
    await pause(250);
    const now = await state();
    if (now.i !== last.i) { visited.add(now.id); stuck = 0; } else stuck++;
    last = now;
  }
  check('browser', `stepped through all ${EXPECT.mainSequence} slides`, visited.size === EXPECT.mainSequence, `${visited.size} visited`);

  // Screenshots: walk again; on a target slide keep the last fully built frame before it is left.
  for (const [id, name] of Object.entries(EXPECT.screenshots)) {
    await page.goto('about:blank'); // a hash-only goto would not reload the show
    await page.goto(PAGE, { waitUntil: 'load' });
    await page.waitForFunction(() => window.bento?.doc && document.querySelector('.reveal .slides > section.present'), { timeout: 30000 });
    await pause(800);
    for (let presses = 0; presses < 400; presses++) {
      const now = await state();
      if (now.id === id) {
        await pause(1800); // entrances and count-ups settle
        await page.screenshot({ path: join(OUT, `${name}.png`) });
      } else if (now.i > slides.findIndex((s) => s.id === id)) break; // passed it
      const before = now.i;
      await page.keyboard.press('ArrowRight');
      await pause(250);
      if ((await state()).i === before && now.i === now.n - 1) break; // end of show
    }
  }

  const refusals = await page.evaluate(() => window.__cspRefusals);
  const unexpected = refusals.filter((r) => !ALLOWED_REFUSALS.some((a) => a.match(r)));
  check('browser', 'no CSP refusal beyond the three designed ones', unexpected.length === 0,
    unexpected.map((r) => `${r.directive} ${r.blockedURI}`).join('; ') || `${refusals.length} designed`);
  check('browser', 'no request to any other origin', offOrigin.length === 0, offOrigin.join(', ') || 'none');
  check('browser', 'no page errors', pageErrors.length === 0, pageErrors.join(' | ') || 'none');
  const want = [...Object.values(EXPECT.screenshots), 'landing'];
  const shots = want.filter((n) => existsSync(join(OUT, `${n}.png`)));
  check('browser', `screenshots: ${want.join(', ')}`, shots.length === want.length, `.verify-out/deck/{${shots.join(',')}}.png`);
} finally {
  await browser.close();
}

// ---- report --------------------------------------------------------------------------------------
const failed = results.filter((r) => !r.ok);
console.log('');
if (failed.length) {
  console.error(`\x1b[31m\x1b[1m✖ ${failed.length} of ${results.length} deck checks failed\x1b[0m`);
  for (const f of failed) console.error(`  • [${f.part}] ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
  console.error('\nSee deck/README.md for the public-safety rule.\n');
  process.exit(1);
}
console.log(`\x1b[32m\x1b[1m✓ all ${results.length} deck checks passed\x1b[0m\n`);
