#!/usr/bin/env node
/**
 * Static content-integrity check for the runbook.
 *
 *   content/archive/index-*.html   (newest snapshot = the baseline)
 *   content/index.html             (the live file)
 *
 * Why this exists
 * ---------------
 * The runbook is thousands of lines of hand-authored content: 30 levers, 75 assessment questions,
 * dozens of tables and references, and many `id`s that are link targets from the sidebar,
 * the at-a-glance map, the lever-index table, the JS shared-topics list and the checklists.
 * A front-end refactor can silently drop any of it. Counting by eye does not scale, so this script
 * makes "no content regression" a machine-checked claim instead of an argument.
 *
 * The document-wide preservation floor deliberately uses regex over raw text so generated runtime
 * behavior cannot mask missing authored content. Issue #33's claim-local citation and assessment
 * contracts additionally parse the full HTML with the already-pinned parse5 dependency, because
 * visibility is inherited through ancestors and cannot be validated tag-by-tag. Runtime behavior
 * remains covered separately by `verify-runbook-dom.mjs`.
 *
 * Exit status: 0 = pass, 1 = regression, 2 = the check itself could not run.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newestSnapshot } from './lib/archive.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML_DIR = join(REPO_ROOT, 'content');
const LIVE = join(HTML_DIR, 'index.html');
// RUNBOOK_ARCHIVE_DIR lets a reviewer diff the live file against a snapshot kept OUTSIDE this repo
// (for example the pre-migration baseline). Default: the archive committed next to the content.
const ARCHIVE_DIR = process.env.RUNBOOK_ARCHIVE_DIR || join(HTML_DIR, 'archive');
if (process.env.RUNBOOK_ARCHIVE_DIR) {
  // Never silent: a different floor changes what "nothing was lost" means. CI refuses to set it.
  console.log(`\x1b[33m! baseline overridden by RUNBOOK_ARCHIVE_DIR=${process.env.RUNBOOK_ARCHIVE_DIR}\x1b[0m`);
}

/**
 * Anchors known to be dangling and handled deliberately in the product. Empty today, and that is a
 * finding worth recording: `#manage-the-model-lifecycle` is often assumed to be dangling because the
 * cost structure map labels it "Track 1 note ->" rather than linking a lever card. It is not dangling — it
 * is an `id` on the `.assess-q` div carrying Q4 of the Track 1 "Right-size the model to the task" lever.
 * `readLeverIndex()` in site/src/js/costmap.mjs distinguishes "resolves to a cross-reference note" from
 * "resolves to a full lever card" for the map's jump buttons, and `leverIdOwning()` in site/src/js/model.mjs
 * resolves it to the lever that owns it so the map's connector can draw to a row. Both resolve. Do not add
 * it here.
 */
const KNOWN_DANGLING_ANCHORS = new Set([]);

/**
 * External URLs deliberately REPLACED since the baseline, old → new.
 *
 * The URL set-difference cannot tell "a citation was dropped" from "a broken link was corrected", and
 * treats both as a regression. Adding a snapshot is the only other way to clear one, but the archive's
 * own rules reserve that for a milestone (`archive/README.md`), so correcting a link would have forced
 * either a bogus re-baseline or a skipped check. Declaring the pair here keeps the correction a
 * reviewable one-liner and keeps the floor where it is.
 *
 * The loss is only excused if the NEW url is actually present, so a typo in the replacement still
 * fails. Entries become stale at the next re-baseline and are reported when they do.
 *
 * The intended lifecycle of an entry: declare a correction, carry it until the next re-baseline, then
 * be told to remove it. An entry that outlives its snapshot is a bug in the housekeeping, not a
 * permanent exemption. The map has emptied itself that way more than once, for example at the
 * 2026-10-02 re-baseline, which retired the two Anthropic domain moves (docs.claude.com prompt caching
 * -> platform.claude.com; anthropic.com/learn -> academy.claude.com, both verified 23 Aug 2026).
 */
const KNOWN_REPLACED_URLS = new Map([
  // Empty since the 2026-10-16 re-baseline (archive/index-2026-10-16-track2-simplification-*.html), which
  // retired the [109] Uber URL correction (en-US scaling-ai-cost-efficiency -> au/en efficient-software-factory,
  // verified 8 Oct 2026) the moment the corrected URL became the baseline's.
]);

/**
 * IDs deliberately REPLACED (old -> new) or REMOVED since the baseline. Both sets emptied at the
 * 2026-10-02 re-baseline (archive/index-2026-10-02-track2-consolidation-*.html): the Figure 3b
 * `df-arrow*` ids, the retired `worked-example-agent-loop` table and the `gate-releases-on-token-per-task`
 * -> `know-what-you-spend` fold are all now absent from the baseline itself, so the verifier reported
 * every entry as stale. The 2026-10-02 archive README row records what each one excused.
 */
const KNOWN_REPLACED_IDS = new Map([]);
const KNOWN_REMOVED_IDS = new Set([]);

/**
 * Track 2 consolidation transitions (Model Inference nine -> five lifecycle levers; Agent Harness
 * twelve -> one unscored cost-model intro + five levers). The full old-key -> successor and old-name
 * -> successor maps lived here between the 2026-08-22 and 2026-10-02 baselines and were dropped once
 * the 2026-10-02 snapshot made the live structure the floor. Recover them from git history
 * (commit bb0f222) if a successor ever needs to be traced.
 */
const KNOWN_REPLACED_QUESTION_KEYS = new Map([]);
// Track 2 Agent Harness re-cut (16 Oct 2026): five topic levers -> seven component levers. Every question kept
// its data-key, so no key transition was ever needed; the five lever-NAME transitions (Keep context and state
// lean -> Memory, Curate the capability and runtime surface -> Tool design, Bound and simplify orchestration ->
// Orchestration, Contain consumption at every boundary -> Guardrails and limits, Trace and eliminate unrequested
// invocations -> Observability) lived here for one commit and were retired by the 2026-10-16 snapshot, which
// made the new names the floor. The archive README row for 2026-10-16 records the mapping.
const KNOWN_REPLACED_LEVER_NAMES = new Map([]);

// Exact baseline-to-live transitions for a reviewed consolidation. These are deliberately exact,
// not lower bounds: losing one more item or restoring an unexpected partial structure fails loudly.
// Empty since the 2026-10-03 re-baseline (archive/index-2026-10-03-track2-price-review-*.html). The
// 2026-10-02 -> 2026-10-03 set (tables 27 -> 25, worked cards 4 -> 3, shared tags 12 -> 10, two removed
// ids) is in git history at commit 1f2bd7c.
const KNOWN_COUNT_TRANSITIONS = new Map([]);

const bold = (s) => `[1m${s}[0m`;
const red = (s) => `[31m${s}[0m`;
const green = (s) => `[32m${s}[0m`;
const dim = (s) => `[2m${s}[0m`;

function bail(message, hint) {
  console.error(`\n${red('✖')} verify-runbook: ${message}`);
  if (hint) console.error(`  ${hint}`);
  console.error('');
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Extractors
// ---------------------------------------------------------------------------
// Each returns either a count (number) or a Set. Sets get compared by difference, which catches the
// case a count alone would miss: one item removed and a different one added.

const countOf = (re) => (html) => (html.match(re) || []).length;
const setOf = (re, group = 1) => (html) => {
  const out = new Set();
  for (const m of html.matchAll(re)) out.add(m[group]);
  return out;
};

/** Strip the generated <style> and <script> blocks so JS/CSS churn cannot mask a content change. */
function contentOnly(html) {
  return html
    .replace(/<style(\s[^>]*)?>[\s\S]*?<\/style>/gi, '<style></style>')
    .replace(/<script(\s[^>]*)?>[\s\S]*?<\/script>/gi, '<script></script>')
    .replace(/<!--[\s\S]*?-->/g, '');
}

const COUNT_CHECKS = [
  ['levers, checklists and principles (<h4 id=)', countOf(/^[ \t]*<h4 id=/gm)],
  ['assessment questions (.assess-q)', countOf(/class="assess-q"/g)],
  ['assessment blocks (.assess)', countOf(/class="assess"/g)],
  ['per-layer summary panels (.assess-report)', countOf(/class="assess-report"/g)],
  ['worked cost cards (.worked-card)', countOf(/class="worked-card"/g)],
  ['data tables (<table>)', countOf(/<table>/g)],
  ['citation links (href="#ref-N")', countOf(/href="#ref-\d+"/g)],
  ['figures (<figure>)', countOf(/<figure/g)],
  ['shared tags (.tag.shared)', countOf(/class="tag shared"/g)]
];

const SET_CHECKS = [
  ['reference entries (id="ref-N")', setOf(/id="(ref-\d+)"/g)],
  ['element ids (link targets)', setOf(/\sid="([^"]+)"/g), KNOWN_REPLACED_IDS, KNOWN_REMOVED_IDS],
  ['external URLs', setOf(/(https?:\/\/[^"'\s<>)]+)/g), KNOWN_REPLACED_URLS],
  ['assessment scopes (data-ar-scope)', setOf(/data-ar-scope="([^"]+)"/g)],
  ['assessment groups (data-assess-group)', setOf(/data-assess-group="([^"]+)"/g)],
  ['question keys (data-key)', setOf(/data-key="([^"]+)"/g), KNOWN_REPLACED_QUESTION_KEYS],
  ['lever names (data-lever)', setOf(/data-lever="([^"]+)"/g), KNOWN_REPLACED_LEVER_NAMES]
];

// ---------------------------------------------------------------------------
// Load the baseline and the live file
// ---------------------------------------------------------------------------

let baselineName;
try {
  baselineName = newestSnapshot(ARCHIVE_DIR);
} catch (e) {
  bail(`cannot read ${ARCHIVE_DIR}: ${e.message}`, 'The archive is the baseline; without it there is nothing to compare against.');
}
if (!baselineName) {
  bail(`no index-*.html snapshot in ${ARCHIVE_DIR}`, 'See archive/README.md — a snapshot is required as the content baseline.');
}

let baselineRaw, liveRaw;
try {
  baselineRaw = readFileSync(join(ARCHIVE_DIR, baselineName), 'utf8');
} catch (e) {
  bail(`cannot read the baseline snapshot: ${e.message}`);
}
try {
  liveRaw = readFileSync(LIVE, 'utf8');
} catch (e) {
  bail(`cannot read ${LIVE}: ${e.message}`);
}
const ISSUE33_VERIFY_TEST_MODE = process.env.ISSUE33_VERIFY_TEST_MODE || '';
if (ISSUE33_VERIFY_TEST_MODE === 'missing-required-citation') {
  const candidate = liveRaw.replace(/href="#ref-98"/g, 'href="#ref-98-missing"');
  if (candidate === liveRaw) bail('top-level test fixture could not remove required ref-98 citations');
  liveRaw = candidate;
}

const baseline = contentOnly(baselineRaw);
const live = contentOnly(liveRaw);

console.log(`\n${bold('verify-runbook')} — content integrity`);
console.log(`  baseline  ${dim(`archive/${baselineName}`)}`);
console.log(`  live      ${dim('index.html')}\n`);

const failures = [];

// ---------------------------------------------------------------------------
// Issue #32: Track 1 licence-tier guidance contract
// ---------------------------------------------------------------------------
// This repair is intentionally narrow. A broad count or URL-presence check would stay green if the
// old Kiro pricing answer returned inside seat-q2, or if the Team and Enterprise billing models were
// blended again. Bind the assertions to the one lever and keep its assessment identity byte-stable.
console.log(bold('  Track 1 licence-tier guidance'));
const issue32Check = (ok, label, detail = '') => {
  if (ok) console.log(`  ${green('✓')} ${label.padEnd(46)} ${detail}`);
  else {
    failures.push(`Track 1 licence-tier guidance: ${label}${detail ? ` (${detail})` : ''}`);
    console.log(`  ${red('✖')} ${label.padEnd(46)} ${red(detail || 'failed')}`);
  }
};

const subscriptionStart = live.indexOf('<h4 id="right-size-the-subscription-plan"');
const subscriptionEnd = subscriptionStart < 0 ? -1 : live.indexOf('\n      <h4 id=', subscriptionStart + 1);
const subscriptionLever = subscriptionStart >= 0 && subscriptionEnd > subscriptionStart
  ? live.slice(subscriptionStart, subscriptionEnd)
  : '';
const issue32QuestionKeys = [...subscriptionLever.matchAll(/data-key="([^"]+)"/g)].map((m) => m[1]);
const issue32QuestionText = (
  subscriptionLever.match(/data-key="seat-q2"[\s\S]*?<div class="assess-qtext"><span class="qid">Q2<\/span>([^<]+)<\/div>/)
  || []
)[1]?.trim() || '';
const issue32EnterpriseStart = subscriptionLever.indexOf(
  '<p>Do not apply this Team seat-tier rule to a usage-based Enterprise plan.'
);
const issue32TeamGuidance = issue32EnterpriseStart >= 0
  ? subscriptionLever.slice(0, issue32EnterpriseStart)
  : subscriptionLever;
const issue32Text = subscriptionLever.toLowerCase().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const issue32RefIds = [...live.matchAll(/id="(ref-\d+)"/g)].map((m) => m[1]);
const issue32DuplicateRefs = [...new Set(issue32RefIds.filter(
  (id, index) => issue32RefIds.indexOf(id) !== index
))];

issue32Check(
  (live.match(/id="right-size-the-subscription-plan"/g) || []).length === 1,
  'one subscription-plan lever id',
  `${(live.match(/id="right-size-the-subscription-plan"/g) || []).length} found`
);
issue32Check(
  subscriptionLever.length > 0,
  'subscription-plan lever is extractable',
  `${subscriptionLever.length} bytes`
);
issue32Check(
  issue32QuestionKeys.join(',') === 'seat-q1,seat-q2',
  'assessment keys and order are unchanged',
  issue32QuestionKeys.join(',') || 'none'
);
issue32Check(
  (subscriptionLever.match(/data-assess-q\b/g) || []).length === 2,
  'lever still has exactly two questions',
  `${(subscriptionLever.match(/data-assess-q\b/g) || []).length} found`
);
issue32Check(
  (live.match(/class="assess-q"/g) || []).length === 69,
  'document question count matches the consolidated structure',
  `${(live.match(/class="assess-q"/g) || []).length} found`
);
issue32Check(
  (subscriptionLever.match(/data-v="(?:yes|wip|no|na)"/g) || []).length === 8,
  'both four-status button sets remain',
  `${(subscriptionLever.match(/data-v="(?:yes|wip|no|na)"/g) || []).length} buttons`
);
issue32Check(
  issue32QuestionText === 'Have you reserved Premium seats for members whose observed usage needs the higher limits, while keeping other members on Standard seats?',
  'seat-q2 asks only the licence-tier decision',
  issue32QuestionText || 'missing'
);
issue32Check(
  !/model default/i.test(issue32QuestionText) && !/model default/i.test(issue32TeamGuidance),
  'Team guidance has no model-default clause',
  'question and Team paragraphs checked'
);
issue32Check(
  !/\bKiro\b|\$\s?\d|several(?:-|\s)fold|several times|every inactive seat removed saves a whole seat/i.test(subscriptionLever),
  'legacy pricing and unsupported savings are absent',
  'Kiro, copied prices, multipliers, immediate-seat claim'
);
for (const phrase of [
  'standard seats include claude code and base usage limits',
  'premium seats add higher usage limits',
  'active members and assigned seats',
  'per-user, per-model spend export',
  'standard-to-premium upgrade can take effect immediately and be prorated',
  'premium-to-standard change takes effect at renewal',
  'removing a member frees that seat for reassignment',
  "reducing the bill requires reducing the plan's total seat allocation"
]) {
  issue32Check(issue32Text.includes(phrase), `required Team claim: ${phrase}`, issue32Text.includes(phrase) ? 'present' : 'missing');
}
issue32Check(
  /<p>Do not apply this Team seat-tier rule to a usage-based Enterprise plan\.[\s\S]*?shared consumption pool[\s\S]*?model defaults[\s\S]*?href="#ref-97"[\s\S]*?<\/p>/.test(subscriptionLever),
  'Enterprise caveat is separate and cited',
  'ref-97'
);
for (const [url, ref] of [
  ['https://support.claude.com/en/articles/12004354-purchase-and-manage-seats-on-team-plans', 'ref-89'],
  ['https://support.claude.com/en/articles/12883420-view-usage-analytics-for-team-and-enterprise-plans', 'ref-96'],
  ['https://support.claude.com/en/articles/14782391-claude-enterprise-consumption-guide', 'ref-97']
]) {
  issue32Check(
    subscriptionLever.includes(url) && subscriptionLever.includes(`href="#${ref}"`),
    `first-party citation ${ref}`,
    url
  );
}
issue32Check(
  issue32DuplicateRefs.length === 0,
  'reference ids are globally unique',
  issue32DuplicateRefs.join(', ') || `${issue32RefIds.length} unique entries`
);
issue32Check(
  !live.includes('A several-fold difference in seat cost from tier alignment'),
  'summary table drops the unsupported multiplier',
  'top-levers row checked'
);

// ---------------------------------------------------------------------------
// Issue #33: Codex controls, planning completion, and telemetry boundaries
// ---------------------------------------------------------------------------
console.log(bold('  Track 1 Codex cost controls'));
const issue33Check = (ok, label, detail = '') => {
  if (ok) console.log(`  ${green('✓')} ${label.padEnd(46)} ${detail}`);
  else {
    failures.push(`Track 1 Codex cost controls: ${label}${detail ? ` (${detail})` : ''}`);
    console.log(`  ${red('✖')} ${label.padEnd(46)} ${red(detail || 'failed')}`);
  }
};

const { parse: parseHtml } = await import('parse5');

// The document-wide preservation gates below intentionally remain raw-source checks. Issue #33's
// claim-local evidence and assessment-owner contracts need browser-like ancestry and computed
// stylesheet visibility, so this subsystem parses the complete authored HTML, extracts every style
// rule (including rules nested in conditional at-rules), and propagates hidden state through ancestors.
const issue33Element = (node) => Boolean(node?.tagName);
const issue33AttrValues = (node, name) => (node?.attrs || [])
  .filter((attr) => attr.name.toLowerCase() === name.toLowerCase())
  .map((attr) => attr.value);
const issue33HasAttr = (node, name) => (node?.attrs || [])
  .some((attr) => attr.name.toLowerCase() === name.toLowerCase());
const issue33ClassList = (node) => (issue33AttrValues(node, 'class')[0] || '')
  .split(/\s+/).filter(Boolean);

const ISSUE33_MATCH_FALSE = 0;
const ISSUE33_MATCH_TRUE = 1;
const ISSUE33_MATCH_UNKNOWN = 2;
const issue33MatchAnd = (left, right) => {
  if (left === ISSUE33_MATCH_FALSE || right === ISSUE33_MATCH_FALSE) return ISSUE33_MATCH_FALSE;
  if (left === ISSUE33_MATCH_UNKNOWN || right === ISSUE33_MATCH_UNKNOWN) return ISSUE33_MATCH_UNKNOWN;
  return ISSUE33_MATCH_TRUE;
};

const issue33IsCssWhitespace = (char) => /[\t\n\f\r ]/.test(char || '');
const issue33ConsumeCssEscape = (text, slashIndex) => {
  if (text[slashIndex] !== '\\') return { valid: false, value: '', next: slashIndex + 1 };
  if (slashIndex + 1 >= text.length) {
    return { valid: false, value: '\uFFFD', next: text.length };
  }
  const first = text[slashIndex + 1];
  if (first === '\r' || first === '\n' || first === '\f') {
    const next = first === '\r' && text[slashIndex + 2] === '\n'
      ? slashIndex + 3 : slashIndex + 2;
    return { valid: true, lineContinuation: true, value: '', next };
  }
  const hex = text.slice(slashIndex + 1).match(/^[0-9a-fA-F]{1,6}/)?.[0] || '';
  if (hex) {
    let next = slashIndex + 1 + hex.length;
    if (issue33IsCssWhitespace(text[next])) {
      next += text[next] === '\r' && text[next + 1] === '\n' ? 2 : 1;
    }
    let codePoint = Number.parseInt(hex, 16);
    if (codePoint === 0 || codePoint > 0x10FFFF
      || (codePoint >= 0xD800 && codePoint <= 0xDFFF)) codePoint = 0xFFFD;
    return { valid: true, lineContinuation: false, value: String.fromCodePoint(codePoint), next };
  }
  return {
    valid: true,
    lineContinuation: false,
    value: first === '\u0000' ? '\uFFFD' : first,
    next: slashIndex + 2
  };
};
const issue33DecodeCssEscapes = (text) => {
  let value = '';
  let complete = true;
  for (let index = 0; index < text.length;) {
    if (text[index] !== '\\') {
      value += text[index] === '\u0000' ? '\uFFFD' : text[index];
      index += 1;
      continue;
    }
    const escape = issue33ConsumeCssEscape(text, index);
    value += escape.value;
    complete &&= escape.valid;
    index = Math.max(escape.next, index + 1);
  }
  return { value, complete };
};
const issue33ReadCssIdentifier = (text, start) => {
  const nameStart = (char) => /[-_a-zA-Z]/.test(char || '')
    || (char && char.codePointAt(0) >= 0x80) || char === '\\';
  const nameChar = (char) => nameStart(char) || /[0-9]/.test(char || '');
  if (!nameStart(text[start])) return null;
  let value = '';
  let cursor = start;
  let complete = true;
  while (cursor < text.length) {
    if (text[cursor] === '\\') {
      const escape = issue33ConsumeCssEscape(text, cursor);
      value += escape.value;
      // A backslash-newline is valid in a CSS string, but cannot form part of an identifier.
      complete &&= escape.valid && !escape.lineContinuation;
      cursor = Math.max(escape.next, cursor + 1);
    } else if (nameChar(text[cursor])) {
      value += text[cursor];
      cursor += 1;
    } else break;
  }
  return { value, next: cursor, complete };
};
const issue33StripCssComments = (css) => {
  let output = '';
  let quote = '';
  for (let index = 0; index < css.length; index += 1) {
    const char = css[index];
    if (quote) {
      if (char === '\\') {
        const escape = issue33ConsumeCssEscape(css, index);
        output += css.slice(index, Math.max(escape.next, index + 1));
        index = Math.max(escape.next - 1, index);
      } else {
        output += char;
        if (char === quote) quote = '';
      }
      continue;
    }
    if (char === '\\') {
      const escape = issue33ConsumeCssEscape(css, index);
      output += css.slice(index, Math.max(escape.next, index + 1));
      index = Math.max(escape.next - 1, index);
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      output += char;
      continue;
    }
    if (char === '/' && css[index + 1] === '*') {
      output += '  ';
      index += 2;
      while (index < css.length && !(css[index] === '*' && css[index + 1] === '/')) {
        output += css[index] === '\n' ? '\n' : ' ';
        index += 1;
      }
      output += index < css.length ? '  ' : '';
      index += index < css.length ? 1 : 0;
      continue;
    }
    output += char;
  }
  return output;
};
const issue33CssFindTopLevel = (text, start, wanted) => {
  let quote = '';
  let round = 0;
  let square = 0;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === '\\') {
        const escape = issue33ConsumeCssEscape(text, index);
        index = Math.max(escape.next - 1, index);
      } else if (char === quote) quote = '';
      continue;
    }
    if (char === '\\') {
      const escape = issue33ConsumeCssEscape(text, index);
      index = Math.max(escape.next - 1, index);
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === '(') round += 1;
    else if (char === ')') round = Math.max(0, round - 1);
    else if (char === '[') square += 1;
    else if (char === ']') square = Math.max(0, square - 1);
    else if (round === 0 && square === 0 && wanted.has(char)) return index;
  }
  return -1;
};
const issue33CssFindClose = (text, openIndex, openChar, closeChar) => {
  let quote = '';
  let depth = 1;
  for (let index = openIndex + 1; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === '\\') {
        const escape = issue33ConsumeCssEscape(text, index);
        index = Math.max(escape.next - 1, index);
      } else if (char === quote) quote = '';
      continue;
    }
    if (char === '\\') {
      const escape = issue33ConsumeCssEscape(text, index);
      index = Math.max(escape.next - 1, index);
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === openChar) depth += 1;
    else if (char === closeChar && --depth === 0) return index;
  }
  return -1;
};
const issue33CssSplitTopLevel = (text, delimiter) => {
  const parts = [];
  let start = 0;
  let quote = '';
  let round = 0;
  let square = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === '\\') {
        const escape = issue33ConsumeCssEscape(text, index);
        index = Math.max(escape.next - 1, index);
      } else if (char === quote) quote = '';
      continue;
    }
    if (char === '\\') {
      const escape = issue33ConsumeCssEscape(text, index);
      index = Math.max(escape.next - 1, index);
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === '(') round += 1;
    else if (char === ')') round = Math.max(0, round - 1);
    else if (char === '[') square += 1;
    else if (char === ']') square = Math.max(0, square - 1);
    else if (char === delimiter && round === 0 && square === 0) {
      parts.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts.filter(Boolean);
};
const issue33CssDeclarations = (body) => {
  const winners = new Map();
  const unresolvedProperties = [];
  for (const declaration of issue33CssSplitTopLevel(body, ';')) {
    const colon = issue33CssFindTopLevel(declaration, 0, new Set([':']));
    if (colon < 0) continue;
    const rawProperty = declaration.slice(0, colon).trim();
    const decodedProperty = issue33DecodeCssEscapes(rawProperty);
    if (!decodedProperty.complete) {
      unresolvedProperties.push(rawProperty);
      continue;
    }
    const property = decodedProperty.value.trim().toLowerCase();
    const decodedValue = issue33DecodeCssEscapes(declaration.slice(colon + 1).trim());
    const decodedRawValue = decodedValue.value.trim().toLowerCase();
    const important = /!\s*important\s*$/i.test(decodedRawValue);
    const value = decodedRawValue.replace(/!\s*important\s*$/i, '').trim();
    const unresolvedSubstitution = !decodedValue.complete
      || /(?:^|[^-_a-z0-9])(?:var|env|attr)\s*\(/i.test(value)
      || /[-_a-z][-_a-z0-9]*\s*\(/i.test(value);
    const prior = winners.get(property);
    if (!prior || important || !prior.important) {
      winners.set(property, { value, important, unresolvedSubstitution });
    }
  }
  return { winners, unresolvedProperties };
};
const issue33HiddenDeclaration = (body) => {
  const { winners, unresolvedProperties } = issue33CssDeclarations(body);
  const display = winners.get('display');
  const visibility = winners.get('visibility');
  if (display?.value === 'none') {
    return { property: 'display', value: 'none', important: display.important, uncertain: false };
  }
  if (display?.unresolvedSubstitution) {
    return { property: 'display', value: display.value, important: display.important, uncertain: true };
  }
  if (visibility && ['hidden', 'collapse'].includes(visibility.value)) {
    return { property: 'visibility', value: visibility.value, important: visibility.important, uncertain: false };
  }
  if (visibility?.unresolvedSubstitution) {
    return { property: 'visibility', value: visibility.value, important: visibility.important, uncertain: true };
  }
  // An incomplete escaped property name could decode to display or visibility. It must not
  // disappear as a known non-match, because required evidence is verified fail-closed.
  if (unresolvedProperties.length) {
    return { property: 'unresolved', value: unresolvedProperties.join(', '), important: false, uncertain: true };
  }
  return null;
};
const issue33ParseStylesheet = (cssRaw) => {
  const css = issue33StripCssComments(cssRaw);
  const rules = [];
  const errors = [];
  const nestedRuleAtRules = new Set(['media', 'supports', 'layer', 'container', 'scope', 'document', 'starting-style']);
  const declarationAtRules = new Set(['font-face', 'page', 'counter-style', 'property', 'font-feature-values']);
  const parseRuleList = (text, context = []) => {
    let cursor = 0;
    while (cursor < text.length) {
      while (/\s/.test(text[cursor] || '')) cursor += 1;
      if (cursor >= text.length) break;
      const delimiter = issue33CssFindTopLevel(text, cursor, new Set(['{', ';']));
      if (delimiter < 0) {
        if (text.slice(cursor).trim()) errors.push(`unterminated rule near byte ${cursor}`);
        break;
      }
      const prelude = text.slice(cursor, delimiter).trim();
      if (text[delimiter] === ';') {
        cursor = delimiter + 1;
        continue;
      }
      const close = issue33CssFindClose(text, delimiter, '{', '}');
      if (close < 0) {
        errors.push(`unclosed block near byte ${delimiter}`);
        break;
      }
      const body = text.slice(delimiter + 1, close);
      if (!prelude) {
        errors.push(`empty selector near byte ${delimiter}`);
      } else if (prelude.startsWith('@')) {
        const atName = (prelude.match(/^@([\w-]+)/) || [])[1]?.toLowerCase() || '';
        if (nestedRuleAtRules.has(atName)) parseRuleList(body, [...context, prelude]);
        else if (!declarationAtRules.has(atName) && !/keyframes$/i.test(atName)
          && issue33CssFindTopLevel(body, 0, new Set(['{'])) >= 0) {
          // Unknown grouping at-rules can contain selectors. Recurse conservatively rather than
          // silently losing a potentially active hiding rule.
          parseRuleList(body, [...context, prelude]);
        }
      } else {
        const nestedStyleRule = issue33CssFindTopLevel(body, 0, new Set(['{']));
        if (nestedStyleRule >= 0) {
          errors.push(`unsupported nested style rule near byte ${delimiter + 1 + nestedStyleRule}`);
        } else {
          const hidden = issue33HiddenDeclaration(body);
          if (hidden) {
            const selectors = issue33CssSplitTopLevel(prelude, ',');
            if (!selectors.length) errors.push(`hiding rule has no selector near byte ${delimiter}`);
            for (const selector of selectors) rules.push({ selector, hidden, context });
          }
        }
      }
      cursor = close + 1;
    }
  };
  parseRuleList(css);
  return { rules, errors };
};

const issue33ElementParent = (parent, node) => {
  let candidate = parent.get(node);
  while (candidate && !issue33Element(candidate)) candidate = parent.get(candidate);
  return candidate || null;
};
const issue33MatchAttribute = (node, selectorBody) => {
  const text = selectorBody.trim();
  let cursor = 0;
  const skipWhitespace = () => {
    while (issue33IsCssWhitespace(text[cursor])) cursor += 1;
  };
  const nameToken = issue33ReadCssIdentifier(text, cursor);
  if (!nameToken || !nameToken.complete) return ISSUE33_MATCH_UNKNOWN;
  cursor = nameToken.next;
  skipWhitespace();
  const values = issue33AttrValues(node, nameToken.value.toLowerCase());
  if (cursor >= text.length) return values.length ? ISSUE33_MATCH_TRUE : ISSUE33_MATCH_FALSE;

  const operators = ['~=', '|=', '^=', '$=', '*=', '='];
  const operator = operators.find((candidate) => text.startsWith(candidate, cursor));
  if (!operator) return ISSUE33_MATCH_UNKNOWN;
  cursor += operator.length;
  skipWhitespace();

  let rawExpected = '';
  if (text[cursor] === '"' || text[cursor] === "'") {
    const quote = text[cursor++];
    let closed = false;
    while (cursor < text.length) {
      if (text[cursor] === quote) {
        cursor += 1;
        closed = true;
        break;
      }
      if (text[cursor] === '\\') {
        const escape = issue33ConsumeCssEscape(text, cursor);
        rawExpected += text.slice(cursor, Math.max(escape.next, cursor + 1));
        cursor = Math.max(escape.next, cursor + 1);
      } else rawExpected += text[cursor++];
    }
    if (!closed) return ISSUE33_MATCH_UNKNOWN;
  } else {
    while (cursor < text.length && !issue33IsCssWhitespace(text[cursor])) {
      if (text[cursor] === '\\') {
        const escape = issue33ConsumeCssEscape(text, cursor);
        rawExpected += text.slice(cursor, Math.max(escape.next, cursor + 1));
        cursor = Math.max(escape.next, cursor + 1);
      } else rawExpected += text[cursor++];
    }
    if (!rawExpected) return ISSUE33_MATCH_UNKNOWN;
  }

  const decodedExpected = issue33DecodeCssEscapes(rawExpected);
  if (!decodedExpected.complete) return ISSUE33_MATCH_UNKNOWN;
  skipWhitespace();
  let flag = '';
  if (cursor < text.length) {
    const flagToken = issue33ReadCssIdentifier(text, cursor);
    if (!flagToken || !flagToken.complete) return ISSUE33_MATCH_UNKNOWN;
    flag = flagToken.value.toLowerCase();
    cursor = flagToken.next;
    skipWhitespace();
    if (!['i', 's'].includes(flag)) return ISSUE33_MATCH_UNKNOWN;
  }
  if (cursor !== text.length) return ISSUE33_MATCH_UNKNOWN;

  let expected = decodedExpected.value;
  let actualValues = values;
  if (flag === 'i') {
    expected = expected.toLowerCase();
    actualValues = values.map((value) => value.toLowerCase());
  }
  const matches = (value) => {
    if (operator === '=') return value === expected;
    if (expected === '' && ['~=', '^=', '$=', '*='].includes(operator)) return false;
    if (operator === '~=') return value.split(/\s+/).includes(expected);
    if (operator === '|=') return value === expected || value.startsWith(`${expected}-`);
    if (operator === '^=') return value.startsWith(expected);
    if (operator === '$=') return value.endsWith(expected);
    if (operator === '*=') return value.includes(expected);
    return false;
  };
  return actualValues.some(matches) ? ISSUE33_MATCH_TRUE : ISSUE33_MATCH_FALSE;
};
const issue33StructuralPseudo = (node, name, parent) => {
  const elementParent = issue33ElementParent(parent, node);
  const siblings = (elementParent?.childNodes || []).filter(issue33Element);
  const sameType = siblings.filter((sibling) => sibling.tagName === node.tagName);
  if (name === 'root') return node.tagName === 'html' ? ISSUE33_MATCH_TRUE : ISSUE33_MATCH_FALSE;
  if (name === 'empty') {
    const hasContent = (node.childNodes || []).some((child) =>
      issue33Element(child) || (child.nodeName === '#text' && (child.value || '').length > 0)
    );
    return hasContent ? ISSUE33_MATCH_FALSE : ISSUE33_MATCH_TRUE;
  }
  if (name === 'first-child') return siblings[0] === node ? ISSUE33_MATCH_TRUE : ISSUE33_MATCH_FALSE;
  if (name === 'last-child') return siblings.at(-1) === node ? ISSUE33_MATCH_TRUE : ISSUE33_MATCH_FALSE;
  if (name === 'only-child') return siblings.length === 1 ? ISSUE33_MATCH_TRUE : ISSUE33_MATCH_FALSE;
  if (name === 'first-of-type') return sameType[0] === node ? ISSUE33_MATCH_TRUE : ISSUE33_MATCH_FALSE;
  if (name === 'last-of-type') return sameType.at(-1) === node ? ISSUE33_MATCH_TRUE : ISSUE33_MATCH_FALSE;
  if (name === 'only-of-type') return sameType.length === 1 ? ISSUE33_MATCH_TRUE : ISSUE33_MATCH_FALSE;
  return ISSUE33_MATCH_UNKNOWN;
};
const issue33MatchCompound = (node, compound, parent) => {
  if (!issue33Element(node)) return ISSUE33_MATCH_FALSE;
  let cursor = 0;
  let result = ISSUE33_MATCH_TRUE;
  const readIdentifier = () => {
    const token = issue33ReadCssIdentifier(compound, cursor);
    if (!token) return null;
    cursor = token.next;
    return token;
  };
  if (compound[cursor] === '*') cursor += 1;
  else if (/[-_a-zA-Z\\]/.test(compound[cursor] || '')
    || (compound[cursor] && compound[cursor].codePointAt(0) >= 0x80)) {
    const tag = readIdentifier();
    if (!tag || !tag.complete) result = ISSUE33_MATCH_UNKNOWN;
    else if (node.tagName.toLowerCase() !== tag.value.toLowerCase()) return ISSUE33_MATCH_FALSE;
  }
  while (cursor < compound.length) {
    const token = compound[cursor];
    if (token === '.') {
      cursor += 1;
      const className = readIdentifier();
      if (!className || !className.complete) result = ISSUE33_MATCH_UNKNOWN;
      else if (!issue33ClassList(node).includes(className.value)) return ISSUE33_MATCH_FALSE;
    } else if (token === '#') {
      cursor += 1;
      const id = readIdentifier();
      if (!id || !id.complete) result = ISSUE33_MATCH_UNKNOWN;
      else if (!issue33AttrValues(node, 'id').includes(id.value)) return ISSUE33_MATCH_FALSE;
    } else if (token === '[') {
      const close = issue33CssFindClose(compound, cursor, '[', ']');
      if (close < 0) return ISSUE33_MATCH_UNKNOWN;
      result = issue33MatchAnd(result, issue33MatchAttribute(node, compound.slice(cursor + 1, close)));
      if (result === ISSUE33_MATCH_FALSE) return result;
      cursor = close + 1;
    } else if (token === ':') {
      const doubleColon = compound[cursor + 1] === ':';
      cursor += doubleColon ? 2 : 1;
      const nameToken = readIdentifier();
      if (!nameToken || !nameToken.complete) {
        result = ISSUE33_MATCH_UNKNOWN;
        if (!nameToken) cursor += 1;
        continue;
      }
      const name = nameToken.value.toLowerCase();
      const legacyPseudoElement = ['before', 'after', 'first-letter', 'first-line'].includes(name)
        || name.startsWith('-webkit-');
      if (doubleColon || legacyPseudoElement) return ISSUE33_MATCH_FALSE;
      let argument = null;
      if (compound[cursor] === '(') {
        const close = issue33CssFindClose(compound, cursor, '(', ')');
        if (close < 0) return ISSUE33_MATCH_UNKNOWN;
        argument = compound.slice(cursor + 1, close);
        cursor = close + 1;
      }
      if (['not', 'is', 'where'].includes(name) && argument !== null) {
        const matches = issue33CssSplitTopLevel(argument, ',')
          .map((part) => issue33MatchSelector(node, part, parent));
        if (name === 'not') {
          if (matches.some((value) => value === ISSUE33_MATCH_TRUE)) return ISSUE33_MATCH_FALSE;
          if (matches.some((value) => value === ISSUE33_MATCH_UNKNOWN)) result = ISSUE33_MATCH_UNKNOWN;
        } else if (matches.some((value) => value === ISSUE33_MATCH_TRUE)) {
          // A true selector-list branch is sufficient.
        } else if (matches.some((value) => value === ISSUE33_MATCH_UNKNOWN)) result = ISSUE33_MATCH_UNKNOWN;
        else return ISSUE33_MATCH_FALSE;
      } else if (argument !== null) {
        result = ISSUE33_MATCH_UNKNOWN;
      } else {
        result = issue33MatchAnd(result, issue33StructuralPseudo(node, name, parent));
      }
    } else {
      // Namespaces, nesting and syntax outside the supported conservative subset remain
      // potentially matching unless a complete decoded selector component disproved them.
      result = ISSUE33_MATCH_UNKNOWN;
      if (token === '\\') {
        const escape = issue33ConsumeCssEscape(compound, cursor);
        cursor = Math.max(escape.next, cursor + 1);
      } else cursor += 1;
    }
  }
  return result;
};
const issue33SelectorSequence = (selector) => {
  const compounds = [];
  const combinators = [];
  let buffer = '';
  let quote = '';
  let round = 0;
  let square = 0;
  let pending = '';
  let unsupported = false;
  const flush = () => {
    const value = buffer.trim();
    if (!value) return;
    if (compounds.length) combinators.push(pending || 'descendant');
    compounds.push(value);
    buffer = '';
    pending = '';
  };
  for (let index = 0; index < selector.length; index += 1) {
    const char = selector[index];
    if (quote) {
      if (char === '\\') {
        const escape = issue33ConsumeCssEscape(selector, index);
        buffer += selector.slice(index, Math.max(escape.next, index + 1));
        unsupported ||= !escape.valid;
        index = Math.max(escape.next - 1, index);
      } else {
        buffer += char;
        if (char === quote) quote = '';
      }
      continue;
    }
    if (char === '\\') {
      const escape = issue33ConsumeCssEscape(selector, index);
      buffer += selector.slice(index, Math.max(escape.next, index + 1));
      unsupported ||= !escape.valid;
      index = Math.max(escape.next - 1, index);
    } else if (char === '"' || char === "'") {
      quote = char;
      buffer += char;
    } else if (char === '(') {
      round += 1;
      buffer += char;
    } else if (char === ')') {
      round = Math.max(0, round - 1);
      buffer += char;
    } else if (char === '[') {
      square += 1;
      buffer += char;
    } else if (char === ']') {
      square = Math.max(0, square - 1);
      buffer += char;
    } else if (round === 0 && square === 0 && char === '>') {
      flush();
      pending = 'child';
    } else if (round === 0 && square === 0 && (char === '+' || char === '~')) {
      unsupported = true;
      flush();
      pending = 'unsupported';
    } else if (round === 0 && square === 0 && /\s/.test(char)) {
      flush();
      if (compounds.length && !pending) pending = 'descendant';
    } else buffer += char;
  }
  flush();
  if (!compounds.length || combinators.length !== compounds.length - 1 || combinators.includes('unsupported')) {
    unsupported = true;
  }
  return { compounds, combinators, unsupported };
};
const issue33MatchSelector = (node, selector, parent) => {
  const sequence = issue33SelectorSequence(selector.trim());
  if (!sequence.compounds.length) return ISSUE33_MATCH_UNKNOWN;
  if (sequence.unsupported) {
    const rightmost = sequence.compounds.at(-1);
    const constrained = issue33MatchCompound(node, rightmost, parent);
    return constrained === ISSUE33_MATCH_FALSE ? ISSUE33_MATCH_FALSE : ISSUE33_MATCH_UNKNOWN;
  }
  const matchAt = (candidate, index) => {
    if (!candidate) return ISSUE33_MATCH_FALSE;
    const own = issue33MatchCompound(candidate, sequence.compounds[index], parent);
    if (own === ISSUE33_MATCH_FALSE || index === 0) return own;
    const combinator = sequence.combinators[index - 1];
    if (combinator === 'child') {
      return issue33MatchAnd(own, matchAt(issue33ElementParent(parent, candidate), index - 1));
    }
    let ancestor = issue33ElementParent(parent, candidate);
    let uncertain = own === ISSUE33_MATCH_UNKNOWN;
    while (ancestor) {
      const matched = matchAt(ancestor, index - 1);
      if (matched === ISSUE33_MATCH_TRUE) return own;
      if (matched === ISSUE33_MATCH_UNKNOWN) uncertain = true;
      ancestor = issue33ElementParent(parent, ancestor);
    }
    return uncertain ? ISSUE33_MATCH_UNKNOWN : ISSUE33_MATCH_FALSE;
  };
  return matchAt(node, sequence.compounds.length - 1);
};
const issue33StylesheetHidden = (node, stylesheet, parent) => {
  if (!issue33Element(node)) return { hidden: false, uncertain: false, selectors: [] };
  const selectors = [];
  let uncertain = false;
  for (const rule of stylesheet.rules) {
    const matched = issue33MatchSelector(node, rule.selector, parent);
    if (matched !== ISSUE33_MATCH_FALSE) {
      selectors.push(rule.selector);
      uncertain ||= matched === ISSUE33_MATCH_UNKNOWN;
    }
  }
  return { hidden: selectors.length > 0, uncertain, selectors };
};
const issue33OwnHidden = (node) => {
  if (!issue33Element(node)) return false;
  const hiddenByStyle = Boolean(issue33HiddenDeclaration(issue33AttrValues(node, 'style')[0] || ''));
  return issue33HasAttr(node, 'hidden')
    || issue33AttrValues(node, 'aria-hidden').some((value) => value.toLowerCase() === 'true')
    || hiddenByStyle
    || (node.tagName === 'input'
      && issue33AttrValues(node, 'type').some((value) => value.toLowerCase() === 'hidden'));
};
const issue33IsQuestion = (node) => issue33Element(node)
  && node.tagName === 'div'
  && issue33ClassList(node).includes('assess-q')
  && issue33HasAttr(node, 'data-assess-q');
const issue33RawDivBalanced = (source) => {
  let depth = 0;
  for (const match of contentOnly(source).matchAll(/<\/?div\b[^>]*>/gi)) {
    depth += /^<\/div/i.test(match[0]) ? -1 : 1;
    if (depth < 0) return false;
  }
  return depth === 0;
};
const issue33FormatParseErrors = (errors) => errors.map((error) => {
  const line = error.startLine ?? error.endLine ?? '?';
  const column = error.startCol ?? error.endCol ?? '?';
  return `${error.code}@${line}:${column}`;
}).join(', ');
const issue33Parse = (source) => {
  const parseErrors = [];
  const document = parseHtml(source, {
    sourceCodeLocationInfo: true,
    onParseError: (error) => parseErrors.push(error)
  });
  const visible = new WeakMap();
  const parent = new WeakMap();
  const elements = [];
  const styleTexts = [];
  const collect = (node, insideTemplate = false) => {
    if (issue33Element(node)) {
      elements.push(node);
      if (!insideTemplate && node.tagName === 'style') {
        styleTexts.push((node.childNodes || [])
          .filter((child) => child.nodeName === '#text')
          .map((child) => child.value || '').join(''));
      }
    }
    for (const child of node.childNodes || []) {
      parent.set(child, node);
      collect(child, insideTemplate);
    }
    if (node.content) {
      parent.set(node.content, node);
      collect(node.content, true);
    }
  };
  collect(document);
  const stylesheet = issue33ParseStylesheet(styleTexts.join('\n'));
  const stylesheetState = new WeakMap();
  const visitVisibility = (node, ancestorHidden = false, insideTemplate = false) => {
    const styleState = issue33StylesheetHidden(node, stylesheet, parent);
    stylesheetState.set(node, styleState);
    const hidden = ancestorHidden || insideTemplate || stylesheet.errors.length > 0
      || issue33OwnHidden(node) || styleState.hidden;
    visible.set(node, !hidden);
    for (const child of node.childNodes || []) visitVisibility(child, hidden, insideTemplate);
    // Template content is never rendered. Its descendants remain parsed only so decoys are visible
    // to structural diagnostics, never to evidence checks.
    if (node.content) visitVisibility(node.content, true, true);
  };
  visitVisibility(document);
  const raw = (node) => {
    const location = node?.sourceCodeLocation;
    return location ? source.slice(location.startOffset, location.endOffset) : '';
  };
  const openTag = (node) => {
    const location = node?.sourceCodeLocation?.startTag;
    return location ? source.slice(location.startOffset, location.endOffset) : '';
  };
  return {
    source, document, elements, visible, parent, parseErrors, stylesheet, stylesheetState, raw, openTag
  };
};
const issue33Walk = (roots, visit) => {
  const walk = (node) => {
    visit(node);
    for (const child of node.childNodes || []) walk(child);
    if (node.content) walk(node.content);
  };
  for (const root of roots) walk(root);
};
const issue33FindElements = (dom, roots, predicate, visibleOnly = false) => {
  const found = [];
  issue33Walk(roots, (node) => {
    if (issue33Element(node) && (!visibleOnly || dom.visible.get(node)) && predicate(node)) {
      found.push(node);
    }
  });
  return found;
};
const issue33HasQuestionAncestor = (dom, node) => {
  let parent = dom.parent.get(node);
  while (parent) {
    if (issue33IsQuestion(parent)) return true;
    parent = dom.parent.get(parent);
  }
  return false;
};
const ISSUE33_VOID_HTML_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr'
]);
const ISSUE33_OPTIONAL_END_TAG_HTML_ELEMENTS = new Set([
  'html', 'head', 'body', 'li', 'dt', 'dd', 'p', 'rb', 'rt', 'rtc', 'rp',
  'optgroup', 'option', 'colgroup', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th'
]);
const issue33RequiredEndTagIssues = (dom, roots) => {
  const issues = [];
  issue33Walk(roots, (node) => {
    if (!issue33Element(node)) return;
    const location = node.sourceCodeLocation;
    if (!location?.startTag) return;
    const htmlElement = !node.namespaceURI
      || node.namespaceURI === 'http://www.w3.org/1999/xhtml';
    if (htmlElement && (ISSUE33_VOID_HTML_ELEMENTS.has(node.tagName)
      || ISSUE33_OPTIONAL_END_TAG_HTML_ELEMENTS.has(node.tagName))) return;
    if (!htmlElement && /\/\s*>$/.test(dom.openTag(node))) return;
    if (!location.endTag) {
      const line = location.startTag.startLine ?? '?';
      const column = location.startTag.startCol ?? '?';
      issues.push(`${node.tagName}@${line}:${column}`);
    }
  });
  return issues;
};
const issue33QuestionOwners = (dom, roots = [dom.document]) => {
  const candidates = issue33FindElements(dom, roots, issue33IsQuestion);
  const topLevel = candidates.filter((node) => !issue33HasQuestionAncestor(dom, node));
  const nested = candidates.filter((node) => issue33HasQuestionAncestor(dom, node));
  const markupIssues = topLevel.flatMap((node) => issue33RequiredEndTagIssues(dom, [node]));
  const balanced = dom.parseErrors.length === 0 && dom.stylesheet.errors.length === 0
    && nested.length === 0 && markupIssues.length === 0 && topLevel.every((node) =>
      Boolean(node.sourceCodeLocation?.startTag && node.sourceCodeLocation?.endTag)
    );
  return {
    balanced,
    markupIssues,
    owners: topLevel.filter((node) => dom.visible.get(node)).map((node) => ({
      node,
      html: dom.raw(node),
      openTag: dom.openTag(node)
    }))
  };
};
const issue33VisibleText = (dom, root, skipNestedQuestions = false) => {
  const pieces = [];
  const visit = (node, isRoot = false) => {
    if (!dom.visible.get(node)) return;
    if (node.nodeName === '#text') {
      pieces.push(node.value || '');
      return;
    }
    if (node.nodeName === '#comment') return;
    if (!isRoot && skipNestedQuestions && issue33IsQuestion(node)) return;
    for (const child of node.childNodes || []) visit(child);
  };
  visit(root, true);
  return pieces.join(' ').replace(/\s+/g, ' ').trim();
};
const issue33QuestionInfo = (dom, owner) => {
  const descendants = issue33FindElements(dom, owner.node.childNodes || [], () => true, true)
    .filter((node) => !issue33HasQuestionAncestor(dom, node)
      || dom.parent.get(node) === owner.node
      || (() => {
        let parent = dom.parent.get(node);
        while (parent && parent !== owner.node) {
          if (issue33IsQuestion(parent)) return false;
          parent = dom.parent.get(parent);
        }
        return parent === owner.node;
      })());
  const textElement = descendants.find((node) => issue33ClassList(node).includes('assess-qtext'));
  const questionText = textElement
    ? issue33VisibleText(dom, textElement, true).replace(/^Q\d+\s*/, '') : '';
  const statusValues = descendants.filter((node) => node.tagName === 'button')
    .flatMap((node) => issue33AttrValues(node, 'data-v'))
    .filter((value) => ['yes', 'wip', 'no', 'na'].includes(value));
  return {
    owner,
    keyValues: issue33AttrValues(owner.node, 'data-key'),
    questionText,
    statusValues
  };
};
const issue33StatusContract = (values) => ({
  ok: values.join(',') === 'yes,wip,no,na'
    && ['yes', 'wip', 'no', 'na'].every((value) => values.filter((v) => v === value).length === 1),
  values
});
const issue33RewriteStatuses = (questionBlock, values) => {
  let index = 0;
  return questionBlock.replace(/data-v="(?:yes|wip|no|na)"/g, () => `data-v="${values[index++]}"`);
};
const issue33Lever = (id, source = live) => {
  const start = source.indexOf(`<h4 id="${id}"`);
  if (start < 0) return '';
  const nextH4 = source.indexOf('\n      <h4 id=', start + 1);
  const sectionEnd = source.indexOf('\n    </section>', start + 1);
  const candidates = [nextH4, sectionEnd].filter((n) => n > start);
  return source.slice(start, candidates.length ? Math.min(...candidates) : source.length);
};
const issue33LeverRoots = (dom, id) => {
  const heading = dom.elements.find((node) => node.tagName === 'h4'
    && issue33AttrValues(node, 'id').includes(id));
  if (!heading?.parentNode) return [];
  const siblings = heading.parentNode.childNodes || [];
  const start = siblings.indexOf(heading);
  const roots = [];
  for (let index = start; index < siblings.length; index += 1) {
    const node = siblings[index];
    if (index > start && issue33Element(node) && node.tagName === 'h4') break;
    roots.push(node);
  }
  return roots;
};
const issue33ClaimBlocks = (dom, roots) => issue33FindElements(
  dom, roots, (node) => ['p', 'li', 'tr'].includes(node.tagName), true
);
const issue33HasVisibleRefAnchor = (dom, block, ref) => issue33FindElements(
  dom, [block], (node) => node.tagName === 'a', true
).some((node) => issue33AttrValues(node, 'href').some((href) => href === `#${ref}`));

// Production parse/CSS errors are verifier failures, not diagnostics that may be ignored. Keep the
// output compact enough to identify every parse5 code and source location without dumping the file.
const issue33VerifierDom = issue33Parse(liveRaw);
issue33Check(issue33VerifierDom.parseErrors.length === 0, 'source has zero parse5 errors',
  issue33VerifierDom.parseErrors.length
    ? issue33FormatParseErrors(issue33VerifierDom.parseErrors) : '0 found');
issue33Check(issue33VerifierDom.stylesheet.errors.length === 0, 'stylesheet rules are parseable',
  issue33VerifierDom.stylesheet.errors.join(', ') || `${issue33VerifierDom.stylesheet.rules.length} hiding selectors`);

const issue33AllQuestionOwners = issue33QuestionOwners(issue33VerifierDom);
const issue33GenericQuestion = issue33AllQuestionOwners.owners.find((owner) =>
  issue33AttrValues(owner.node, 'data-key').includes('qsh-q1')
);
const issue33DuplicateKeyMutation = (value) => {
  if (!issue33GenericQuestion) return { changed: false, dom: issue33Parse(liveRaw) };
  const mutatedOpen = issue33GenericQuestion.openTag.replace(
    /\sdata-key="qsh-q1"/, (match) => `${match} data-key="${value}"`
  );
  const changed = mutatedOpen !== issue33GenericQuestion.openTag;
  return {
    changed,
    dom: issue33Parse(changed
      ? liveRaw.replace(issue33GenericQuestion.openTag, mutatedOpen) : liveRaw)
  };
};
for (const [label, value] of [
  ['identical duplicate data-key', 'qsh-q1'],
  ['conflicting duplicate data-key', 'issue33-conflicting-key']
]) {
  const mutation = issue33DuplicateKeyMutation(value);
  issue33Check(mutation.changed && mutation.dom.parseErrors.some((error) => error.code === 'duplicate-attribute'),
    `full-source mutation rejects ${label}`,
    issue33FormatParseErrors(mutation.dom.parseErrors) || 'no parse error');
}
const issue33ExpectParseError = (label, source, expectedCode) => {
  const dom = issue33Parse(source);
  issue33Check(source !== liveRaw && dom.parseErrors.some((error) => error.code === expectedCode),
    `full-source mutation rejects ${label}`,
    issue33FormatParseErrors(dom.parseErrors) || 'no parse error');
};
if (issue33GenericQuestion) {
  const nullOpen = issue33GenericQuestion.openTag.replace(/>$/, '>\u0000');
  issue33ExpectParseError('unexpected null character',
    liveRaw.replace(issue33GenericQuestion.openTag, nullOpen), 'unexpected-null-character');
  const badEndOwner = issue33GenericQuestion.html.replace(/<\/div>\s*$/, '</div data-issue33-invalid>');
  issue33ExpectParseError('end tag with attributes',
    liveRaw.replace(issue33GenericQuestion.html, badEndOwner), 'end-tag-with-attributes');
} else {
  issue33Check(false, 'generic qsh-q1 parse-mutation owner exists');
}

const issue33InjectCss = (source, css) => source.replace(/<\/style>/i, `${css}\n</style>`);
const issue33CitationBlock = issue33ClaimBlocks(
  issue33VerifierDom, issue33LeverRoots(issue33VerifierDom, 'right-size-the-model-to-the-task')
).find((block) => issue33VisibleText(issue33VerifierDom, block).toLowerCase()
  .includes('choose the model and reasoning effort from task difficulty'));
const issue33CitationAnchorNode = issue33CitationBlock
  ? issue33FindElements(issue33VerifierDom, [issue33CitationBlock], (node) =>
    node.tagName === 'a' && issue33AttrValues(node, 'href').includes('#ref-98'), true)[0]
  : null;
const issue33CitationBlockRaw = issue33CitationBlock ? issue33VerifierDom.raw(issue33CitationBlock) : '';
const issue33CitationAnchorRaw = issue33CitationAnchorNode ? issue33VerifierDom.raw(issue33CitationAnchorNode) : '';
const issue33CssCitationRejected = (
  css,
  wrap,
  citationBlockRaw = issue33CitationBlockRaw,
  citationAnchorRaw = issue33CitationAnchorRaw
) => {
  if (!citationBlockRaw || !citationAnchorRaw) {
    return { changed: false, rejected: true, cssErrors: [] };
  }
  const mutatedBlock = citationBlockRaw.replace(
    citationAnchorRaw, wrap(citationAnchorRaw)
  );
  let source = liveRaw.replace(citationBlockRaw, mutatedBlock);
  if (css) source = issue33InjectCss(source, css);
  const dom = issue33Parse(source);
  const blocks = issue33ClaimBlocks(
    dom, issue33LeverRoots(dom, 'right-size-the-model-to-the-task')
  ).filter((block) => issue33VisibleText(dom, block).toLowerCase()
    .includes('choose the model and reasoning effort from task difficulty'));
  return {
    changed: source !== liveRaw,
    rejected: blocks.length !== 1 || !issue33HasVisibleRefAnchor(dom, blocks[0], 'ref-98'),
    cssErrors: dom.stylesheet.errors
  };
};
const issue33AbsentCitationEarlyPath = issue33CssCitationRejected('', (anchor) => anchor, '', '');
issue33Check(issue33AbsentCitationEarlyPath.changed === false
    && issue33AbsentCitationEarlyPath.rejected === true
    && Array.isArray(issue33AbsentCitationEarlyPath.cssErrors)
    && issue33AbsentCitationEarlyPath.cssErrors.length === 0,
  'required-citation absence returns deterministic mutation diagnostics',
  JSON.stringify(issue33AbsentCitationEarlyPath));
const issue33CssCitationCases = [
  ['existing .scrim display:none', '', (anchor) => `<span class="scrim">${anchor}</span>`],
  ['class selector and !important',
    '@media screen { @supports (display: grid) { .issue33-css-class { display: none !important; } } }',
    (anchor) => `<span class="issue33-css-class">${anchor}</span>`],
  ['id selector and visibility:hidden', '#issue33-css-id { visibility: hidden; }',
    (anchor) => `<span id="issue33-css-id">${anchor}</span>`],
  ['tag selector', 'issue33-hidden-tag { display: none; }',
    (anchor) => `<issue33-hidden-tag>${anchor}</issue33-hidden-tag>`],
  ['compound and attribute selector with visibility:collapse',
    'span.issue33-css-compound[data-issue33-hide="yes"] { visibility: collapse !important; }',
    (anchor) => `<span class="issue33-css-compound" data-issue33-hide="yes">${anchor}</span>`],
  ['comma selector list', '.issue33-never, .issue33-css-comma { display: none; }',
    (anchor) => `<span class="issue33-css-comma">${anchor}</span>`],
  ['descendant selector', '.issue33-css-scope [data-issue33-hide~="yes"] { display: none; }',
    (anchor) => `<span class="issue33-css-scope"><span data-issue33-hide="yes now">${anchor}</span></span>`],
  ['child selector', '.issue33-css-parent > span.issue33-css-child { visibility: hidden; }',
    (anchor) => `<span class="issue33-css-parent"><span class="issue33-css-child">${anchor}</span></span>`],
  ['escaped class identifier', '.audit\\:escaped { display: none; }',
    (anchor) => `<span class="audit:escaped">${anchor}</span>`],
  ['escaped id identifier', '#audit\\:escaped { display: none; }',
    (anchor) => `<span id="audit:escaped">${anchor}</span>`],
  ['escaped attribute string hex value', '[data-issue33-escape="ye\\73"] { display: none; }',
    (anchor) => `<span data-issue33-escape="yes">${anchor}</span>`],
  ['escaped display property', '.issue33-escaped-property { dis\\70 lay: none; }',
    (anchor) => `<span class="issue33-escaped-property">${anchor}</span>`],
  ['escaped display none value', '.issue33-escaped-none { display: n\\6f ne; }',
    (anchor) => `<span class="issue33-escaped-none">${anchor}</span>`],
  ['escaped visibility hidden value', '.issue33-escaped-hidden { visibility: h\\69 dden; }',
    (anchor) => `<span class="issue33-escaped-hidden">${anchor}</span>`],
  ['escaped visibility collapse value', '.issue33-escaped-collapse { visibility: c\\6f llapse; }',
    (anchor) => `<span class="issue33-escaped-collapse">${anchor}</span>`],
  ['custom-property display substitution',
    '.issue33-var-display { --issue33-display: none; display: var(--issue33-display); }',
    (anchor) => `<span class="issue33-var-display">${anchor}</span>`],
  ['custom-property visibility substitution',
    '.issue33-var-visibility { --issue33-visibility: hidden; visibility: var(--issue33-visibility); }',
    (anchor) => `<span class="issue33-var-visibility">${anchor}</span>`],
  ['empty prefix selector under :not()',
    '.issue33-empty-prefix:not([data-issue33-empty^=""]) { display: none; }',
    (anchor) => `<span class="issue33-empty-prefix" data-issue33-empty="value">${anchor}</span>`],
  ['empty suffix selector under :not()',
    '.issue33-empty-suffix:not([data-issue33-empty$=""]) { display: none; }',
    (anchor) => `<span class="issue33-empty-suffix" data-issue33-empty="value">${anchor}</span>`],
  ['empty substring selector under :not()',
    '.issue33-empty-substring:not([data-issue33-empty*=""]) { display: none; }',
    (anchor) => `<span class="issue33-empty-substring" data-issue33-empty="value">${anchor}</span>`],
  ['unevaluable relevant selector fails closed', '.issue33-css-unsafe:has(+ .sibling) { display: none; }',
    (anchor) => `<span class="issue33-css-unsafe">${anchor}</span>`]
];
for (const [label, css, wrap] of issue33CssCitationCases) {
  const mutation = issue33CssCitationRejected(css, wrap);
  issue33Check(mutation.changed && mutation.rejected && mutation.cssErrors.length === 0,
    `full-source CSS mutation rejects ${label}`,
    mutation.cssErrors.join(', ') || 'hidden evidence excluded');
}
const issue33NativeNestingMutation = issue33CssCitationRejected(
  '.issue33-nesting-parent { & .issue33-nesting-child { display: none; } }',
  (anchor) => `<span class="issue33-nesting-parent"><span class="issue33-nesting-child">${anchor}</span></span>`
);
issue33Check(issue33NativeNestingMutation.changed && issue33NativeNestingMutation.rejected
    && issue33NativeNestingMutation.cssErrors.some((error) =>
      error.startsWith('unsupported nested style rule near byte ')),
  'full-source CSS mutation rejects unsupported native nesting fail-closed',
  issue33NativeNestingMutation.cssErrors.join(', ') || 'missing nesting diagnostic');
const issue33EscapedSelectorControl = issue33CssCitationRejected(
  '.issue33\\:not-this-node { display: none; }',
  (anchor) => `<span class="issue33:still-visible">${anchor}</span>`
);
issue33Check(issue33EscapedSelectorControl.changed && !issue33EscapedSelectorControl.rejected
    && issue33EscapedSelectorControl.cssErrors.length === 0,
  'full-source CSS mutation accepts a nonmatching escaped-selector control',
  issue33EscapedSelectorControl.cssErrors.join(', ') || 'required evidence remains visible');

const issue33PbeOwner = issue33AllQuestionOwners.owners.find((owner) =>
  issue33AttrValues(owner.node, 'data-key').includes('pbe-q2')
);
const issue33PbeQuestionInfo = issue33PbeOwner
  ? issue33QuestionInfo(issue33VerifierDom, issue33PbeOwner) : null;
const issue33PbeTextNode = issue33PbeOwner
  ? issue33FindElements(issue33VerifierDom, issue33PbeOwner.node.childNodes || [],
    (node) => issue33ClassList(node).includes('assess-qtext'), true)[0] : null;
const issue33PbeStatusNodes = new Map(issue33PbeOwner
  ? issue33FindElements(issue33VerifierDom, issue33PbeOwner.node.childNodes || [],
    (node) => node.tagName === 'button', true)
    .flatMap((node) => issue33AttrValues(node, 'data-v').map((value) => [value, node]))
  : []);
const issue33AddOpenTagAttribute = (openTag, attribute) => openTag.replace(/>$/, ` ${attribute}>`);
const issue33AddOpenTagClass = (openTag, className) => /\bclass="[^"]*"/.test(openTag)
  ? openTag.replace(/\bclass="([^"]*)"/, (_, classes) => `class="${classes} ${className}"`)
  : issue33AddOpenTagAttribute(openTag, `class="${className}"`);
const issue33PbeCssEvidenceRejected = (node, css, mutateOpenTag, kind) => {
  if (!issue33PbeOwner || !issue33PbeQuestionInfo || !node) {
    return { changed: false, rejected: true, cssErrors: [] };
  }
  const openTag = issue33VerifierDom.openTag(node);
  const mutatedOpenTag = mutateOpenTag(openTag);
  const source = issue33InjectCss(
    liveRaw.replace(
      issue33PbeOwner.html,
      issue33PbeOwner.html.replace(openTag, mutatedOpenTag)
    ),
    css
  );
  const dom = issue33Parse(source);
  const owners = issue33QuestionOwners(dom);
  const owner = owners.owners.find((candidate) =>
    issue33AttrValues(candidate.node, 'data-key').includes('pbe-q2')
  );
  const info = owner ? issue33QuestionInfo(dom, owner) : null;
  const rejected = kind === 'question'
    ? info?.questionText !== issue33PbeQuestionInfo.questionText
    : !issue33StatusContract(info?.statusValues || []).ok;
  return {
    changed: mutatedOpenTag !== openTag && source !== liveRaw,
    rejected: !owners.balanced || rejected,
    cssErrors: dom.stylesheet.errors
  };
};
const issue33PbeCssCases = [
  ['escaped class', '.issue33\\:evidence { display: none; }',
    (openTag) => issue33AddOpenTagClass(openTag, 'issue33:evidence')],
  ['escaped id', '#issue33\\:evidence { display: none; }',
    (openTag) => issue33AddOpenTagAttribute(openTag, 'id="issue33:evidence"')],
  ['escaped attribute string', '[data-issue33-evidence="ye\\73"] { display: none; }',
    (openTag) => issue33AddOpenTagAttribute(openTag, 'data-issue33-evidence="yes"')],
  ['escaped display property', '[data-issue33-evidence-property] { dis\\70 lay: none; }',
    (openTag) => issue33AddOpenTagAttribute(openTag, 'data-issue33-evidence-property')],
  ['escaped display value', '[data-issue33-evidence-none] { display: n\\6f ne; }',
    (openTag) => issue33AddOpenTagAttribute(openTag, 'data-issue33-evidence-none')],
  ['escaped hidden value', '[data-issue33-evidence-hidden] { visibility: h\\69 dden; }',
    (openTag) => issue33AddOpenTagAttribute(openTag, 'data-issue33-evidence-hidden')],
  ['escaped collapse value', '[data-issue33-evidence-collapse] { visibility: c\\6f llapse; }',
    (openTag) => issue33AddOpenTagAttribute(openTag, 'data-issue33-evidence-collapse')],
  ['display custom-property substitution',
    '[data-issue33-evidence-display-var] { --issue33-d: none; display: var(--issue33-d); }',
    (openTag) => issue33AddOpenTagAttribute(openTag, 'data-issue33-evidence-display-var')],
  ['visibility custom-property substitution',
    '[data-issue33-evidence-visibility-var] { --issue33-v: hidden; visibility: var(--issue33-v); }',
    (openTag) => issue33AddOpenTagAttribute(openTag, 'data-issue33-evidence-visibility-var')]
];
if (issue33PbeOwner && issue33PbeQuestionInfo && issue33PbeTextNode
  && ['yes', 'wip', 'no', 'na'].every((value) => issue33PbeStatusNodes.has(value))) {
  const evidenceTargets = [
    ['question text', issue33PbeTextNode, 'question'],
    ...['yes', 'wip', 'no', 'na'].map((value) =>
      [`status ${value}`, issue33PbeStatusNodes.get(value), 'status'])
  ];
  for (const [targetLabel, node, kind] of evidenceTargets) {
    for (const [caseLabel, css, mutateOpenTag] of issue33PbeCssCases) {
      const mutation = issue33PbeCssEvidenceRejected(node, css, mutateOpenTag, kind);
      issue33Check(mutation.changed && mutation.rejected && mutation.cssErrors.length === 0,
        `full-source CSS mutation rejects ${caseLabel} hiding pbe-q2 ${targetLabel}`,
        mutation.cssErrors.join(', ') || 'hidden question/status evidence excluded');
    }
  }
} else {
  issue33Check(false, 'pbe-q2 CSS-mutation evidence nodes exist');
}

const issue33Sources = [
  ['ref-74', 'https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/coding-agents-insights.html'],
  ['ref-98', 'https://learn.chatgpt.com/guides/best-practices'],
  ['ref-99', 'https://developers.openai.com/codex/agent-configuration/agents-md'],
  ['ref-100', 'https://learn.chatgpt.com/docs/agent-configuration/subagents'],
  ['ref-101', 'https://developers.openai.com/codex/extend/mcp'],
  ['ref-102', 'https://developers.openai.com/codex/reference/slash-commands'],
  ['ref-103', 'https://developers.openai.com/codex/amazon-bedrock'],
  ['ref-104', 'https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/coding-agents-codex.html'],
  ['ref-105', 'https://docs.aws.amazon.com/wellarchitected/latest/agentic-ai-lens/agentcost05-bp01.html'],
  ['ref-106', 'https://developers.openai.com/codex/cli/slash-commands']
];
for (const [ref, url] of issue33Sources) {
  const entries = live.match(new RegExp(`<li\\b[^>]*id="${ref}"[^>]*>[\\s\\S]*?<\\/li>`, 'g')) || [];
  issue33Check(
    entries.length === 1 && entries[0].includes(url),
    `source ${ref} has one exact registry entry`,
    entries.length === 1 ? url : `${entries.length} entries`
  );
}

const issue33ClaimCitationContracts = [
  ['model-task-selection-ref98', 'right-size-the-model-to-the-task', 'choose the model and reasoning effort from task difficulty', ['ref-98']],
  ['model-bedrock-boundary-ref103', 'right-size-the-model-to-the-task', 'if codex uses amazon bedrock', ['ref-103']],
  ['model-subagent-choice-ref100', 'right-size-the-model-to-the-task', 'codex subagents consume more tokens than comparable single-agent runs', ['ref-100']],
  ['fleet-effort-rule-refs', 'right-size-the-model-to-the-task', 'codex guidance says to choose reasoning effort from task difficulty', ['ref-98', 'ref-100']],
  ['telemetry-measures-refs', 'cost-attribution-and-spending-caps', 'coding agent telemetry with cloudwatch coding agent insights', ['ref-74', 'ref-104']],
  ['telemetry-bedrock-boundary-ref103', 'cost-attribution-and-spending-caps', 'where codex uses amazon bedrock', ['ref-103']],
  ['config-subagent-ref100', 'manage-coding-agent-configurations', 'for codex, record model and effort defaults', ['ref-100']],
  ['config-mcp-ref101', 'manage-coding-agent-configurations', 'for codex mcp servers, use', ['ref-101']],
  ['plugin-start-small-ref98', 'manage-organisational-plugins', 'start with one or two tools that remove a real manual loop', ['ref-98']],
  ['plugin-mcp-ref101', 'manage-organisational-plugins', 'for codex mcp servers, narrow each catalogue', ['ref-101']],
  ['session-surface-refs', 'manage-the-session-and-its-context-actively', 'keep one chat per coherent outcome', ['ref-106', 'ref-102']],
  ['session-subagent-ref100', 'manage-the-session-and-its-context-actively', 'codex subagents consume more tokens than comparable single-agent runs', ['ref-100']],
  ['session-agents-ref99', 'manage-the-session-and-its-context-actively', 'codex reads guidance from global scope', ['ref-99']],
  ['session-mcp-refs', 'manage-the-session-and-its-context-actively', 'codex supports enabled_tools', ['ref-101', 'ref-98']],
  ['effort-task-rule-ref98', 'match-reasoning-effort-to-task-complexity', 'codex guidance says to choose effort from task difficulty', ['ref-98']],
  ['effort-subagent-ref100', 'match-reasoning-effort-to-task-complexity', 'for codex subagents, select the model', ['ref-100']],
  ['plan-mode-ref98', 'plan-before-executing-complex-work', 'use a read-only planning pass for multi-file changes', ['ref-98']],
  ['plan-shape-ref98', 'plan-before-executing-complex-work', 'use codex plan mode before implementation', ['ref-98']],
  ['plan-checks-ref98', 'plan-before-executing-complex-work', 'openai recommends running relevant tests', ['ref-98']],
  ['plan-review-ref106', 'plan-before-executing-complex-work', "this runbook's decision rule is to run targeted checks first", ['ref-106']],
  ['subagent-summary-ref100', 'top-levers-by-effort-to-savings', 'no default saving. measure net tokens and task success', ['ref-100']],
  ['task-economics-ref105', 'measure-cost-per-successful-task-not-cost-per-call', 'aws calls the outcome-level metric', ['ref-105']],
  ['task-telemetry-refs', 'measure-cost-per-successful-task-not-cost-per-call', 'coding agent insights supplies token', ['ref-74', 'ref-104']],
  ['provider-boundary-refs', 'measure-cost-per-successful-task-not-cost-per-call', 'telemetry transport does not select or bill the inference provider', ['ref-104', 'ref-103']]
].map(([id, lever, claim, refs]) => ({ id, lever, claim, refs }));

const inspectIssue33ClaimCitation = (dom, contract) => {
  const blocks = issue33ClaimBlocks(dom, issue33LeverRoots(dom, contract.lever))
    .filter((block) => issue33VisibleText(dom, block).toLowerCase().includes(contract.claim));
  const blockNode = blocks.length === 1 ? blocks[0] : null;
  const missingRefs = contract.refs.filter(
    (ref) => !blockNode || !issue33HasVisibleRefAnchor(dom, blockNode, ref)
  );
  const markupIssues = blockNode ? issue33RequiredEndTagIssues(dom, [blockNode]) : [];
  return {
    ok: blocks.length === 1 && missingRefs.length === 0 && markupIssues.length === 0,
    blocks: blocks.map((block) => dom.raw(block)),
    block: blockNode ? dom.raw(blockNode) : '',
    blockNode,
    missingRefs,
    markupIssues
  };
};

const issue33UnclosedQuestionDescendant = (node, tagName, attribute) => {
  if (!issue33PbeOwner || !node) return { changed: false, owners: { balanced: false, markupIssues: [] } };
  const openTag = issue33VerifierDom.openTag(node);
  const mutatedOwner = issue33PbeOwner.html.replace(
    openTag, `${openTag}<${tagName} ${attribute}>`
  );
  const source = liveRaw.replace(issue33PbeOwner.html, mutatedOwner);
  return { changed: source !== liveRaw, owners: issue33QuestionOwners(issue33Parse(source)) };
};
const issue33UnclosedSpanMutation = issue33UnclosedQuestionDescendant(
  issue33PbeTextNode, 'span', 'data-issue33-unclosed-span'
);
issue33Check(issue33UnclosedSpanMutation.changed && !issue33UnclosedSpanMutation.owners.balanced
    && issue33UnclosedSpanMutation.owners.markupIssues.some((issue) => issue.startsWith('span@')),
  'full-source mutation rejects unclosed span around pbe-q2 question text',
  issue33UnclosedSpanMutation.owners.markupIssues.join(', ') || 'no mandatory-end-tag issue');
const issue33UnclosedStrongMutation = issue33UnclosedQuestionDescendant(
  issue33PbeStatusNodes.get('yes'), 'strong', 'data-issue33-unclosed-strong'
);
issue33Check(issue33UnclosedStrongMutation.changed && !issue33UnclosedStrongMutation.owners.balanced
    && issue33UnclosedStrongMutation.owners.markupIssues.some((issue) => issue.startsWith('strong@')),
  'full-source mutation rejects unclosed strong around pbe-q2 status',
  issue33UnclosedStrongMutation.owners.markupIssues.join(', ') || 'no mandatory-end-tag issue');

const issue33AnchorContract = issue33ClaimCitationContracts.find(
  (contract) => contract.id === 'model-task-selection-ref98'
);
const issue33UnclosedAnchorSource = issue33CitationAnchorRaw
  ? liveRaw.replace(issue33CitationAnchorRaw, issue33CitationAnchorRaw.replace(/<\/a>\s*$/i, ''))
  : liveRaw;
const issue33UnclosedAnchorInspection = issue33AnchorContract
  ? inspectIssue33ClaimCitation(issue33Parse(issue33UnclosedAnchorSource), issue33AnchorContract)
  : { ok: true, markupIssues: [] };
issue33Check(issue33UnclosedAnchorSource !== liveRaw && !issue33UnclosedAnchorInspection.ok
    && issue33UnclosedAnchorInspection.markupIssues.some((issue) => issue.startsWith('a@')),
  'full-source mutation rejects unclosed required citation anchor',
  issue33UnclosedAnchorInspection.markupIssues.join(', ') || 'no mandatory-end-tag issue');

const issue33OptionalEndTagControlDom = issue33Parse(
  '<!doctype html><ul><li>one<li>two</ul><select><option>A<option>B</select>'
  + '<table><tbody><tr><td>A<td>B</table>'
);
const issue33OptionalEndTagControlIssues = issue33RequiredEndTagIssues(
  issue33OptionalEndTagControlDom, [issue33OptionalEndTagControlDom.document]
);
issue33Check(issue33OptionalEndTagControlDom.parseErrors.length === 0
    && issue33OptionalEndTagControlIssues.length === 0,
  'valid optional HTML end-tag control remains accepted',
  issue33OptionalEndTagControlIssues.join(', ') || 'void/optional end tags exempt');
const ISSUE33_PBE_Q2_TEXT = 'Does the plan define the tests, lint or type checks, review criteria, and stopping condition that prove the task is done?';
const ISSUE33_MRE_Q1_TEXT = 'Do developers choose reasoning effort from task difficulty and validate it on representative workflows?';
const inspectIssue33Source = (sourceRaw) => {
  const dom = issue33Parse(sourceRaw);
  const allQuestions = issue33QuestionOwners(dom);
  const planning = issue33QuestionOwners(
    dom, issue33LeverRoots(dom, 'plan-before-executing-complex-work')
  );
  const planningInfos = planning.owners.map((owner) => issue33QuestionInfo(dom, owner));
  const planningKeys = planningInfos.flatMap(
    (info) => info.keyValues.length ? info.keyValues : ['<missing>']
  );
  const pbeOwners = planningInfos.filter((info) => info.keyValues.includes('pbe-q2'));
  const pbe = pbeOwners.length === 1 ? pbeOwners[0] : null;
  const pbeIdentityOk = pbeOwners.length === 1 && pbe.keyValues.length === 1
    && pbe.keyValues[0] === 'pbe-q2';
  const pbeStatus = issue33StatusContract(pbe?.statusValues || []);
  const reasoning = issue33QuestionOwners(
    dom, issue33LeverRoots(dom, 'match-reasoning-effort-to-task-complexity')
  );
  const reasoningInfos = reasoning.owners.map((owner) => issue33QuestionInfo(dom, owner));
  const mreOwners = reasoningInfos.filter((info) => info.keyValues.includes('mre-q1'));
  const mre = mreOwners.length === 1 ? mreOwners[0] : null;
  return {
    source: contentOnly(sourceRaw),
    dom,
    balanced: issue33RawDivBalanced(sourceRaw)
      && allQuestions.balanced && planning.balanced && reasoning.balanced,
    questionCount: allQuestions.owners.length,
    planning: { ...planning, infos: planningInfos, keys: planningKeys },
    pbe: { info: pbe, ownerCount: pbeOwners.length, identityOk: pbeIdentityOk,
      questionOk: pbe?.questionText === ISSUE33_PBE_Q2_TEXT, status: pbeStatus,
      ok: pbeIdentityOk && pbe?.questionText === ISSUE33_PBE_Q2_TEXT && pbeStatus.ok },
    reasoning: { ...reasoning, infos: reasoningInfos },
    mre: { info: mre, ownerCount: mreOwners.length,
      identityOk: mreOwners.length === 1 && mre.keyValues.length === 1 && mre.keyValues[0] === 'mre-q1',
      questionOk: mre?.questionText === ISSUE33_MRE_Q1_TEXT },
    claims: new Map(issue33ClaimCitationContracts.map(
      (contract) => [contract.id, inspectIssue33ClaimCitation(dom, contract)]
    ))
  };
};

const issue33Current = inspectIssue33Source(liveRaw);
issue33Check(issue33Current.balanced, 'question owners are balanced elements');
issue33Check(issue33Current.questionCount === 69, 'document has exactly 69 questions', `${issue33Current.questionCount} found`);
issue33Check(issue33Current.planning.keys.join(',') === 'pbe-q1,pbe-q2',
  'planning owner keys and order are exact', issue33Current.planning.keys.join(',') || 'none');
issue33Check(issue33Current.pbe.identityOk, 'pbe-q2 identity is on one owner opening',
  `${issue33Current.pbe.ownerCount} owner(s)`);
issue33Check(issue33Current.pbe.questionOk, 'planning completion question is exact');
issue33Check(issue33Current.pbe.status.ok, 'pbe-q2 has one canonical status each',
  issue33Current.pbe.status.values.join(',') || 'none');
issue33Check(issue33Current.mre.identityOk && issue33Current.mre.questionOk,
  'reasoning-effort question is exact and owner-bound', issue33Current.mre.info?.questionText || 'missing');
issue33Check(!/30 to 60(?: per cent|%)/i.test(live), 'uncited subagent range is retired');
issue33Check(!/sandboxing, allowlisting, and tool-permission guardrails[\s\S]{0,160}cost controls too/i.test(live),
  'governance is not direct token saving');
issue33Check(!/\bCAZ\b/.test(live), 'CAZ is absent from the public runbook');
for (const contract of issue33ClaimCitationContracts) {
  const status = issue33Current.claims.get(contract.id);
  issue33Check(status.ok, `claim-local citations: ${contract.id}`,
    status.ok ? contract.refs.join(', ') : `${status.blocks.length} claim blocks; missing ${status.missingRefs.join(', ') || 'none'}`);
}

const citationContract = issue33ClaimCitationContracts.find((contract) => contract.id === 'model-task-selection-ref98');
const citationCurrent = issue33Current.claims.get(citationContract.id);
const claimRefPattern = (ref) => new RegExp(`<a\\b[^>]*href="#${ref}"[^>]*>[\\s\\S]*?<\\/a>`, 'i');
const citationAnchor = (citationCurrent.block.match(claimRefPattern('ref-98')) || [''])[0];
const replaceClaimRef = (block, ref, replacement) => block.replace(claimRefPattern(ref), replacement);
const inspectCitationMutation = (replacement) => {
  const block = replaceClaimRef(citationCurrent.block, 'ref-98', replacement);
  const raw = liveRaw.replace(citationCurrent.block, block);
  return { block, raw, status: inspectIssue33Source(raw).claims.get(citationContract.id) };
};

const hiddenCommentCitation = inspectCitationMutation('<!-- href="#ref-98" -->');
issue33Check(citationCurrent.ok && citationAnchor
  && hiddenCommentCitation.block !== citationCurrent.block && !hiddenCommentCitation.status.ok,
'full-source mutation rejects hidden-comment citation', 'comments are not DOM evidence');

const plainHrefCitation = inspectCitationMutation('<span>href="#ref-98"</span>');
issue33Check(citationAnchor && !plainHrefCitation.status.ok,
  'full-source mutation rejects plain href text', 'only an actual visible anchor counts');

const directHiddenCitation = inspectCitationMutation(
  citationAnchor.replace(/^<a\b/i, '<a hidden')
);
issue33Check(citationAnchor && !directHiddenCitation.status.ok,
  'full-source mutation rejects directly hidden anchor');

for (const [label, wrapper] of [
  ['hidden ancestor', (anchor) => `<span hidden>${anchor}</span>`],
  ['aria-hidden ancestor', (anchor) => `<span aria-hidden="true">${anchor}</span>`],
  ['display:none ancestor', (anchor) => `<span style="display: none">${anchor}</span>`],
  ['visibility:hidden ancestor', (anchor) => `<span style="visibility: hidden">${anchor}</span>`]
]) {
  const mutation = inspectCitationMutation(wrapper(citationAnchor));
  issue33Check(citationAnchor && !mutation.status.ok,
    `full-source mutation rejects ${label} citation`, 'ancestor visibility propagates');
}

const globalOnlyCitation = inspectCitationMutation('<a class="ref" href="#removed-ref-98">[98]</a>');
issue33Check(citationAnchor && globalOnlyCitation.raw.includes('href="#ref-98"')
  && !globalOnlyCitation.status.ok,
  'full-source mutation rejects global-only ref', 'other document-level ref-98 anchors remain');

const pbeQ1 = issue33Current.planning.infos.find((info) => info.keyValues[0] === 'pbe-q1');
const pbeQ2 = issue33Current.pbe.info;
const pbeQ1WithDecoy = pbeQ1.owner.html.replace(/^(<div\b[^>]*>)/i,
  '$1<span hidden data-key="pbe-q2"></span>');
const pbeQ2OpenWithoutKey = pbeQ2.owner.openTag.replace(/\sdata-key="pbe-q2"/, '');
const pbeQ2WithoutKey = pbeQ2.owner.html.replace(pbeQ2.owner.openTag, pbeQ2OpenWithoutKey);
const pbeDecoyRaw = liveRaw.replace(pbeQ1.owner.html, pbeQ1WithDecoy).replace(pbeQ2.owner.html, pbeQ2WithoutKey);
const pbeDecoyStatus = inspectIssue33Source(pbeDecoyRaw);
issue33Check(pbeQ1WithDecoy !== pbeQ1.owner.html && pbeQ2WithoutKey !== pbeQ2.owner.html
  && !pbeDecoyStatus.pbe.identityOk, 'full-source mutation rejects sibling nested key',
  `${pbeDecoyStatus.pbe.ownerCount} pbe-q2 owner(s)`);

const inspectPbeSourceMutation = (ownerHtml) => inspectIssue33Source(
  liveRaw.replace(pbeQ2.owner.html, ownerHtml)
);
const inspectPbeMutation = (ownerHtml) => inspectPbeSourceMutation(ownerHtml).pbe;
const pbeMissing = pbeQ2.owner.html.replace(/<button\b[^>]*data-v="na"[^>]*>[\s\S]*?<\/button>/, '');
const pbeDuplicate = pbeQ2.owner.html.replace('data-v="na"', 'data-v="yes"');
const pbeReordered = issue33RewriteStatuses(pbeQ2.owner.html, ['yes', 'no', 'wip', 'na']);
const pbeHiddenStatus = pbeQ2.owner.html.replace(
  /<button\b[^>]*data-v="na"[^>]*>[\s\S]*?<\/button>/,
  (button) => `<span hidden>${button}</span>`
);
const pbeHiddenQuestion = pbeQ2.owner.html.replace(
  ISSUE33_PBE_Q2_TEXT,
  `<span hidden>${ISSUE33_PBE_Q2_TEXT}</span>Mutation-only visible question`
);
const pbeMalformed = pbeQ2.owner.html.replace(/<\/div>\s*$/, '');
issue33Check(!inspectPbeMutation(pbeMissing).ok, 'full-source mutation rejects missing pbe-q2 status');
issue33Check(!inspectPbeMutation(pbeDuplicate).ok, 'full-source mutation rejects duplicate pbe-q2 status');
issue33Check(!inspectPbeMutation(pbeReordered).ok, 'full-source mutation rejects reordered pbe-q2 status');
issue33Check(pbeHiddenStatus !== pbeQ2.owner.html && !inspectPbeMutation(pbeHiddenStatus).ok,
  'full-source mutation rejects status under hidden ancestor');
issue33Check(pbeHiddenQuestion !== pbeQ2.owner.html && !inspectPbeMutation(pbeHiddenQuestion).questionOk,
  'full-source mutation rejects question text only under hidden ancestor');
issue33Check(pbeMalformed !== pbeQ2.owner.html && !inspectPbeSourceMutation(pbeMalformed).balanced,
  'full-source mutation rejects malformed/unbalanced owner');

const oldEffortQuestion = 'Do developers start with the default reasoning effort and raise it only when the task needs deeper analysis?';
const oldEffortOwner = issue33Current.mre.info.owner.html.replace(ISSUE33_MRE_Q1_TEXT, oldEffortQuestion);
const oldEffortStatus = inspectIssue33Source(
  liveRaw.replace(issue33Current.mre.info.owner.html, oldEffortOwner)
).mre;
issue33Check(oldEffortOwner !== issue33Current.mre.info.owner.html && !oldEffortStatus.questionOk,
  'full-source mutation rejects old default-effort question');

const issue33Coverage = [
  ['model sizing', 'right-size-the-model-to-the-task', ['Codex', 'configured model', 'task difficulty', 'subagent', 'href="#match-reasoning-effort-to-task-complexity"', 'href="#ref-103"']],
  ['coding configuration', 'manage-coding-agent-configurations', ['enabled_tools', 'disabled_tools', 'output_token_limit', 'href="#ref-101"']],
  ['organisational plugins', 'manage-organisational-plugins', ['one or two tools', 'enabled_tools', 'output_token_limit', 'href="#manage-the-session-and-its-context-actively"']],
  ['session and context', 'manage-the-session-and-its-context-actively', ['/new', '/compact', 'AGENTS.md', '32 KiB', 'bounded parallelism', 'Avoid parallel writes', 'href="#plan-before-executing-complex-work"']],
  ['reasoning effort', 'match-reasoning-effort-to-task-complexity', ['Codex', 'choose effort from task difficulty', 'model_reasoning_effort', 'href="#right-size-the-model-to-the-task"']],
  ['planning', 'plan-before-executing-complex-work', ['Goal', 'Context', 'Constraints', 'Done when', 'Plan mode', '/review', 'targeted checks', "runbook's decision rule"]],
  ['telemetry', 'cost-attribution-and-spending-caps', ['per-turn latency', 'API requests', 'approvals', 'defined outcome', 'href="#measure-cost-per-successful-task-not-cost-per-call"']],
  ['completed-task economics', 'measure-cost-per-successful-task-not-cost-per-call', ['cost-per-task-completion', 'stable task or workflow key', 'governance and blast-radius containment', 'Telemetry transport does not select or bill the inference provider']]
];
for (const [label, id, phrases] of issue33Coverage) {
  const section = issue33Lever(id);
  const missing = phrases.filter((phrase) => !section.toLowerCase().includes(phrase.toLowerCase()));
  issue33Check(section.length > 0 && missing.length === 0, `visible coverage: ${label}`, missing.join(', ') || id);
}

// ---------------------------------------------------------------------------
// 1. Counts must not go down
// ---------------------------------------------------------------------------
// Deliberately >= rather than ==: adding a lever, table or figure is progress, losing one is a
// regression. A count that goes UP is reported so it is a conscious change, not a surprise.

console.log(bold('  Counts'));
for (const [label, extract] of COUNT_CHECKS) {
  const was = extract(baseline);
  const now = extract(live);
  const transition = KNOWN_COUNT_TRANSITIONS.get(label);
  if (transition) {
    const [expectedBefore, expectedAfter] = transition;
    if (was !== expectedBefore || now !== expectedAfter) {
      failures.push(`${label}: expected deliberate transition ${expectedBefore} → ${expectedAfter}, found ${was} → ${now}`);
      console.log(`  ${red('✖')} ${label.padEnd(46)} ${was} → ${red(String(now))} ${dim(`(expected ${expectedBefore} → ${expectedAfter})`)}`);
    } else {
      console.log(`  ${green('→')} ${label.padEnd(46)} ${was} → ${green(String(now))} ${dim('(consolidated deliberately)')}`);
    }
  } else if (now < was) {
    failures.push(`${label}: ${was} → ${now} (lost ${was - now})`);
    console.log(`  ${red('✖')} ${label.padEnd(46)} ${was} → ${red(String(now))}`);
  } else if (now > was) {
    console.log(`  ${green('+')} ${label.padEnd(46)} ${was} → ${green(String(now))} ${dim('(added)')}`);
  } else {
    console.log(`  ${green('✓')} ${label.padEnd(46)} ${now}`);
  }
}

// ---------------------------------------------------------------------------
// 2. Set membership: nothing present in the baseline may disappear
// ---------------------------------------------------------------------------
// This is the check that actually protects citations and link targets. A count can stay at 141
// while a reference is swapped for a duplicate of another; a set difference cannot.

console.log(`\n${bold('  Set membership')}`);
for (const [label, extract, replaced, removed] of SET_CHECKS) {
  const was = extract(baseline);
  const now = extract(live);
  // A declared replacement excuses the loss only if its successor is actually present. A declared
  // removal excuses only an ID that existed in the baseline and is now absent.
  const excused = (v) => Boolean(replaced?.has(v) && now.has(replaced.get(v)));
  const retired = (v) => Boolean(removed?.has(v) && was.has(v) && !now.has(v));
  const lost = [...was].filter((v) => !now.has(v) && !excused(v) && !retired(v));
  const added = [...now].filter((v) => !was.has(v));
  for (const [from, to] of replaced || []) {
    if (!was.has(from)) console.log(`  ${green('!')} replacement is stale — ${from} is no longer in the baseline, drop the entry`);
    else if (!now.has(to)) console.log(`  ${red('✖')} declared replacement for ${from} is absent: ${to}`);
    else console.log(`  ${green('→')} ${'replaced deliberately'.padEnd(46)} ${dim(`${from} → ${to}`)}`);
  }
  for (const id of removed || []) {
    if (!was.has(id)) console.log(`  ${green('!')} removal is stale — ${id} is no longer in the baseline, drop the entry`);
    else if (now.has(id)) {
      failures.push(`${label}: declared removal is still present — ${id}`);
      console.log(`  ${red('✖')} ${'declared removal still present'.padEnd(46)} ${id}`);
    } else console.log(`  ${green('−')} ${'removed deliberately'.padEnd(46)} ${dim(id)}`);
  }
  if (lost.length) {
    failures.push(`${label}: ${lost.length} lost — ${lost.slice(0, 12).join(', ')}${lost.length > 12 ? ', …' : ''}`);
    console.log(`  ${red('✖')} ${label.padEnd(46)} ${red(`${lost.length} lost`)} of ${was.size}`);
    for (const v of lost.slice(0, 12)) console.log(`      ${red('-')} ${v}`);
    if (lost.length > 12) console.log(`      ${dim(`… and ${lost.length - 12} more`)}`);
  } else {
    const suffix = added.length ? ` ${green(`+${added.length}`)}` : '';
    console.log(`  ${green('✓')} ${label.padEnd(46)} ${was.size} kept${suffix}`);
  }
}

// ---------------------------------------------------------------------------
// 3. Internal links must resolve in the live file
// ---------------------------------------------------------------------------
// A preserved id is not enough: the refactor could keep the id and break the href, or vice versa.
// Every same-page anchor is resolved against the set of ids actually present.

console.log(`\n${bold('  Internal link resolution')}`);
const liveIds = setOf(/\sid="([^"]+)"/g)(live);
const anchors = new Set();
for (const m of live.matchAll(/href="#([^"]+)"/g)) anchors.add(m[1]);

const unresolved = [...anchors].filter((a) => !liveIds.has(a) && !KNOWN_DANGLING_ANCHORS.has(a));
const staleAllowlist = [...KNOWN_DANGLING_ANCHORS].filter((a) => liveIds.has(a));

if (unresolved.length) {
  failures.push(`${unresolved.length} unresolved internal anchor(s): ${unresolved.join(', ')}`);
  console.log(`  ${red('✖')} ${unresolved.length} of ${anchors.size} anchors do not resolve`);
  for (const a of unresolved) console.log(`      ${red('-')} #${a}`);
} else {
  console.log(`  ${green('✓')} all ${anchors.size} internal anchors resolve ${dim(`(${KNOWN_DANGLING_ANCHORS.size} known-dangling allowlisted)`)}`);
}
// If an allowlisted anchor now exists, the allowlist is stale. Not a regression, but it must not rot.
if (staleAllowlist.length) {
  console.log(`  ${green('!')} allowlist is stale — now resolves, remove from KNOWN_DANGLING_ANCHORS: ${staleAllowlist.join(', ')}`);
}

// A resolving anchor still is not enough. `[90]` in the prose can land on an entry the browser
// renders as "87", and every check above stays green: the id set is intact and the anchor resolves.
// What breaks is the marker the reader sees.
//
// The list carries number gaps from entries deleted long ago, and an <ol> renumbers sequentially
// across a gap unless the next item pins itself with `value=`. Miss one and every later entry drifts;
// worse, a `value` written to match an existing drift freezes it. Both had happened — 42 of 81 entries
// were rendering 2 to 3 low, from a 43/44 gap that was never resynced — and nothing caught it for
// months, because the fault is in a rendered marker rather than in any id, href or count.
//
// So compute what the browser will render, the same way it does, and require it to equal the id.
console.log(`\n${bold('  Reference list numbering')}`);
const refEntries = [...live.matchAll(/<li id="ref-(\d+)"([^>]*)>/g)].map((m) => ({
  num: Number(m[1]),
  value: (m[2].match(/value="(\d+)"/) || [])[1]
}));
let rendered = 0;
const misnumbered = [];
for (const e of refEntries) {
  rendered = e.value ? Number(e.value) : rendered + 1;
  if (rendered !== e.num) misnumbered.push({ id: `ref-${e.num}`, rendered });
}
if (misnumbered.length) {
  failures.push(
    `${misnumbered.length} reference entr${misnumbered.length === 1 ? 'y renders' : 'ies render'} ` +
    `a number other than its own id — a citation will land on the wrong marker ` +
    `(first: ${misnumbered[0].id} renders as ${misnumbered[0].rendered})`
  );
  console.log(`  ${red('✖')} ${misnumbered.length} of ${refEntries.length} entries render the wrong number`);
  for (const m of misnumbered.slice(0, 8)) console.log(`      ${red('-')} ${m.id} renders as ${m.rendered}`);
  if (misnumbered.length > 8) console.log(`      ${dim(`… and ${misnumbered.length - 8} more`)}`);
  console.log(`  ${dim('Fix: give the first entry after each gap a value="N" matching its own id.')}`);
} else {
  console.log(`  ${green('✓')} all ${refEntries.length} entries render as their own id ${dim('(gaps resynced with value=)')}`);
}

// ---------------------------------------------------------------------------
// 4. CSP invariants the static site build depends on
// ---------------------------------------------------------------------------
// build-site.mjs aborts on any of these. Catching them here gives a clearer error earlier,
// and keeps `npm run verify` meaningful even when the app build has not been run.

console.log(`\n${bold('  Site build invariants')}`);
const styleTags = (liveRaw.match(/<style(\s[^>]*)?>/gi) || []).length;
const scriptTags = (liveRaw.match(/<script(\s[^>]*)?>/gi) || []).length;

const invariant = (ok, label, detail) => {
  if (ok) { console.log(`  ${green('✓')} ${label.padEnd(46)} ${detail}`); }
  else { failures.push(`${label}: ${detail}`); console.log(`  ${red('✖')} ${label.padEnd(46)} ${red(detail)}`); }
};

// extractSole() in build-site.mjs aborts unless there is exactly one of each.
invariant(styleTags === 1, 'exactly one <style> block', `${styleTags} found`);
invariant(scriptTags === 1, 'exactly one <script> block', `${scriptTags} found`);

// Double-quoted inline styles are ALLOWED upstream: the build hoists static ones into .rb-sN classes
// and patches the runtime ones. So the rule is "must not grow", not "must be zero" — a new one means
// the hoister has to be taught about it. The count is expected to fall to 0 as
// the CSS moves into site/src/css; when it does, this check simply keeps it there.
const inlineStyles = (html) => (html.match(/\sstyle\s*=\s*"/g) || []).length;
const wasInline = inlineStyles(baselineRaw);
const nowInline = inlineStyles(liveRaw);
if (nowInline > wasInline) {
  failures.push(`inline style="" attributes grew ${wasInline} → ${nowInline}; the site build must be taught about each new one`);
  console.log(`  ${red('✖')} ${'inline style="" attributes'.padEnd(46)} ${red(`${wasInline} → ${nowInline}`)}`);
} else if (nowInline < wasInline) {
  console.log(`  ${green('✓')} ${'inline style="" attributes'.padEnd(46)} ${wasInline} → ${green(String(nowInline))} ${dim('(reduced)')}`);
} else {
  console.log(`  ${green('✓')} ${'inline style="" attributes'.padEnd(46)} ${nowInline} ${dim('(unchanged; hoisted by the site build)')}`);
}

// Single-quoted ones are a hard fail: the hoister's regex only handles double quotes, so one of
// these survives into the served HTML and is then blocked by style-src 'self'.
const singleQuoted = (liveRaw.match(/\sstyle\s*=\s*'/g) || []).length;
invariant(singleQuoted === 0, "no single-quoted style='' attributes", `${singleQuoted} found`);

// A browser-based prose editor (the upstream project's `npm run edit`, not shipped here) stamps
// `data-edit-loc` and sets `contenteditable` in its HTTP RESPONSE ONLY. Neither may ever reach disk,
// because this file is published verbatim as the site. Asserted, not trusted, so a contributor who uses
// any such tool cannot leak its markup into the published page.
const editorStamps = (liveRaw.match(/\sdata-edit-loc=/g) || []).length;
const editableAttrs = (liveRaw.match(/\scontenteditable[=\s>]/gi) || []).length;
invariant(editorStamps === 0, 'no data-edit-loc stamps from the editor', `${editorStamps} found`);
invariant(editableAttrs === 0, 'no contenteditable attributes', `${editableAttrs} found`);

// ---------------------------------------------------------------------------
// 5. The static site makes no network call and carries no internal host
// ---------------------------------------------------------------------------
//
// The published page is a static file on GitHub Pages. It has no backend, no sign-in and no API: the
// only way it reaches GitHub is an ordinary <a href> the reader clicks ("Suggest a change"). This
// replaces the upstream check that paired a feedback API origin across three files -- there is no API
// origin any more, so the invariant becomes "there is none", which is strictly stronger: any request
// primitive in the generated JS fails the build, and so does any internal host in the published file.

console.log(`\n${bold('  Static-site invariants')}`);
const jsRegion = (liveRaw.match(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/i) || [, ''])[1];
const NETWORK_PRIMITIVES = [
  ['fetch(', /\bfetch\s*\(/],
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['navigator.sendBeacon', /\bsendBeacon\s*\(/],
  ['WebSocket', /\bWebSocket\s*\(/],
  ['EventSource', /\bEventSource\s*\(/],
  ['import()', /\bimport\s*\(/]
];
for (const [label, re] of NETWORK_PRIMITIVES) {
  invariant(!re.test(jsRegion), `no ${label} in the generated JS`, re.test(jsRegion) ? 'found' : 'none');
}
// The needles are assembled from fragments on purpose: the repository's own pre-publish leak scan
// greps every tracked file for these words, and this list must not be the thing it finds.
const INTERNAL_NEEDLES = [
  ['har', 'mony'], ['mid', 'way'], ['execute', '-api'], ['a2', 'z.com'], ['ama', 'zon.dev'], ['aw', 's.dev'],
  ['sl', 'ack.com'], ['aws', 'apps'], ['work', 'docs'], ['phone', 'tool'], ['code', '.amazon'], ['git', 'lab'],
  ['qu', 'ip-amazon'], ['isen', 'gard'], ['w.ama', 'zon.com'], ['@ama', 'zon.com']
].map((parts) => parts.join('').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
// Any bare 12-digit run is treated as a possible AWS account ID.
const INTERNAL_HOSTS = new RegExp(INTERNAL_NEEDLES.join('|') + '|(?<![0-9])[0-9]{12}(?![0-9])', 'gi');
const internalHits = [...new Set((liveRaw.match(INTERNAL_HOSTS) || []).map((m) => m.toLowerCase()))];
invariant(internalHits.length === 0, 'no internal host, account or auth reference', internalHits.length ? internalHits.join(', ') : 'none');

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

if (failures.length) {
  console.error(`\n${red(bold(`✖ ${failures.length} regression(s)`))}\n`);
  for (const f of failures) console.error(`  • ${f}`);
  console.error(`\nContent must be relocated, never deleted.`);
  console.error(`Compare against ${dim(`${ARCHIVE_DIR}/${baselineName}`)} to find what moved.\n`);
  process.exit(1);
}

console.log(`\n${green(bold('✓ no content regression'))} — every lever, question, table, citation, id and URL in the baseline is still present.\n`);
