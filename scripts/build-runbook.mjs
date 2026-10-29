#!/usr/bin/env node
/**
 * Generate the runbook's <style> and <script> blocks from the site/src source tree.
 *
 *   site/src/css/index.css  (@import order)  ─┐
 *   site/src/js/main.mjs    (esbuild bundle) ─┴─► content/index.html
 *
 * Why this exists
 * ---------------
 * The runbook has to stay a single self-contained file with exactly ONE <style> and ONE <script>:
 * that is what `build-site.mjs` asserts before it can split the file into the same-origin
 * assets the site's Content-Security-Policy requires. But 824 lines of CSS and 690 lines of JS inside a 4,400-line
 * content file are not maintainable, and there is nowhere to put a component.
 *
 * So the source of truth splits by concern, not by file type:
 *
 *   - CONTENT (prose, levers, tables, citations)  -> content/index.html, authored
 *   - BEHAVIOUR and PRESENTATION                  -> site/src/, authored as modules
 *
 * This script injects the built CSS and JS back into the two marked regions of index.html. The
 * one-style/one-script invariant therefore holds by construction rather than by discipline, and
 * `build-site.mjs` needed no change to its assertions.
 *
 * Design choices worth not undoing
 * --------------------------------
 * 1. CSS is CONCATENATED, not bundled by esbuild. The original <style> was a single cascade, and
 *    the modules are contiguous slices of it in their original order, so a plain ordered join is
 *    provably equivalent. Running it through a CSS bundler would risk normalising `color-mix()`,
 *    custom properties, or `@media` nesting and silently changing which rule wins. Nothing about
 *    this stylesheet needs a bundler.
 * 2. Output is NOT minified. It lands inside a committed file that has to stay reviewable in
 *    `git diff` and legible as a deliverable someone may open from disk. Bytes are not the
 *    constraint here; a readable diff is.
 * 3. Injection is between explicit markers rather than by replacing the whole tag, so the <style>
 *    and <script> tags themselves, and their attributes, stay under the author's control.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = join(REPO_ROOT, 'content', 'index.html');
const CSS_DIR = join(REPO_ROOT, 'site', 'src', 'css');
const JS_ENTRY = join(REPO_ROOT, 'site', 'src', 'js', 'main.mjs');

const CSS_START = '/* @generated:css:start */';
const CSS_END = '/* @generated:css:end */';
const JS_START = '/* @generated:js:start */';
const JS_END = '/* @generated:js:end */';

const NOTE_CSS = `${CSS_START}\n`
  + `/* GENERATED — do not edit inside this region.\n`
  + `   Source: site/src/css/ (order declared by index.css). Regenerate: npm run build:runbook */\n`;
const NOTE_JS = `${JS_START}\n`
  + `/* GENERATED — do not edit inside this region.\n`
  + `   Source: site/src/js/ (entry main.mjs). Regenerate: npm run build:runbook */\n`;

function abort(message, hint) {
  console.error(`\n✖ build-runbook: ${message}`);
  if (hint) console.error(`  ${hint}`);
  console.error('');
  process.exit(1);
}

/** Replace everything between `start` and `end`, asserting each appears exactly once, in order. */
function injectBetween(text, start, end, replacement, label) {
  const countOf = (needle) => text.split(needle).length - 1;
  if (countOf(start) !== 1) abort(`expected exactly one ${label} start marker, found ${countOf(start)}.`, `Marker: ${start}`);
  if (countOf(end) !== 1) abort(`expected exactly one ${label} end marker, found ${countOf(end)}.`, `Marker: ${end}`);
  const a = text.indexOf(start);
  const b = text.indexOf(end);
  if (b < a) abort(`the ${label} end marker precedes its start marker.`);
  return text.slice(0, a) + replacement + text.slice(b);
}

// ---------------------------------------------------------------------------
// 1. CSS — ordered concatenation, order declared once in index.css
// ---------------------------------------------------------------------------

let cssIndex;
try {
  cssIndex = readFileSync(join(CSS_DIR, 'index.css'), 'utf8');
} catch (e) {
  abort(`cannot read site/src/css/index.css: ${e.message}`);
}

const cssFiles = [...cssIndex.matchAll(/@import\s+["']\.\/([^"']+)["']\s*;/g)].map((m) => m[1]);
if (cssFiles.length === 0) {
  abort('site/src/css/index.css declares no @import rules.', 'The cascade order is declared there; without it there is nothing to build.');
}

const cssParts = cssFiles.map((name) => {
  try {
    return readFileSync(join(CSS_DIR, name), 'utf8').replace(/\s*$/, '');
  } catch (e) {
    abort(`cannot read site/src/css/${name} (imported by index.css): ${e.message}`);
  }
});
const css = cssParts.join('\n\n');

// ---------------------------------------------------------------------------
// 2. JS — esbuild, IIFE so it needs no module attribute on the <script> tag
// ---------------------------------------------------------------------------
// format:'iife' matters: a <script type="module"> would be deferred and would also be fetched as a
// separate request after the split, changing execution order.

let js;
try {
  const out = buildSync({
    entryPoints: [JS_ENTRY],
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2017',
    minify: false,
    legalComments: 'none',
    charset: 'utf8',
    logLevel: 'warning'
  });
  js = out.outputFiles[0].text.replace(/\s*$/, '');
} catch (e) {
  abort(`esbuild failed: ${e.message}`, 'Fix the module error above; nothing was written.');
}

// ---------------------------------------------------------------------------
// 3. CSP guards — fail here rather than in build-site.mjs or, worse, in the browser
// ---------------------------------------------------------------------------
// The site serves under style-src 'self' with no 'unsafe-inline'. An inline style attribute in the
// generated JS survives into script.js and is then blocked at runtime, silently. Set geometry through
// attributes (SVG width/x) or CSSOM (el.style.prop = ...) instead — neither is governed by CSP.

/**
 * Inline style attributes still tolerated in the generated JS, as a ratchet rather than a ban.
 *
 * These are not safe — `style-src 'self'` blocks them. The upstream build once rewrote two of them
 * with byte-exact string patches (the coverage-bar widths and an old version tag); both are now
 * authored correctly at source, so the tolerance is 0 and the site build carries no patches.
 *
 * The number only ever goes down. A new inline style is a hard failure, because the app build has
 * no patch for it and it would reach the browser and be blocked silently.
 */
const TOLERATED_INLINE_STYLES_IN_JS = 0;

{
  const inCss = [...css.matchAll(/style\s*=\s*(["'])/g)].length;
  if (inCss > 0) abort(`${inCss} inline style attribute(s) in the generated CSS — that is not a thing; check the source.`);

  const inJs = [...js.matchAll(/style\s*=\s*(["'])/g)].length;
  if (inJs > TOLERATED_INLINE_STYLES_IN_JS) {
    abort(
      `${inJs} inline style attribute(s) in the generated JS, tolerating at most ${TOLERATED_INLINE_STYLES_IN_JS}; the site's CSP blocks them at runtime.`,
      'Use an SVG geometry attribute or a CSSOM write (el.style.prop = ...), never setAttribute("style", ...).'
    );
  }
  if (inJs < TOLERATED_INLINE_STYLES_IN_JS) {
    console.log(`  note     inline styles in JS down to ${inJs}; lower TOLERATED_INLINE_STYLES_IN_JS in this script to hold the gain`);
  }
}
if (/<\/script/i.test(js)) {
  abort('the generated JS contains a literal "</script"; it would terminate the <script> block early.', 'Split the string, e.g. "<\\/script".');
}
if (/<\/style/i.test(css)) {
  abort('the generated CSS contains a literal "</style"; it would terminate the <style> block early.');
}

// ---------------------------------------------------------------------------
// 4. Inject and write
// ---------------------------------------------------------------------------

let html;
try {
  html = readFileSync(TARGET, 'utf8');
} catch (e) {
  abort(`cannot read ${TARGET}: ${e.message}`);
}

const before = html;
html = injectBetween(html, CSS_START, CSS_END, `${NOTE_CSS}\n${css}\n\n`, 'CSS');
html = injectBetween(html, JS_START, JS_END, `${NOTE_JS}\n${js}\n\n`, 'JS');

// Re-assert the invariant the app build depends on, on the actual output.
const styleTags = (html.match(/<style(\s[^>]*)?>/gi) || []).length;
const scriptTags = (html.match(/<script(\s[^>]*)?>/gi) || []).length;
if (styleTags !== 1 || scriptTags !== 1) {
  abort(
    `the generated runbook has ${styleTags} <style> and ${scriptTags} <script> tag(s); it must have exactly one of each.`,
    'build-site.mjs asserts this and cannot split the file otherwise.'
  );
}

const unchanged = before === html;
writeFileSync(TARGET, html);

const kb = (s) => `${(Buffer.byteLength(s, 'utf8') / 1024).toFixed(1)} KB`;
console.log('✔ build-runbook');
console.log(`  styles   ${kb(css)}  from ${cssFiles.length} module(s): ${cssFiles.join(', ')}`);
console.log(`  script   ${kb(js)}  bundled from site/src/js/main.mjs`);
console.log(`  target   content/index.html ${unchanged ? '(no change)' : '(updated)'}`);
console.log(`  one <style> + one <script> preserved — build-site.mjs assertions hold`);
