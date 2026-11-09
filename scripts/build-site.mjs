#!/usr/bin/env node
/**
 * Generate the static GitHub Pages site from the single-file runbook.
 *
 *   site/src/{css,js}       (authored: presentation + behaviour)
 *        -> npm run build:runbook        (scripts/build-runbook.mjs)
 *   content/index.html      (authored content + the two generated blocks)
 *        -> dist/index.html             (generated, git-ignored)
 *        -> dist/styles.css             (generated)
 *        -> dist/script.js              (generated)
 *        -> dist/.nojekyll              (Pages: serve the files as-is, no Jekyll pass)
 *   site/static/og-image.png -> dist/og-image.png (link-preview image, committed source)
 *        -> dist/sitemap.xml, dist/robots.txt (crawler files, absolute URLs under SITE_URL)
 *   deck/tokenomics-for-ai-workloads.bento.html (presenter deck, editable with Bento)
 *        -> dist/deck/index.html        (player mode + its own CSP <meta>; see publishedDeckDoc, deckCsp)
 *
 * Why the split
 * -------------
 * `content/index.html` is deliberately one self-contained file: it can be opened from disk and it is
 * what the verifiers read. The published site instead runs under a strict Content-Security-Policy,
 * `script-src 'self'; style-src 'self'` with NO `'unsafe-inline'`, delivered as a <meta> tag because
 * GitHub Pages cannot set response headers. Shipping the single file under that policy would render it
 * unstyled and inert, so this script mechanically lifts the inline blocks into same-origin assets:
 *
 *   1. the single inline <style>  -> styles.css
 *   2. the single inline <script> -> script.js
 *   3. any leftover static style="..." attribute -> a generated utility class (safety net; should find 0)
 *   4. injects the CSP <meta> into <head>
 *
 * Every asset reference is RELATIVE ("./styles.css", "./script.js"), so the site works unchanged at
 * the Pages project sub-path (/sample-aws-ai-tokenomics-finops/), at a custom domain root, and from a
 * local static server. `npm run verify:dom` serves dist/ under that sub-path to prove it.
 *
 * The script is deterministic and idempotent: it always reads content/index.html fresh. It asserts its
 * assumptions about the upstream shape and aborts loudly rather than silently emitting a broken page.
 */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UPSTREAM = join(REPO_ROOT, 'content', 'index.html');
const OUT_DIR = join(REPO_ROOT, 'dist');
const STATIC_DIR = join(REPO_ROOT, 'site', 'static');

/**
 * The canonical public address of the site (GitHub Pages project URL, trailing slash). Search engines and
 * link previews need ABSOLUTE URLs, so this is the one place the published origin + base path is stated;
 * page assets themselves stay relative. Exported so verify-runbook-dom.mjs asserts against the same value.
 */
export const SITE_URL = 'https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/';
/** The link-preview image, committed in site/static/ (rendered by scripts/make-og-image.mjs). */
export const OG_IMAGE = 'og-image.png';

/**
 * The policy the published page runs under. Exported so verify-runbook-dom.mjs serves dist/ with the
 * SAME policy as a response header: one statement of the fact, so the two cannot drift.
 * `form-action 'none'`: the page has no forms that submit anywhere. `connect-src 'self'`: it makes no
 * network calls at all, and nothing off-origin is allowed even by accident.
 */
export const SITE_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'"
].join('; ');

/**
 * The presenter deck: a self-contained Bento (bento.page, MIT) file, published at <SITE_URL>deck/.
 * The repo keeps the editable source byte-for-byte as Bento saves it; the published copy is the same file
 * with its document switched to player mode (see publishedDeckDoc) and ONE <meta> CSP inserted after its
 * charset. A CSP <meta> is not put in the source because Bento treats one as markup a genuine document
 * never carries.
 */
export const DECK_SOURCE = join(REPO_ROOT, 'deck', 'tokenomics-for-ai-workloads.bento.html');
export const DECK_OUT = join(OUT_DIR, 'deck', 'index.html');

/**
 * The deck's executable inline scripts: every <script> without a type, or with a JavaScript type.
 * Bento's data blocks (application/bento+json, bento/deflate-b86) are not executable and are excluded.
 * Returns their exact text, the string a CSP hash is computed over.
 */
export function deckExecutableScripts(html) {
  const JS_TYPES = new Set(['', 'text/javascript', 'application/javascript', 'module']);
  const out = [];
  for (const m of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1] || '';
    const type = ((attrs.match(/\stype\s*=\s*"([^"]*)"/i) || [])[1] || '').trim().toLowerCase();
    if (/\ssrc\s*=/i.test(attrs)) out.push({ src: true, text: '' });
    else if (JS_TYPES.has(type)) out.push({ src: false, text: m[2] });
  }
  return out;
}

/**
 * The deck page's policy, as tight as the Bento runtime allows. It is Bento's own host policy
 * (kernel/src/gate1.ts hostPolicy) with every network directive closed:
 *   - script-src: the loader's hash plus blob:, the runtime the loader decompresses and imports.
 *     The loader first tries an inline <script> and then `new Function`; both are refused here by
 *     design and it falls back to blob:. No 'unsafe-inline', no 'unsafe-eval'.
 *   - style-src 'unsafe-inline': the runtime renders slides with inline styles (Bento's host policy
 *     does the same; its sanitizer is the style control). Scripts stay hash-pinned.
 *   - connect-src 'none': the runtime's launch-time update check to bento.page is refused in the
 *     browser, so the page makes no network request at all. Images, media and fonts are data:/blob:.
 * GitHub Pages cannot send headers, so this ships as a <meta>; frame-ancestors cannot be set that way.
 */
export function deckCsp(loaderHash) {
  return [
    "default-src 'none'",
    `script-src '${loaderHash}' blob:`,
    "style-src 'unsafe-inline'",
    'img-src data: blob:',
    'media-src data: blob:',
    'font-src data: blob:',
    "connect-src 'none'",
    "worker-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'"
  ].join('; ');
}

/** sha256-<base64> of the deck's one executable inline script (the Bento loader); aborts otherwise. */
export function deckLoaderHash(html) {
  const scripts = deckExecutableScripts(html);
  if (scripts.length !== 1 || scripts[0].src) {
    abort(`the deck must carry exactly one executable inline <script> (the Bento loader) and no <script src>; found ${scripts.length}.`,
      'A re-saved deck from a newer Bento may add a preview remover: extend deckCsp() to hash it too.');
  }
  return `sha256-${createHash('sha256').update(scripts[0].text, 'utf8').digest('base64')}`;
}

/** The deck's document block: one plaintext JSON script, as Bento's splice contract guarantees. */
export const DECK_DOC_RE = /(<script type="application\/bento\+json" id="bento-doc">)([\s\S]*?)(<\/script>)/;

/**
 * The published copy is a PLAYER: Bento's own `readonly` document field boots straight into the
 * presentation and never builds the editor (bento/slides docs/format.md, "File modes"); ending the show
 * lands on a card with a Present button. `present.controls` shows the on-screen next/prev arrows;
 * `present.slideNumber: false` drops the overlay counter those arrows would sit on (content slides print
 * their own page number). These are document fields only: the runtime and the loader are untouched, so
 * the CSP hash is too. The source in deck/ stays an editable deck for maintainers.
 */
export function publishedDeckDoc(doc) {
  return { ...doc, readonly: true, present: { ...(doc.present || {}), controls: true, slideNumber: false } };
}

/**
 * One presentation-only style rule for the player copy, inserted after the CSP <meta>. Bento's runtime CSS
 * sets `--r-controls-color` (white, 60%) for its show, but reveal.js's own `.reveal .controls{color:#000}`
 * wins, so the arrows render black on this dark deck. This applies the runtime's own variable, and lifts
 * the arrows into the slide's empty right margin (content stops at x 1184 of 1280) so they clear the
 * page number in the footer. A style block, not a script: `style-src 'unsafe-inline'` already allows it.
 * shortcut: a host-side override of reveal's control colour; drop it once Bento's runtime applies
 * --r-controls-color itself.
 */
export const DECK_PLAYER_STYLE = '<style>.bento-present-overlay .reveal .controls{color:var(--r-controls-color);bottom:72px}</style>';

/** Publish the deck: the source with its document set to player mode, plus the CSP <meta>. */
function buildDeck() {
  const src = readFileSync(DECK_SOURCE, 'utf8');
  if (/http-equiv\s*=\s*"Content-Security-Policy"/i.test(src)) {
    abort('deck/ source already carries a CSP <meta>; build-site.mjs owns it.');
  }
  const csp = deckCsp(deckLoaderHash(src));
  const blocks = src.match(new RegExp(DECK_DOC_RE.source, 'g')) || [];
  if (blocks.length !== 1) abort(`the deck must carry exactly one #bento-doc block; found ${blocks.length}.`);
  const doc = JSON.parse(src.match(DECK_DOC_RE)[2]);
  if (doc.readonly) abort('deck/ source is already a player file; keep the source editable, the build sets readonly.');
  // Escape every < as \u003c so the JSON can never close its own <script> (Bento hard rule 1).
  const json = JSON.stringify(publishedDeckDoc(doc)).replace(/</g, '\\u003c');
  const player = src.replace(DECK_DOC_RE, (_, open, _body, close) => open + json + close);
  const out = replaceOnce(player, '<meta charset="UTF-8" />',
    `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />\n    ${DECK_PLAYER_STYLE}`,
    'deck charset <meta>');
  mkdirSync(dirname(DECK_OUT), { recursive: true });
  writeFileSync(DECK_OUT, out);
  return { csp, bytes: Buffer.byteLength(out, 'utf8') };
}

function abort(message, hint) {
  console.error(`\n✖ build-site: ${message}`);
  if (hint) console.error(`  ${hint}`);
  console.error('');
  process.exit(1);
}

/** Extract the body of exactly one <tag>...</tag> pair, asserting uniqueness. */
function extractSole(html, tag) {
  const openRe = new RegExp(`<${tag}(\\s[^>]*)?>`, 'gi');
  const closeTag = `</${tag}>`;
  const opens = [...html.matchAll(openRe)];
  const closes = [...html.matchAll(new RegExp(closeTag, 'gi'))];

  if (opens.length !== 1 || closes.length !== 1) {
    abort(
      `expected exactly one <${tag}> block in content/index.html, found ${opens.length} open / ${closes.length} close.`,
      'The upstream file changed shape. Re-read this script before trusting its output.'
    );
  }

  const openStart = opens[0].index;
  const bodyStart = openStart + opens[0][0].length;
  const bodyEnd = closes[0].index;
  if (bodyEnd < bodyStart) abort(`malformed <${tag}> block: closing tag precedes opening tag.`);

  return {
    body: html.slice(bodyStart, bodyEnd),
    before: html.slice(0, openStart),
    after: html.slice(bodyEnd + closeTag.length)
  };
}

/** Replace `needle` exactly once, asserting it was found exactly once. */
function replaceOnce(text, needle, replacement, label) {
  const first = text.indexOf(needle);
  if (first === -1) abort(`could not find the ${label}.`, 'Upstream changed. Update this script to match.');
  if (text.indexOf(needle, first + needle.length) !== -1) {
    abort(`the ${label} appears more than once; refusing to guess which to patch.`);
  }
  return text.slice(0, first) + replacement + text.slice(first + needle.length);
}

function main() {
  // -------------------------------------------------------------------------
  // 1. Read upstream and split out the inline blocks
  // -------------------------------------------------------------------------
  let upstream;
  try {
    upstream = readFileSync(UPSTREAM, 'utf8');
  } catch (e) {
    abort(`cannot read ${UPSTREAM}: ${e.message}`);
  }

  const style = extractSole(upstream, 'style');
  let css = style.body;
  const htmlWithLink = `${style.before}<link rel="stylesheet" href="./styles.css">${style.after}`;
  const script = extractSole(htmlWithLink, 'script');
  const js = script.body;
  let html = `${script.before}<script src="./script.js"></script>${script.after}`;

  // -------------------------------------------------------------------------
  // 2. Assert the extracted JS is CSP-clean
  // -------------------------------------------------------------------------
  const leftoverJsStyles = [...js.matchAll(/style\s*=\s*(["'])/g)];
  if (leftoverJsStyles.length > 0) {
    abort(
      `${leftoverJsStyles.length} inline style attribute(s) remain in the extracted JS; they would be blocked by CSP at runtime.`,
      'Author it in site/src/css as a class, or set it through CSSOM (el.style.prop = ...) which CSP does not govern.'
    );
  }

  // -------------------------------------------------------------------------
  // 3. Hoist static inline style attributes in the HTML into generated classes (safety net)
  // -------------------------------------------------------------------------
  const GENERATED_RULES = [];
  const declToClass = new Map();
  html = html.replace(/<([a-zA-Z][\w-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>/g,
    (tagMatch, tagName, attrs, selfClose) => {
      const styleMatch = attrs.match(/\sstyle\s*=\s*"([^"]*)"/);
      if (!styleMatch) return tagMatch;
      const decl = styleMatch[1].trim().replace(/;\s*$/, '');
      if (!decl) return tagMatch.replace(styleMatch[0], '');
      if (!declToClass.has(decl)) {
        const className = `rb-s${declToClass.size + 1}`;
        declToClass.set(decl, className);
        GENERATED_RULES.push(`.${className} { ${decl}; }`);
      }
      const className = declToClass.get(decl);
      let nextAttrs = attrs.replace(styleMatch[0], '');
      const classMatch = nextAttrs.match(/(\sclass\s*=\s*")([^"]*)(")/);
      nextAttrs = classMatch
        ? nextAttrs.replace(classMatch[0], `${classMatch[1]}${classMatch[2].trim()} ${className}${classMatch[3]}`)
        : `${nextAttrs.replace(/\s+$/, '')} class="${className}"`;
      return `<${tagName}${nextAttrs}${selfClose ? ' /' : ''}>`;
    }
  );
  const leftoverHtmlStyles = [...html.matchAll(/\sstyle\s*=\s*(["'])/g)];
  if (leftoverHtmlStyles.length > 0) {
    abort(`${leftoverHtmlStyles.length} inline style attribute(s) remain in the generated HTML.`,
      "Likely a single-quoted style attribute, which the hoister doesn't handle. Extend it.");
  }
  if (GENERATED_RULES.length > 0) {
    css += '\n\n/* Generated by scripts/build-site.mjs — hoisted from inline style="..." attributes.\n'
      + '   These belong in site/src/css as real classes; hoisting is a fallback. */\n'
      + GENERATED_RULES.join('\n') + '\n';
  }

  // -------------------------------------------------------------------------
  // 4. Inject the CSP <meta>, first in <head> so it governs everything after it
  // -------------------------------------------------------------------------
  if (/http-equiv\s*=\s*"Content-Security-Policy"/i.test(html)) {
    abort('content/index.html already carries a CSP <meta>; this script owns it.',
      'Remove it from content/index.html: an inline-blocking CSP there would break the self-contained file.');
  }
  html = replaceOnce(html, '<meta charset="utf-8">',
    `<meta charset="utf-8">\n  <meta http-equiv="Content-Security-Policy" content="${SITE_CSP}">`, 'charset <meta>');

  // -------------------------------------------------------------------------
  // 5. Discoverability head tags: canonical, Open Graph, Twitter card, JSON-LD
  // -------------------------------------------------------------------------
  // Published-site only: they name the live URL, which is wrong for a copy opened from disk. Title and
  // description are read from content/index.html so there is one statement of each.
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1];
  const description = (html.match(/<meta name="description" content="([^"]*)">/) || [])[1];
  if (!title || !description) abort('content/index.html needs a <title> and a <meta name="description">.');
  if (/rel\s*=\s*"canonical"|property\s*=\s*"og:|application\/ld\+json/i.test(html)) {
    abort('content/index.html already carries canonical/Open Graph/JSON-LD tags; this script owns them.');
  }
  const ogImageUrl = SITE_URL + OG_IMAGE;
  const attr = (v) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  // Entities in the authored attributes are decoded for JSON-LD (plain text, not HTML).
  const plain = (v) => v.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    name: plain(title),
    headline: 'AI Tokenomics FinOps',
    description: plain(description),
    url: SITE_URL,
    image: ogImageUrl,
    inLanguage: 'en',
    license: 'https://spdx.org/licenses/MIT-0.html',
    isAccessibleForFree: true,
    keywords: 'Amazon Bedrock cost optimization, GenAI FinOps, LLM token cost, AI cost optimization, agentic AI, token economics',
    // The publisher is the open-source project itself: this is a sample, not official AWS documentation.
    publisher: {
      '@type': 'Organization',
      name: 'AI Tokenomics FinOps (aws-samples open-source project)',
      url: 'https://github.com/aws-samples/sample-aws-ai-tokenomics-finops'
    },
    isBasedOn: 'https://github.com/aws-samples/sample-aws-ai-tokenomics-finops'
  };
  const SEO_HEAD = [
    `<link rel="canonical" href="${SITE_URL}">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="AI Tokenomics FinOps">',
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:url" content="${SITE_URL}">`,
    `<meta property="og:image" content="${ogImageUrl}">`,
    '<meta property="og:image:type" content="image/png">',
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    '<meta property="og:image:alt" content="AI Tokenomics FinOps: a self-assessment runbook for cutting LLM token cost on Amazon Bedrock">',
    '<meta property="og:locale" content="en_US">',
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${title}">`,
    `<meta name="twitter:description" content="${description}">`,
    `<meta name="twitter:image" content="${ogImageUrl}">`,
    '<meta name="twitter:image:alt" content="AI Tokenomics FinOps: a self-assessment runbook for cutting LLM token cost on Amazon Bedrock">',
    // A data block, not a script: CSP script-src does not govern it and the browser never executes it.
    `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`
  ].map((l) => `  ${l}`).join('\n');
  html = replaceOnce(html, '</head>', `${SEO_HEAD}\n</head>`, '</head> tag');

  // -------------------------------------------------------------------------
  // 6. Write
  // -------------------------------------------------------------------------
  const BANNER = 'GENERATED FILE — do not edit. Source: content/index.html '
    + '(itself partly generated from site/src/ — regenerate the lot with `npm run build`)';
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'styles.css'), `/* ${BANNER} */\n${css}`);
  writeFileSync(join(OUT_DIR, 'script.js'), `/* ${BANNER} */\n${js}`);
  writeFileSync(join(OUT_DIR, 'index.html'), html.replace(/^<!DOCTYPE html>/i, `<!DOCTYPE html>\n<!-- ${BANNER} -->`));
  writeFileSync(join(OUT_DIR, '.nojekyll'), '');

  // Static assets committed in site/static/ (the link-preview image) are copied as-is.
  if (!existsSync(join(STATIC_DIR, OG_IMAGE))) abort(`missing site/static/${OG_IMAGE}`, 'Run scripts/make-og-image.mjs.');
  for (const name of readdirSync(STATIC_DIR)) copyFileSync(join(STATIC_DIR, name), join(OUT_DIR, name));

  // Crawler files. The site is one page, so the sitemap lists exactly the canonical URL. No <lastmod>:
  // the build stays deterministic, and a guessed date is worse than none.
  writeFileSync(join(OUT_DIR, 'sitemap.xml'),
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + `  <url>\n    <loc>${SITE_URL}</loc>\n  </url>\n`
    + `  <url>\n    <loc>${SITE_URL}deck/</loc>\n  </url>\n`
    + '</urlset>\n');

  // The presenter deck, under its own CSP (see deckCsp). The runbook's SITE_CSP is not touched.
  const deck = buildDeck();
  // A project site's robots.txt is not at the host root, so crawlers do not read it there; it still
  // documents the sitemap location, and search consoles accept the sitemap URL directly.
  writeFileSync(join(OUT_DIR, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}sitemap.xml\n`);

  const kb = (s) => `${(Buffer.byteLength(s, 'utf8') / 1024).toFixed(1)} KB`;
  console.log('✔ build-site');
  console.log(`  dist/index.html  ${kb(html)}`);
  console.log(`  dist/styles.css  ${kb(css)}`);
  console.log(`  dist/script.js   ${kb(js)}`);
  console.log(`  hoisted ${declToClass.size} inline-style declaration(s) into classes`
    + `${declToClass.size === 0 ? ' (expected: they are authored in site/src/css)' : ' — move these into site/src/css'}`);
  console.log(`  CSP <meta>: ${SITE_CSP}`);
  console.log(`  canonical + Open Graph + JSON-LD -> ${SITE_URL}; sitemap.xml, robots.txt, ${OG_IMAGE}`);
  console.log(`  dist/deck/index.html  ${(deck.bytes / 1024 / 1024).toFixed(2)} MB  (deck CSP: ${deck.csp})`);
}

// Run only when executed, so verify-runbook-dom.mjs can import SITE_CSP without rebuilding.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
