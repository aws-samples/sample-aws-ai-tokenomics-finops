#!/usr/bin/env node
/**
 * Fact-integrity check for a PROSE rewrite of the runbook.
 *
 * Why this exists
 * ---------------
 * `verify-runbook.mjs` proves no *structural* content was lost: ids, citations, external URLs,
 * table and lever counts. It is deliberately blind to the words themselves, because until now the
 * prose was only ever edited a paragraph at a time.
 *
 * A whole-runbook language rewrite breaks that assumption. Every one of ~23,000 words can change,
 * and the existing verifier would stay green while a rewrite silently dropped "54 per cent",
 * turned `$5.50` into `$5.00`, or lost the sentence carrying a trade-off. Re-reading 23,000 words
 * to prove otherwise does not scale, so this script makes "no knowledge regression" a machine-
 * checked claim: it extracts every hard fact the prose asserts, keyed to the section that asserts
 * it, and fails if one disappears.
 *
 * What counts as a fact here
 * --------------------------
 * Only tokens whose loss or mutation is unambiguously a regression: quantities, money, code
 * identifiers, citations, technical proper nouns. Prose *claims* are not extractable, so two
 * proxies stand in for them:
 *   - per-section word count, flagged if it falls by more than SHRINK_LIMIT (a deleted paragraph
 *     shows up as a cliff even when it carried no numbers);
 *   - per-section sentence count, reported so a "rewrite" that merely deleted half a section is
 *     visible rather than inferred.
 *
 * ADDED facts are reported, never failed. The rewrite brief allows filling genuine explanation
 * gaps, but the project's price-verification rule requires every Bedrock price to be verified and dated and
 * every reported industry figure marked as such. A new number is therefore not an error but it IS
 * something a human must sign off, so it is printed loudly instead of passing in silence.
 *
 * Usage
 * -----
 *   node scripts/verify-runbook-facts.mjs --snapshot   # capture the CURRENT file as the baseline
 *   node scripts/verify-runbook-facts.mjs              # diff the live file against that baseline
 *
 * The baseline is JSON, not an HTML copy, so it is small, reviewable and diffable in a terminal.
 * It lives in .verify-out/ because that path is gitignored: this is a working guard for
 * one rewrite, not a release artefact. The release baseline remains
 * content/archive/, governed by that directory's own README.
 *
 * Exit status: 0 = pass, 1 = a fact was lost, 2 = the check could not run.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newestSnapshot } from './lib/archive.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML_DIR = join(REPO_ROOT, 'content');
const LIVE = join(HTML_DIR, 'index.html');
// Same override as verify-runbook.mjs, so both checks always read the same baseline.
const ARCHIVE_DIR = process.env.RUNBOOK_ARCHIVE_DIR || join(HTML_DIR, 'archive');
if (process.env.RUNBOOK_ARCHIVE_DIR) {
  // Never silent: a different floor changes what "nothing was lost" means. CI refuses to set it.
  console.log(`\x1b[33m! baseline overridden by RUNBOOK_ARCHIVE_DIR=${process.env.RUNBOOK_ARCHIVE_DIR}\x1b[0m`);
}
const OUT_DIR = join(REPO_ROOT, '.verify-out');
const BASELINE = join(OUT_DIR, 'runbook-facts-baseline.json');

/** A section may legitimately tighten. Below this, assume a paragraph was dropped. */
const SHRINK_LIMIT = -0.25;

const bold = (s) => `[1m${s}[0m`;
const red = (s) => `[31m${s}[0m`;
const green = (s) => `[32m${s}[0m`;
const yellow = (s) => `[33m${s}[0m`;
const dim = (s) => `[2m${s}[0m`;

function bail(message, hint) {
  console.error(`\n${red('✖')} verify-runbook-facts: ${message}`);
  if (hint) console.error(`  ${hint}`);
  console.error('');
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

/** Drop the generated <style>/<script> so CSS/JS churn cannot register as prose change. */
function authoredOnly(html) {
  return html
    .replace(/<style(\s[^>]*)?>[\s\S]*?<\/style>/gi, '')
    .replace(/<script(\s[^>]*)?>[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, ''); // authoring comments are not shipped prose
}

const toText = (s) =>
  s.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Fact classes. Each is a set, compared by difference — a count alone would miss "one dropped,
 * a different one added", which is exactly how a careless rewrite mangles a figure.
 */
const FACT_CLASSES = {
  percentages: (t) => t.match(/\b\d[\d.,]*\s?(?:%|per cent)/gi) || [],
  money: (t) => t.match(/\$\s?[\d.,]+\s?[KMB]?/g) || [],
  multipliers: (t) => t.match(/\b\d+(?:\.\d+)?\s?[x×]\b/gi) || [],
  tokenCounts: (t) => t.match(/\b[\d.,]+\s?(?:k|K|M|million|thousand)?\s?tokens?\b/g) || [],
  unitQuantities: (t) => t.match(/\b\d[\d.,]*\s?(?:ms|KB|MB|GB|TB|RPM|TPM|RPS|hours?|days?|weeks?|months?)\b/gi) || [],
  integers: (t) => t.match(/\b\d{2,}\b/g) || [],
  // CamelCase API names (InvokeModel, GenAI), and dotted/kebab identifiers
  // (application-inference-profile, bedrock:InvokeModel).
  identifiers: (t) => [
    ...(t.match(/\b(?:[a-z]+:)?[A-Z][a-zA-Z0-9]*(?:[A-Z][a-zA-Z0-9]*)+\b/g) || []),
    ...(t.match(/\b[a-z0-9]+(?:[-_.][a-z0-9]+){2,}\b/g) || [])
  ]
};

/** <code> content and citation anchors come from markup, not the flattened text. */
function markupFacts(html) {
  return {
    codeSpans: [...html.matchAll(/<code>([\s\S]*?)<\/code>/g)].map((m) => toText(m[1])).filter(Boolean),
    citations: (html.match(/href="#(ref-\d+)"/g) || []).map((s) => s.replace(/href="#|"/g, ''))
  };
}

/** Style metrics: not gated, but they are how the rewrite proves it did what it claimed. */
function styleMetrics(text) {
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.split(' ').length > 2);
  const lens = sentences.map((s) => s.split(' ').filter(Boolean).length);
  return {
    words: text.split(' ').filter(Boolean).length,
    sentences: sentences.length,
    medianSentence: lens.length ? lens.slice().sort((a, b) => a - b)[Math.floor(lens.length / 2)] : 0,
    over35: lens.filter((n) => n > 35).length,
    over45: lens.filter((n) => n > 45).length,
    colonDefs: (text.match(/: [a-z]/g) || []).length,
    semicolons: (text.match(/;/g) || []).length,
    filler: (text.match(/\b(actually|exactly|quietly|silently|invisibly|unnoticed|simply|truly|genuinely)\b/gi) || []).length
  };
}

/**
 * Segment the file by heading, so a report can name the lever that lost a fact rather than just
 * saying the document did. Everything before the first heading is attributed to '(front matter)'.
 */
function extract(html) {
  const src = authoredOnly(html);
  const lines = src.split('\n');
  const marks = [{ line: 0, id: '(front matter)' }];
  lines.forEach((l, i) => {
    const heading = l.match(/<h([1-4])\s+id="([^"]+)"/);
    const factOwner = l.match(/data-fact-owner="([^"]+)"/);
    if (heading) marks.push({ line: i, id: heading[2] });
    else if (factOwner) marks.push({ line: i, id: factOwner[1] });
  });

  const sections = {};
  for (let k = 0; k < marks.length; k++) {
    const from = marks[k].line;
    const to = k + 1 < marks.length ? marks[k + 1].line : lines.length;
    const chunk = lines.slice(from, to).join('\n');
    const text = toText(chunk);
    if (!text) continue;

    const facts = {};
    for (const [name, fn] of Object.entries(FACT_CLASSES)) facts[name] = fn(text);
    Object.assign(facts, markupFacts(chunk));

    // A heading id can repeat if the file is edited carelessly; merge rather than overwrite so a
    // duplicate cannot silently hide half a section from the check.
    const prev = sections[marks[k].id];
    if (prev) {
      for (const kk of Object.keys(facts)) prev.facts[kk] = prev.facts[kk].concat(facts[kk]);
      prev.style.words += styleMetrics(text).words;
      prev._text += ` ${text}`;
    } else {
      const section = { facts, style: styleMetrics(text) };
      // Contracts inspect live prose, but snapshots remain compact fact/style JSON.
      Object.defineProperty(section, '_text', { value: text, writable: true, enumerable: false });
      sections[marks[k].id] = section;
    }
  }
  return sections;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

let liveRaw;
try {
  liveRaw = readFileSync(LIVE, 'utf8');
} catch (e) {
  bail(`cannot read ${LIVE}: ${e.message}`);
}
const live = extract(liveRaw);

const totals = (secs) => {
  const t = {};
  for (const s of Object.values(secs)) {
    for (const [k, v] of Object.entries(s.facts)) t[k] = (t[k] || 0) + v.length;
  }
  return t;
};

if (process.argv.includes('--snapshot')) {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(BASELINE, JSON.stringify(live, null, 1));
  const t = totals(live);
  const n = Object.values(t).reduce((a, b) => a + b, 0);
  console.log(`\n${bold('verify-runbook-facts')} — baseline captured`);
  console.log(`  ${dim(BASELINE.replace(REPO_ROOT + '/', ''))}`);
  console.log(`  ${Object.keys(live).length} sections, ${n} fact tokens`);
  for (const [k, v] of Object.entries(t)) console.log(`    ${k.padEnd(16)} ${String(v).padStart(5)}`);
  console.log('');
  process.exit(0);
}

// Baseline resolution, in priority order:
//   1. a local pre-edit snapshot, if one exists — the "did MY rewrite lose facts" workflow;
//   2. otherwise the newest archive snapshot, the same file verify-runbook.mjs baselines against.
//
// (2) is what lets this run with no setup, which is what lets it live inside `npm run verify`.
// Before it existed, a contributor who had not snapshotted got exit 2, so the check could not be
// part of the shared gate.
let base;
let baselineLabel;
if (existsSync(BASELINE)) {
  base = JSON.parse(readFileSync(BASELINE, 'utf8'));
  baselineLabel = `${BASELINE.replace(REPO_ROOT + '/', '')} ${dim('(local pre-edit snapshot)')}`;
} else {
  const snap = newestSnapshot(ARCHIVE_DIR);
  if (!snap) {
    bail('no baseline to compare against.',
      'Expected a snapshot in content/archive/, or a local one from `npm run verify:facts:snapshot`.');
  }
  base = extract(readFileSync(join(ARCHIVE_DIR, snap), 'utf8'));
  baselineLabel = `archive/${snap}`;
}

console.log(`\n${bold('verify-runbook-facts')} — knowledge integrity across a prose rewrite`);
console.log(`  baseline  ${dim(baselineLabel)}`);
console.log(`  live      ${dim('content/index.html')}\n`);

const failures = [];
const warnings = [];

// --- 0. the prose statements of the lever total must equal the lever-index row count ----------
// The prose counts rows of the no-JS lever-index table (details.lever-index tbody), the convention
// that read 34 before issue #39 and 35 after it. Each statement is located by its surrounding
// wording; a statement that cannot be found exactly once is a failure, so a rewording cannot
// silently switch this check off. Update LEVER_TOTAL_STATEMENTS in the same change as the wording.
const LEVER_INDEX_ROW = /<tr><td>(?:Track 1|Track 2|Both tracks)<\/td><td>(?:Model Inference|Agent Harness|End User|Decision principles)<\/td>/g;
const LEVER_TOTAL_STATEMENTS = [
  { id: 'key-levers-holds', pattern: /This runbook holds (\d+) of them\./g },
  { id: 'key-levers-names-all', pattern: /The list under it names all (\d+), with what each one saves/g },
  { id: 'cost-map-progress-bar', pattern: /Lever progress &middot; all (\d+) levers<span class="sf-note">/g },
  { id: 'lever-progress-intro', pattern: /Every one of the (\d+) levers sits in the cell that owns it/g }
];
function checkLeverTotal(raw) {
  const src = authoredOnly(raw);
  const errors = [];
  const block = src.match(/<details class="lever-index[^"]*">[\s\S]*?<\/details>/);
  const rows = block ? (block[0].match(LEVER_INDEX_ROW) || []).length : 0;
  if (!block) errors.push('lever total: the lever-index table (details.lever-index) was not found');
  else if (rows === 0) errors.push('lever total: the lever-index table has no lever rows');
  const statements = LEVER_TOTAL_STATEMENTS.map(({ id, pattern }) => {
    const found = [...src.matchAll(pattern)];
    if (found.length !== 1) {
      errors.push(`lever total statement ${id} not found exactly once (found ${found.length}); a rewording must update LEVER_TOTAL_STATEMENTS`);
      return { id, found: found.length, stated: null };
    }
    const stated = Number(found[0][1]);
    if (stated !== rows) errors.push(`lever total drift: ${id} states ${stated}, the lever index has ${rows} rows`);
    return { id, found: 1, stated };
  });
  return { rows, statements, errors };
}

const leverTotal = checkLeverTotal(liveRaw);
failures.push(...leverTotal.errors);

const offByOneLeverRaw = liveRaw.replace(
  /This runbook holds \d+ of them\./, `This runbook holds ${leverTotal.rows + 1} of them.`
);
const offByOneLeverProofPassed = checkLeverTotal(offByOneLeverRaw).errors
  .some((error) => error.includes('lever total drift: key-levers-holds'));
if (!offByOneLeverProofPassed) failures.push('lever-total mutation accepted an off-by-one statement');

const rewordedLeverRaw = liveRaw.replace(/Every one of the (\d+) levers sits/, 'Each of the $1 levers sits');
const rewordedLeverProofPassed = checkLeverTotal(rewordedLeverRaw).errors
  .some((error) => error.includes('lever total statement lever-progress-intro not found exactly once'));
if (!rewordedLeverProofPassed) failures.push('lever-total mutation accepted a reworded statement');

console.log(bold('  Stated lever total'));
if (leverTotal.errors.length === 0) {
  const n = leverTotal.statements.filter((s) => s.stated === leverTotal.rows).length;
  console.log(`  ${green('✓')} stated lever total matches the lever index: ${n}/${LEVER_TOTAL_STATEMENTS.length} statements say ${leverTotal.rows}, ${leverTotal.rows} rows`);
} else {
  console.log(`  ${red('✖')} stated lever total does not match the lever index (${leverTotal.rows} rows)`);
}
console.log(`  ${offByOneLeverProofPassed ? green('✓') : red('✖')} lever-total mutation rejects an off-by-one statement`);
console.log(`  ${rewordedLeverProofPassed ? green('✓') : red('✖')} lever-total mutation rejects a reworded statement`);

// --- 1. sections must not vanish ------------------------------------------
const goneSections = Object.keys(base).filter((id) => !live[id]);
if (goneSections.length) {
  failures.push(`${goneSections.length} section(s) disappeared: ${goneSections.join(', ')}`);
}

// --- 2. facts: leaving the DOCUMENT fails; moving between sections is reported -------------
// The lever format (§8) requires content to be *relocated, never deleted*,
// and relocation is the single most common legitimate restructuring here. So the hard failure is
// document-scoped: a fact must not leave the document. A fact that appears in a different section
// than before is a MOVE — surfaced, because it is useful signal, but not a regression.
//
// (This is what the failure message always claimed. It used to be enforced per-section, so a
// verbatim relocation reported the same tokens as both "lost" and "new" and failed the build.)
const flatten = (secs) => {
  const all = new Map(); // "class:value" -> Set of section ids
  for (const [id, s] of Object.entries(secs)) {
    for (const [cls, vals] of Object.entries(s.facts)) {
      for (const v of vals) {
        const k = `${cls}:${v}`;
        if (!all.has(k)) all.set(k, new Set());
        all.get(k).add(id);
      }
    }
  }
  return all;
};
const baseFacts = flatten(base);
const liveFacts = flatten(live);

/**
 * Fact tokens whose loss is the EXTRACTOR misreading adjacent words as one quantity, not a real
 * regression, so they are excused from the document-wide "must not leave" rule below.
 *
 * Entries go stale at the next re-baseline, exactly like KNOWN_REPLACED_URLS in verify-runbook.mjs:
 * once the phrase that produced the false match is gone from the baseline too, this key stops
 * appearing in `goneFromDocument` on its own, and the check below says so rather than trusting
 * anyone to remember to remove it. `unitQuantities:1 day` was the one entry and it went stale at
 * the 2026-08-22 re-baseline, exactly that way; the set is empty until the next false match.
 */
const KNOWN_FALSE_POSITIVE_FACTS = new Map([
  // Emptied at the 2026-10-02 re-baseline, which retired `integers:8217` (DON&#8217;T apostrophe
  // entity) and `integers:183` (DON&#183; middot entity in the retired routing diagram) exactly as
  // their comments predicted: neither entity is in the baseline any more.
  //
  // 2026-10-08: reference [109] moved from uber.com/en-US/blog/scaling-ai-cost-efficiency/ (406) to
  // uber.com/au/en/blog/efficient-software-factory/ (same post; KNOWN_REPLACED_URLS in
  // verify-runbook.mjs records the move). The extractor had read two fragments of the OLD url as
  // identifier facts; the claims the citation supports (7x, 9.4x, 34%, 52%) are untouched.
  ['identifiers:US', 'locale segment of the retired en-US Uber url, not a claim'],
  ['identifiers:scaling-ai-cost-efficiency', 'slug of the retired Uber url, not a claim'],
]);

/**
 * Exact, section-scoped replacements for claims intentionally retired since the archive baseline.
 *
 * A many-to-one old-token -> new-token map is unsafe: one surviving C_month token could excuse an
 * entire deleted worked example. The sealed manifest below names every exact owning section/fact
 * pair and binds that owner directly to one or more reviewed facts or phrases in the same section.
 * No owner inherits a generic contract-level evidence pool. A missing owner, stale retirement,
 * altered relationship, or unsealed manifest fails closed before owner accounting.
 */
const { createHash } = await import('node:crypto');

const reviewedFact = (value) => ({ kind: 'fact', value });
const reviewedPhrase = (value) => ({ kind: 'phrase', value });
const reviewedOwner = (factKey, ...evidence) => ({ factKey, evidence });

/**
 * Reviewed section-local evidence descriptors referenced by the manifest below. Empty since the
 * 2026-10-02 re-baseline. The 2026-08-22 -> 2026-10-02 set (seat-tier source repair, subagent range
 * retirement, GPT-5.6 routing prices, batch cost model, cache minimum range, converse cache counters,
 * configured-router recommendation, ...) is in git history at commit 6de6a5e.
 */
const EVIDENCE = Object.freeze({});

/**
 * Manual semantic-review boundary for intentional fact retirement.
 *
 * Every exact baseline (section, factKey) owner is listed below and carries its own approved,
 * section-local evidence descriptors. There is deliberately no contract-level evidence pool: a
 * reviewer approves every owner-to-evidence relationship. Canonical JSON for this complete manifest
 * is SHA-256 sealed. Adding a contract, changing an owner, or changing any evidence relationship
 * fails before owner accounting unless a reviewer also updates the seal in verifier source.
 *
 * Updating malicious data and the seal together is outside the runtime verifier threat model: that
 * is a verifier-source change and therefore requires normal human code review.
 */
const REVIEWED_FACT_REPLACEMENT_MANIFEST = {
  schemaVersion: 1,
  reviewBoundary: 'Every retired section/fact owner is manually bound to exact new section-local evidence.',
  // No retirements since the 2026-10-02 baseline (archive/index-2026-10-02-track2-consolidation-*.html).
  // That snapshot absorbed the Track 2 consolidation and its 18 contracts / 92 owners, which all went
  // stale the moment the live file became the floor. The archive README row for 2026-10-02 records
  // what left the document and why; add a new contract here the next time a fact is retired on purpose.
  contracts: []
};

const canonicalJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(
      (key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    ).join(',')}}`;
  }
  return JSON.stringify(value);
};
const reviewedManifestSha256 = (manifest) => createHash('sha256')
  .update(canonicalJson(manifest))
  .digest('hex');
const REVIEWED_FACT_REPLACEMENT_MANIFEST_SHA256 = '1e5689e01f01a3ce8df2f43626ac9af467f929d56137506329a01aacd3c506ea';
const FACT_REPLACEMENT_CONTRACTS = REVIEWED_FACT_REPLACEMENT_MANIFEST.contracts;

/**
 * A rewritten section may be shorter than the archive only under a locked claim contract. Absolute
 * word floors sit just below the reviewed text rather than weakening the archive-relative guard to
 * 36% (or any broad ratio). Required phrases capture trade-offs a raw token inventory cannot see.
 */
const SECTION_REWRITE_CONTRACTS = [
  // Empty since the 2026-10-02 re-baseline: the five Track 2 "current-facts" contracts (routing, batch,
  // quota, lifecycle, cache) pinned sections the consolidation rewrote and shortened; against the new
  // baseline nothing has shrunk, so the floors would be no-ops and the required phrases are history.
];


/**
 * A reviewed relocation is deliberately stricter than "the key exists somewhere else". The
 * destination must be a newly added owner for the same key, and one destination owner may cover
 * only one retired source owner. Current owner changes are replacements; positional moves caused by an inserted lever are listed here.
 */
const FACT_RELOCATION_CONTRACTS = [
  // Empty since the 2026-10-19 re-baseline: the issue #39 "Export as PDF" positional move is part
  // of the baseline now, so its relocation contract would fail as stale.
];

const splitFactKey = (key) => {
  const at = key.indexOf(':');
  return [key.slice(0, at), key.slice(at + 1)];
};
const sectionHasFact = (sections, sectionId, key) => {
  const section = sections[sectionId];
  if (!section) return false;
  const [kind, value] = splitFactKey(key);
  return (section.facts[kind] || []).includes(value);
};
const normalizedSectionText = (sections, sectionId) =>
  (sections[sectionId]?._text || '').toLowerCase().replace(/\s+/g, ' ').trim();
const inspectSectionContract = (contract, candidateSections) => {
  const section = candidateSections[contract.section];
  const text = normalizedSectionText(candidateSections, contract.section);
  const missingFacts = (contract.requiredFacts || []).filter(
    (key) => !sectionHasFact(candidateSections, contract.section, key)
  );
  const missingPhrases = (contract.requiredPhrases || []).filter(
    (phrase) => !text.includes(phrase.toLowerCase())
  );
  const words = section?.style.words || 0;
  return {
    ok: !!section && (!contract.minWords || words >= contract.minWords)
      && missingFacts.length === 0 && missingPhrases.length === 0,
    words, missingFacts, missingPhrases
  };
};
const inspectEvidenceDescriptor = (descriptor, candidateSections, sectionId) => {
  const keys = descriptor && typeof descriptor === 'object'
    ? Object.keys(descriptor).sort().join(',') : '';
  const shapeOk = keys === 'kind,value'
    && ['fact', 'phrase'].includes(descriptor.kind)
    && typeof descriptor.value === 'string' && descriptor.value.length > 0;
  const currentText = normalizedSectionText(candidateSections, sectionId);
  const baselineText = normalizedSectionText(base, sectionId);
  const present = shapeOk && (descriptor.kind === 'fact'
    ? sectionHasFact(candidateSections, sectionId, descriptor.value)
    : currentText.includes(descriptor.value.toLowerCase()));
  const presentInBaselineOwner = shapeOk && (descriptor.kind === 'fact'
    ? sectionHasFact(base, sectionId, descriptor.value)
    : baselineText.includes(descriptor.value.toLowerCase()));
  return { ok: shapeOk && present && !presentInBaselineOwner,
    shapeOk, present, presentInBaselineOwner, descriptor };
};

const inspectReplacementContract = (contract, candidateSections) => {
  const owners = Array.isArray(contract.owners) ? contract.owners : [];
  const seenOwnerKeys = new Set();
  const duplicateOwnerKeys = [];
  const ownerStatuses = new Map();
  for (const owner of owners) {
    if (seenOwnerKeys.has(owner.factKey)) duplicateOwnerKeys.push(owner.factKey);
    seenOwnerKeys.add(owner.factKey);
    const evidence = Array.isArray(owner.evidence) ? owner.evidence : [];
    const evidenceStatuses = evidence.map(
      (descriptor) => inspectEvidenceDescriptor(descriptor, candidateSections, contract.section)
    );
    const sourceWasOwner = baseFacts.get(owner.factKey)?.has(contract.section) || false;
    const sourceStillOwner = sectionHasFact(candidateSections, contract.section, owner.factKey);
    ownerStatuses.set(owner.factKey, {
      ok: sourceWasOwner && !sourceStillOwner && evidence.length > 0
        && evidenceStatuses.every((status) => status.ok),
      sourceWasOwner,
      sourceStillOwner,
      evidenceCount: evidence.length,
      evidenceStatuses
    });
  }
  const statuses = [...ownerStatuses.values()];
  return {
    ok: Boolean(candidateSections[contract.section]) && owners.length > 0
      && duplicateOwnerKeys.length === 0 && statuses.every((status) => status.ok),
    owners,
    ownerStatuses,
    retiredHere: owners.filter((owner) => ownerStatuses.get(owner.factKey)?.sourceWasOwner
      && !ownerStatuses.get(owner.factKey)?.sourceStillOwner).map((owner) => owner.factKey),
    stillPresentRetirements: owners.filter(
      (owner) => ownerStatuses.get(owner.factKey)?.sourceStillOwner
    ).map((owner) => owner.factKey),
    emptyEvidenceOwners: owners.filter(
      (owner) => ownerStatuses.get(owner.factKey)?.evidenceCount === 0
    ).map((owner) => owner.factKey),
    missingBaselineOwners: owners.filter(
      (owner) => !ownerStatuses.get(owner.factKey)?.sourceWasOwner
    ).map((owner) => owner.factKey),
    invalidEvidence: owners.flatMap((owner) =>
      (ownerStatuses.get(owner.factKey)?.evidenceStatuses || [])
        .filter((status) => !status.shapeOk)
        .map((status) => `${owner.factKey}=>${JSON.stringify(status.descriptor)}`)),
    missingEvidence: owners.flatMap((owner) =>
      (ownerStatuses.get(owner.factKey)?.evidenceStatuses || [])
        .filter((status) => status.shapeOk && !status.present)
        .map((status) => `${owner.factKey}=>${status.descriptor.kind}:${status.descriptor.value}`)),
    baselineOldEvidence: owners.flatMap((owner) =>
      (ownerStatuses.get(owner.factKey)?.evidenceStatuses || [])
        .filter((status) => status.shapeOk && status.presentInBaselineOwner)
        .map((status) => `${owner.factKey}=>${status.descriptor.kind}:${status.descriptor.value}`)),
    duplicateOwnerKeys
  };
};

const sectionContractStatus = new Map(SECTION_REWRITE_CONTRACTS.map(
  (contract) => [contract.id, inspectSectionContract(contract, live)]
));
for (const contract of SECTION_REWRITE_CONTRACTS) {
  const status = sectionContractStatus.get(contract.id);
  if (!status.ok) failures.push(
    `${contract.section}: reviewed rewrite contract ${contract.id} failed`
    + ` (words ${status.words}/${contract.minWords}; missing facts: ${status.missingFacts.join(', ') || 'none'}`
    + `; missing phrases: ${status.missingPhrases.join(' | ') || 'none'})`
  );
}

const retirementOwnershipKey = (section, fact) => `${section}\u0000${fact}`;
const baselineOwnerPairs = [];
for (const [key, owners] of baseFacts) {
  for (const section of owners) baselineOwnerPairs.push({ section, key });
}

/** Production and adversarial candidates both use this exact owner-accounting path. */
const inspectReviewedManifestSeal = (
  manifest,
  expectedSha256 = REVIEWED_FACT_REPLACEMENT_MANIFEST_SHA256
) => {
  const actualSha256 = reviewedManifestSha256(manifest);
  return {
    ok: actualSha256 === expectedSha256,
    expectedSha256,
    actualSha256
  };
};

/** Production and adversarial candidates both use this exact sealed owner-accounting path. */
const evaluateOwnerIntegrity = (
  candidateSections,
  replacementManifest = REVIEWED_FACT_REPLACEMENT_MANIFEST,
  relocationContracts = FACT_RELOCATION_CONTRACTS,
  expectedManifestSha256 = REVIEWED_FACT_REPLACEMENT_MANIFEST_SHA256
) => {
  const manifestSeal = inspectReviewedManifestSeal(replacementManifest, expectedManifestSha256);
  const emptyAccounting = {
    retained: [], replaced: [], relocated: [], exempt: [], uncovered: [], multiplyCovered: []
  };
  if (!manifestSeal.ok) {
    return {
      candidateFacts: new Map(),
      errors: [
        `reviewed fact-replacement manifest seal mismatch: expected ${manifestSeal.expectedSha256}, actual ${manifestSeal.actualSha256}; owner accounting skipped`
      ],
      manifestSeal,
      ownerAccountingSkipped: true,
      replacementStatus: new Map(),
      replacementByRetiredOwnership: new Map(),
      relocationStatus: new Map(),
      relocationByRetiredOwnership: new Map(),
      accounting: emptyAccounting,
      accountedCount: 0,
      complete: false
    };
  }

  const candidateFacts = flatten(candidateSections);
  const errors = [];
  const replacementStatus = new Map();
  const replacementByRetiredOwnership = new Map();
  const replacementIds = new Set();
  const replacementContracts = Array.isArray(replacementManifest.contracts)
    ? replacementManifest.contracts : [];
  if (replacementManifest.schemaVersion !== 1) {
    errors.push(`unsupported reviewed fact-replacement manifest schema: ${replacementManifest.schemaVersion}`);
  }
  // An empty manifest is legitimate immediately after a re-baseline. It cannot hide a loss: every
  // baseline owner pair that is not retained is reported as uncovered below.

  for (const contract of replacementContracts) {
    if (replacementIds.has(contract.id)) errors.push(`duplicate replacement contract id: ${contract.id}`);
    replacementIds.add(contract.id);
    const status = inspectReplacementContract(contract, candidateSections);
    replacementStatus.set(contract.id, status);
    for (const owner of contract.owners || []) {
      const ownership = retirementOwnershipKey(contract.section, owner.factKey);
      const claims = replacementByRetiredOwnership.get(ownership) || [];
      claims.push({ contract, owner });
      replacementByRetiredOwnership.set(ownership, claims);
      if (claims.length > 1) errors.push(
        `${contract.section}: retired fact ${owner.factKey} is claimed by more than one reviewed owner mapping`
      );
    }
    if (!status.ok) errors.push(
      `${contract.section}: reviewed fact replacement contract ${contract.id} failed`
      + ` (current retired owners: ${status.retiredHere.length}/${status.owners.length}`
      + `; still-present retirements: ${status.stillPresentRetirements.join(', ') || 'none'}`
      + `; empty evidence owners: ${status.emptyEvidenceOwners.join(', ') || 'none'}`
      + `; missing evidence: ${status.missingEvidence.join(' | ') || 'none'}`
      + `; baseline-old evidence: ${status.baselineOldEvidence.join(' | ') || 'none'}`
      + `; invalid evidence: ${status.invalidEvidence.join(' | ') || 'none'}`
      + `; non-owner retirements: ${status.missingBaselineOwners.join(', ') || 'none'}`
      + `; duplicate owner mappings: ${status.duplicateOwnerKeys.join(', ') || 'none'})`
    );
  }

  const relocationStatus = new Map();
  const relocationByRetiredOwnership = new Map();
  const relocationDestinations = new Map();
  const relocationIds = new Set();
  for (const contract of relocationContracts) {
    if (relocationIds.has(contract.id)) errors.push(`duplicate relocation contract id: ${contract.id}`);
    relocationIds.add(contract.id);
    const sourceOwnership = retirementOwnershipKey(contract.fromSection, contract.fact);
    const destinationOwnership = retirementOwnershipKey(contract.toSection, contract.fact);
    const sourceWasOwner = baseFacts.get(contract.fact)?.has(contract.fromSection) || false;
    const sourceStillOwner = candidateFacts.get(contract.fact)?.has(contract.fromSection) || false;
    const destinationWasOwner = baseFacts.get(contract.fact)?.has(contract.toSection) || false;
    const destinationIsOwner = candidateFacts.get(contract.fact)?.has(contract.toSection) || false;
    const status = { ok: sourceWasOwner && !sourceStillOwner && !destinationWasOwner && destinationIsOwner,
      sourceWasOwner, sourceStillOwner, destinationWasOwner, destinationIsOwner };
    relocationStatus.set(contract.id, status);
    if (relocationByRetiredOwnership.has(sourceOwnership)) errors.push(
      `${contract.fromSection}: fact relocation ${contract.fact} has duplicate source contracts`
    );
    relocationByRetiredOwnership.set(sourceOwnership, contract);
    if (relocationDestinations.has(destinationOwnership)) errors.push(
      `${contract.toSection}: fact relocation ${contract.fact} reuses one destination for multiple source owners`
    );
    relocationDestinations.set(destinationOwnership, contract);
    if (!status.ok) errors.push(
      `${contract.fromSection}: reviewed relocation contract ${contract.id} failed for ${contract.fact} -> ${contract.toSection}`
      + ` (source baseline/live: ${sourceWasOwner}/${sourceStillOwner}; destination baseline/live: `
      + `${destinationWasOwner}/${destinationIsOwner})`
    );
  }

  const accounting = {
    retained: [], replaced: [], relocated: [], exempt: [], uncovered: [], multiplyCovered: []
  };
  for (const pair of baselineOwnerPairs) {
    if (candidateFacts.get(pair.key)?.has(pair.section)) {
      accounting.retained.push(pair);
      continue;
    }
    const ownership = retirementOwnershipKey(pair.section, pair.key);
    const matches = [];
    for (const claim of replacementByRetiredOwnership.get(ownership) || []) {
      const ownerStatus = replacementStatus.get(claim.contract.id)?.ownerStatuses.get(claim.owner.factKey);
      if (ownerStatus?.ok) matches.push({ kind: 'replaced', contractId: claim.contract.id });
    }
    const relocation = relocationByRetiredOwnership.get(ownership);
    if (relocation && relocationStatus.get(relocation.id)?.ok
      && candidateFacts.get(pair.key)?.has(relocation.toSection)) {
      matches.push({ kind: 'relocated', contractId: relocation.id, toSection: relocation.toSection });
    }
    if (KNOWN_FALSE_POSITIVE_FACTS.has(pair.key) && !candidateFacts.has(pair.key)) {
      matches.push({ kind: 'exempt', contractId: 'known-extractor-artefact' });
    }
    if (matches.length === 0) accounting.uncovered.push(pair);
    else if (matches.length > 1) accounting.multiplyCovered.push({ ...pair, matches });
    else accounting[matches[0].kind].push({ ...pair, ...matches[0] });
  }
  const accountedCount = accounting.retained.length + accounting.replaced.length
    + accounting.relocated.length + accounting.exempt.length;
  const complete = errors.length === 0 && accountedCount === baselineOwnerPairs.length
    && accounting.uncovered.length === 0 && accounting.multiplyCovered.length === 0;
  return { candidateFacts, errors, manifestSeal, ownerAccountingSkipped: false,
    replacementStatus, replacementByRetiredOwnership, relocationStatus,
    relocationByRetiredOwnership, accounting, accountedCount, complete };
};

const issue33ExpectedManifestSha256 = process.env.ISSUE33_VERIFY_TEST_MODE === 'manifest-seal-mismatch'
  ? '0'.repeat(64)
  : REVIEWED_FACT_REPLACEMENT_MANIFEST_SHA256;
const productionOwnerIntegrity = evaluateOwnerIntegrity(
  live,
  REVIEWED_FACT_REPLACEMENT_MANIFEST,
  FACT_RELOCATION_CONTRACTS,
  issue33ExpectedManifestSha256
);
for (const error of productionOwnerIntegrity.errors) failures.push(error);
const replacementStatus = productionOwnerIntegrity.replacementStatus;
const replacementByRetiredOwnership = productionOwnerIntegrity.replacementByRetiredOwnership;
const relocationStatus = productionOwnerIntegrity.relocationStatus;
const relocationByRetiredOwnership = productionOwnerIntegrity.relocationByRetiredOwnership;
const ownerAccounting = productionOwnerIntegrity.accounting;
const ownerAccountedCount = productionOwnerIntegrity.accountedCount;
const ownerAccountingComplete = productionOwnerIntegrity.complete;
if (!ownerAccountingComplete) failures.push(
  `baseline section/fact owner accounting failed: ${ownerAccountedCount}/${baselineOwnerPairs.length} covered exactly once`
  + `; uncovered: ${ownerAccounting.uncovered.slice(0, 10).map((p) => `${p.section}:${p.key}`).join(', ') || 'none'}`
  + `; multiply covered: ${ownerAccounting.multiplyCovered.slice(0, 10).map((p) => `${p.section}:${p.key}`).join(', ') || 'none'}`
);

const retirementCoverage = new Map();
const inspectRetirementCoverage = (key) => {
  if (retirementCoverage.has(key)) return retirementCoverage.get(key);
  const baselineOwners = [...(baseFacts.get(key) || [])];
  const uncoveredOwners = [], failedOwners = [], multiplyCoveredOwners = [];
  for (const section of baselineOwners) {
    const claims = replacementByRetiredOwnership.get(retirementOwnershipKey(section, key)) || [];
    const passing = claims.filter((claim) =>
      replacementStatus.get(claim.contract.id)?.ownerStatuses.get(claim.owner.factKey)?.ok
    );
    if (claims.length === 0) uncoveredOwners.push(section);
    else if (passing.length === 0) failedOwners.push(section);
    else if (passing.length > 1) multiplyCoveredOwners.push(section);
  }
  const coverage = { ok: baselineOwners.length > 0 && uncoveredOwners.length === 0
      && failedOwners.length === 0 && multiplyCoveredOwners.length === 0,
    baselineOwners, uncoveredOwners, failedOwners, multiplyCoveredOwners };
  retirementCoverage.set(key, coverage);
  return coverage;
};
const excusedByReplacement = (key) => inspectRetirementCoverage(key).ok;

// Positive proof: the reviewed Track 1 range retirement is section-owned even though the same
// unique key remains in an unrelated Track 2 section. The adversarial proofs below mutate this same
// contract, so they are only applicable while the manifest carries it. Immediately after a
// re-baseline the manifest is empty and there is nothing to mutate: those proofs report as not
// applicable (null) rather than pass. If contracts exist but this fixture does not, fail closed so
// the fixture is re-pointed at a current contract instead of silently skipping the proofs.
const f1Section = 'manage-the-session-and-its-context-actively';
const f1Fact = 'percentages:60 per cent';
const f1ContractId = 'track1-subagent-range-retirement';
const RETIREMENT_PROOFS_APPLICABLE = FACT_REPLACEMENT_CONTRACTS.length > 0;
const retirementFixturePresent = FACT_REPLACEMENT_CONTRACTS.some((contract) => contract.id === f1ContractId
  && contract.owners.some((owner) => owner.factKey === f1Fact));
if (RETIREMENT_PROOFS_APPLICABLE && (!retirementFixturePresent || SECTION_REWRITE_CONTRACTS.length === 0)) {
  failures.push(`retirement proof fixture is missing: point f1ContractId/f1Section/f1Fact and at least one SECTION_REWRITE_CONTRACTS entry at current contracts`);
}
const f1OwnerProof = ownerAccounting.replaced.find(
  (p) => p.section === f1Section && p.key === f1Fact
    && p.contractId === f1ContractId
);
const f1OwnerProofPassed = RETIREMENT_PROOFS_APPLICABLE
  ? Boolean(f1OwnerProof) && liveFacts.has(f1Fact) && !liveFacts.get(f1Fact).has(f1Section)
  : null;

// Full-production-path adversarial proofs. Every HTML candidate is re-extracted and evaluated by
// evaluateOwnerIntegrity(), the same sealed production path used above. Tests that deliberately
// change verifier manifest data can supply the matching test seal only to exercise the independent
// mechanical checks. Changing malicious data and the production seal together remains a verifier-
// source change that normal code review must reject.
const cloneManifest = () => structuredClone(REVIEWED_FACT_REPLACEMENT_MANIFEST);
const findManifestOwner = (manifest, contractId, factKey) => {
  const contract = manifest.contracts.find((entry) => entry.id === contractId);
  return { contract, owner: contract?.owners.find((entry) => entry.factKey === factKey) };
};
const evaluateResealedManifest = (candidateSections, manifest, relocations = FACT_RELOCATION_CONTRACTS) =>
  evaluateOwnerIntegrity(candidateSections, manifest, relocations, reviewedManifestSha256(manifest));
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mutateSectionHtml = (source, sectionId, mutate) => {
  const marks = [...source.matchAll(/<h[1-4]\s+id=["']([^"']+)["']|data-fact-owner=["']([^"']+)["']/gi)]
    .map((match) => ({
      id: match[1] || match[2],
      index: match[1] ? match.index : source.lastIndexOf('<', match.index)
    }))
    .filter((mark, index, all) => index === 0 || mark.index !== all[index - 1].index);
  const targets = marks.map((mark, index) => ({
    ...mark,
    end: index + 1 < marks.length ? marks[index + 1].index : source.length
  })).filter((mark) => mark.id === sectionId);
  if (!targets.length) return source;
  let out = source;
  for (const target of targets.reverse()) {
    out = out.slice(0, target.index) + mutate(out.slice(target.index, target.end)) + out.slice(target.end);
  }
  return out;
};
const manifestOwnerCount = FACT_REPLACEMENT_CONTRACTS.reduce(
  (count, contract) => count + contract.owners.length, 0
);
const manifestOwnerships = FACT_REPLACEMENT_CONTRACTS.flatMap((contract) =>
  contract.owners.map((owner) => retirementOwnershipKey(contract.section, owner.factKey))
);
const manifestSealProofPassed = productionOwnerIntegrity.manifestSeal.ok;
const manifestInventoryProofPassed = FACT_REPLACEMENT_CONTRACTS.length === 0
  && manifestOwnerCount === 0 && new Set(manifestOwnerships).size === 0;

const f1MutationOwner = { section: '(front matter)', key: 'integers:35' };
const removeFrontMatter35 = (source) => source
  .replace('This runbook holds 35 of them.', 'This runbook holds thirty-five of them.')
  .replace('names all 35, with what each one saves', 'names all thirty-five, with what each one saves');
const ownerDeletedRaw = removeFrontMatter35(liveRaw);
const ownerDeletedSections = extract(ownerDeletedRaw);
const ownerMutationPrepared = !sectionHasFact(
  ownerDeletedSections, f1MutationOwner.section, f1MutationOwner.key
);

const unrelatedPhrase = 'mutation-only unrelated same-section replacement evidence';
const unrelatedOwnerDeletedRaw = removeFrontMatter35(
  liveRaw.replace(/\n<body([^>]*)>/i, `\n<body$1><p>${unrelatedPhrase}</p>`)
);
const unrelatedOwnerDeletedSections = extract(unrelatedOwnerDeletedRaw);
const unrelatedEvidenceDeletionResult = evaluateOwnerIntegrity(unrelatedOwnerDeletedSections);
const unrelatedEvidenceDeletionProofPassed = ownerMutationPrepared
  && normalizedSectionText(unrelatedOwnerDeletedSections, f1MutationOwner.section).includes(unrelatedPhrase)
  && unrelatedEvidenceDeletionResult.accounting.uncovered.some(
    (pair) => pair.section === f1MutationOwner.section && pair.key === f1MutationOwner.key
  ) && !unrelatedEvidenceDeletionResult.complete;

const appendedManifest = cloneManifest();
appendedManifest.contracts.push({
  id: 'mutation-unreviewed-frontmatter-35',
  section: f1MutationOwner.section,
  owners: [reviewedOwner(f1MutationOwner.key, reviewedPhrase(unrelatedPhrase))]
});
const appendedManifestResult = evaluateOwnerIntegrity(unrelatedOwnerDeletedSections, appendedManifest);
const appendedManifestProofPassed = appendedManifestResult.ownerAccountingSkipped
  && appendedManifestResult.errors.some((error) => error.includes('manifest seal mismatch'));

// Proofs that mutate the retirement fixture. Null when not applicable (empty manifest).
let manifestMismatchDiagnosticProofPassed = null;
let alteredEvidenceSealProofPassed = null;
let staleContractProofPassed = null;
let evidenceFreeDeletionProofPassed = null;
let baselineEvidenceDeletionProofPassed = null;
let missingEvidenceProofPassed = null;
let crossSectionEvidenceProofPassed = null;
let duplicateCoverageProofPassed = null;
let globalSurvivalProofPassed = null;
let broadRewriteFloorProofPassed = null;
// The uncontracted-deletion proof needs no contract: it only needs the front-matter owner to exist.
const uncontractedDeletionResult = evaluateOwnerIntegrity(ownerDeletedSections);
const ownerMutationProofPassed = ownerMutationPrepared
  && uncontractedDeletionResult.accounting.uncovered.some(
    (pair) => pair.section === f1MutationOwner.section && pair.key === f1MutationOwner.key
  );
const ownerMutationProofLabel = `${f1MutationOwner.section}:${f1MutationOwner.key}`;
if (!RETIREMENT_PROOFS_APPLICABLE) {
  // With no contract to alter, prove the seal-mismatch diagnostic on the appended-contract candidate,
  // which is the one mutation that remains meaningful against an empty manifest.
  manifestMismatchDiagnosticProofPassed = appendedManifestResult.ownerAccountingSkipped === true
    && appendedManifestResult.replacementStatus instanceof Map
    && appendedManifestResult.replacementStatus.size === 0
    && appendedManifestResult.errors.length === 1
    && appendedManifestResult.errors[0].startsWith('reviewed fact-replacement manifest seal mismatch:')
    && appendedManifestResult.errors[0].endsWith('; owner accounting skipped');
  if (!manifestMismatchDiagnosticProofPassed) {
    failures.push('manifest seal mismatch did not return deterministic diagnostics with safely skipped contract details');
  }
} else if (retirementFixturePresent && SECTION_REWRITE_CONTRACTS.length > 0) {
  const alteredEvidenceManifest = cloneManifest();
  const alteredOwner = findManifestOwner(
    alteredEvidenceManifest, f1ContractId, f1Fact
  ).owner;
  alteredOwner.evidence = [reviewedPhrase('unreviewed altered evidence relationship')];
  const alteredEvidenceResult = evaluateOwnerIntegrity(live, alteredEvidenceManifest);
  manifestMismatchDiagnosticProofPassed = alteredEvidenceResult.ownerAccountingSkipped === true
    && alteredEvidenceResult.replacementStatus instanceof Map
    && alteredEvidenceResult.replacementStatus.size === 0
    && alteredEvidenceResult.errors.length === 1
    && alteredEvidenceResult.errors[0].startsWith('reviewed fact-replacement manifest seal mismatch:')
    && alteredEvidenceResult.errors[0].endsWith('; owner accounting skipped');
  if (!manifestMismatchDiagnosticProofPassed) {
    failures.push('manifest seal mismatch did not return deterministic diagnostics with safely skipped contract details');
  }
  alteredEvidenceSealProofPassed = alteredEvidenceResult.ownerAccountingSkipped
    && alteredEvidenceResult.errors.some((error) => error.includes('manifest seal mismatch'));

  const staleRaw = mutateSectionHtml(liveRaw, f1Section, (section) => section.replace(
    /Codex subagents consume more tokens than comparable single-agent runs/i,
    (match) => `${match}; the retired estimate was 60 per cent`
  ));
  const staleSections = extract(staleRaw);
  const staleContractResult = evaluateOwnerIntegrity(staleSections);
  staleContractProofPassed = sectionHasFact(staleSections, f1Section, f1Fact)
    && staleContractResult.errors.some((error) => error.includes('still-present retirements'))
    && !staleContractResult.complete;

  const evidenceFreeManifest = cloneManifest();
  findManifestOwner(evidenceFreeManifest, f1ContractId, f1Fact).owner.evidence = [];
  const evidenceFreeDeletionResult = evaluateResealedManifest(live, evidenceFreeManifest);
  evidenceFreeDeletionProofPassed = evidenceFreeDeletionResult.errors.some(
    (error) => error.includes('empty evidence owners') && error.includes(f1Fact)
  ) && !evidenceFreeDeletionResult.complete;

  const baselineOldManifest = cloneManifest();
  const baselineOldFact = Object.entries(base[f1Section].facts).flatMap(([kind, values]) =>
    values.map((value) => `${kind}:${value}`)
  ).find((key) => sectionHasFact(live, f1Section, key));
  findManifestOwner(baselineOldManifest, f1ContractId, f1Fact).owner.evidence = [
    reviewedFact(baselineOldFact)
  ];
  const baselineEvidenceDeletionResult = evaluateResealedManifest(live, baselineOldManifest);
  baselineEvidenceDeletionProofPassed = Boolean(baselineOldFact)
    && baselineEvidenceDeletionResult.errors.some((error) => error.includes('baseline-old evidence'))
    && !baselineEvidenceDeletionResult.complete;

  const missingEvidenceManifest = cloneManifest();
  findManifestOwner(missingEvidenceManifest, f1ContractId, f1Fact).owner.evidence = [
    reviewedPhrase('mutation evidence that is absent from the document')
  ];
  const missingEvidenceResult = evaluateResealedManifest(live, missingEvidenceManifest);
  missingEvidenceProofPassed = missingEvidenceResult.errors.some(
    (error) => error.includes('missing evidence') && error.includes(f1Fact)
  ) && !missingEvidenceResult.complete;

  // Evidence that is present in SOME other live section but not in the fixture's own section. Chosen
  // from the live document rather than named, so the proof survives the manifest being re-sealed.
  const crossSectionEvidence = Object.entries(live)
    .filter(([id]) => id !== f1Section)
    .flatMap(([id, section]) => Object.entries(section.facts).flatMap(([kind, values]) =>
      values.map((value) => ({ id, key: `${kind}:${value}` }))))
    .find(({ key }) => !sectionHasFact(live, f1Section, key));
  const crossSectionManifest = cloneManifest();
  findManifestOwner(crossSectionManifest, f1ContractId, f1Fact).owner.evidence = [
    reviewedFact(crossSectionEvidence?.key || 'identifiers:mutation-no-cross-section-evidence')
  ];
  const crossSectionResult = evaluateResealedManifest(live, crossSectionManifest);
  crossSectionEvidenceProofPassed = Boolean(crossSectionEvidence)
    && sectionHasFact(live, crossSectionEvidence.id, crossSectionEvidence.key)
    && !sectionHasFact(live, f1Section, crossSectionEvidence.key)
    && crossSectionResult.errors.some((error) => error.includes('missing evidence'))
    && !crossSectionResult.complete;


  const duplicateCoverageManifest = cloneManifest();
  const duplicateSource = findManifestOwner(
    duplicateCoverageManifest, f1ContractId, f1Fact
  ).owner;
  duplicateCoverageManifest.contracts.push({
    id: 'mutation-duplicate-owner-coverage',
    section: f1Section,
    owners: [structuredClone(duplicateSource)]
  });
  const duplicateCoverageResult = evaluateResealedManifest(live, duplicateCoverageManifest);
  duplicateCoverageProofPassed = duplicateCoverageResult.errors.some(
    (error) => error.includes('more than one reviewed owner mapping')
  ) && duplicateCoverageResult.accounting.multiplyCovered.some(
    (pair) => pair.section === f1Section && pair.key === f1Fact
  ) && !duplicateCoverageResult.complete;

  const globalSurvivalManifest = cloneManifest();
  const globalSurvivalContract = globalSurvivalManifest.contracts.find(
    (contract) => contract.id === f1ContractId
  );
  globalSurvivalContract.owners = globalSurvivalContract.owners.filter(
    (owner) => owner.factKey !== f1Fact
  );
  const globalSurvivalResult = evaluateResealedManifest(live, globalSurvivalManifest);
  globalSurvivalProofPassed = liveFacts.has(f1Fact) && !liveFacts.get(f1Fact).has(f1Section)
    && globalSurvivalResult.accounting.uncovered.some(
      (pair) => pair.section === f1Section && pair.key === f1Fact
    ) && !globalSurvivalResult.complete;

  const rewriteSections = new Set(SECTION_REWRITE_CONTRACTS.map((contract) => contract.section));
  const broadFloorOwner = baselineOwnerPairs.find((pair) => rewriteSections.has(pair.section)
    && pair.key.startsWith('citations:') && sectionHasFact(live, pair.section, pair.key));
  const broadFloorRef = broadFloorOwner?.key.slice('citations:'.length);
  const broadFloorRaw = broadFloorOwner ? mutateSectionHtml(liveRaw, broadFloorOwner.section, (section) =>
    section.replace(new RegExp(`href=["']#${escapeRegExp(broadFloorRef)}["']`, 'g'), `href="#mutation-${broadFloorRef}"`)
  ) : liveRaw;
  const broadFloorSections = extract(broadFloorRaw);
  const broadFloorRewrite = broadFloorOwner && SECTION_REWRITE_CONTRACTS.find(
    (contract) => contract.section === broadFloorOwner.section
  );
  const broadFloorResult = evaluateOwnerIntegrity(broadFloorSections);
  broadRewriteFloorProofPassed = Boolean(broadFloorOwner && broadFloorRewrite)
    && inspectSectionContract(broadFloorRewrite, broadFloorSections).ok
    && !sectionHasFact(broadFloorSections, broadFloorOwner.section, broadFloorOwner.key)
    && broadFloorResult.accounting.uncovered.some(
      (pair) => pair.section === broadFloorOwner.section && pair.key === broadFloorOwner.key
    ) && !broadFloorResult.complete;
}

const multiOwnerEntry = [...baseFacts.entries()].find(([, owners]) => owners.size >= 2);
const multiOwnerSections = multiOwnerEntry ? [...multiOwnerEntry[1]] : [];
const relocationDestination = multiOwnerEntry && Object.keys(base).find(
  (section) => !multiOwnerEntry[1].has(section)
);
const manyToOneRelocations = multiOwnerEntry && relocationDestination ? [
  { id: 'mutation-relocation-a', fact: multiOwnerEntry[0], fromSection: multiOwnerSections[0], toSection: relocationDestination },
  { id: 'mutation-relocation-b', fact: multiOwnerEntry[0], fromSection: multiOwnerSections[1], toSection: relocationDestination }
] : [];
const manyToOneResult = evaluateOwnerIntegrity(
  live, REVIEWED_FACT_REPLACEMENT_MANIFEST, manyToOneRelocations
);
const manyToOneRelocationProofPassed = manyToOneRelocations.length === 2
  && manyToOneResult.errors.some((error) => error.includes('reuses one destination for multiple source owners'))
  && !manyToOneResult.complete;

const currentContractsProofPassed = productionOwnerIntegrity.errors.length === 0
  && productionOwnerIntegrity.complete;
for (const [passed, label] of [
  [manifestSealProofPassed, 'reviewed manifest seal does not match its canonical JSON'],
  [manifestInventoryProofPassed, 'reviewed manifest inventory is not exactly 0 contracts / 0 unique owners'],
  [f1OwnerProofPassed, 'owner-pair positive proof failed for the exact Track 1 range retirement'],
  [unrelatedEvidenceDeletionProofPassed, 'full-path mutation accepted unrelated same-section evidence plus owner deletion'],
  [appendedManifestProofPassed, 'full-path mutation accepted an appended unreviewed contract without a seal update'],
  [alteredEvidenceSealProofPassed, 'full-path mutation accepted an altered evidence relationship without a seal update'],
  [staleContractProofPassed, 'full-path mutation accepted a stale still-present retirement'],
  [evidenceFreeDeletionProofPassed, 'full-path mutation accepted an empty owner evidence mapping'],
  [baselineEvidenceDeletionProofPassed, 'full-path mutation accepted baseline-old replacement evidence'],
  [missingEvidenceProofPassed, 'full-path mutation accepted missing replacement evidence'],
  [crossSectionEvidenceProofPassed, 'full-path mutation accepted evidence present only in another section'],
  [ownerMutationProofPassed, 'full-path mutation accepted an uncontracted owner deletion'],
  [duplicateCoverageProofPassed, 'full-path mutation accepted duplicate replacement coverage'],
  [globalSurvivalProofPassed, 'full-path mutation allowed global key survival to mask one owner loss'],
  [broadRewriteFloorProofPassed, 'full-path mutation allowed a broad rewrite floor to mask one owner loss'],
  [manyToOneRelocationProofPassed, 'full-path mutation accepted a many-to-one relocation'],
  [currentContractsProofPassed, 'full-path positive proof rejected the current sealed reviewed manifest']
]) {
  if (passed === false) failures.push(label);
}
const proofMark = (passed) => passed === null ? dim('–') : passed ? green('✓') : red('✖');
const notApplicable = dim(' (not applicable: no retirement contracts since the current baseline)');
const proofSuffix = (passed) => passed === null ? notApplicable : '';

const goneFromDocument = [...baseFacts.keys()].filter(
  (k) => !liveFacts.has(k) && !KNOWN_FALSE_POSITIVE_FACTS.has(k) && !excusedByReplacement(k)
);
const newInDocument = [...liveFacts.keys()].filter((k) => !baseFacts.has(k));
const moved = [...baseFacts.keys()]
  .filter((k) => liveFacts.has(k))
  .map((k) => {
    const from = [...baseFacts.get(k)];
    const to = [...liveFacts.get(k)];
    const left = from.filter((s) => !to.includes(s));
    return left.length && to.length ? { k, from: left, to } : null;
  })
  .filter(Boolean);

if (goneFromDocument.length) {
  failures.push(`${goneFromDocument.length} fact token(s) left the document — ${goneFromDocument.slice(0, 10).join(', ')}${goneFromDocument.length > 10 ? ', …' : ''}`);
}

// Per-section word counts still guard fact-free prose: a cliff means a paragraph was dropped even
// when it carried no extractable fact.
const perSection = [];
for (const [id, b] of Object.entries(base)) {
  const l = live[id];
  if (!l) continue;
  const dw = b.style.words ? (l.style.words - b.style.words) / b.style.words : 0;
  const rewrite = SECTION_REWRITE_CONTRACTS.find((contract) => contract.section === id);
  const acceptedRewrite = rewrite && sectionContractStatus.get(rewrite.id)?.ok;
  if (dw < SHRINK_LIMIT && !acceptedRewrite) {
    const suffix = rewrite ? `; exact rewrite contract ${rewrite.id} did not pass` : '';
    failures.push(`${id}: shrank ${(dw * 100).toFixed(0)}% (${b.style.words} → ${l.style.words} words) — a paragraph was probably dropped${suffix}`);
  }
  if (Math.abs(dw) > 0.1) perSection.push({ id, dw, b: b.style, l: l.style, acceptedRewrite });
}
for (const k of newInDocument) {
  const where = [...liveFacts.get(k)][0];
  warnings.push(`${where}: new fact — ${k}`);
}
const addedTotal = newInDocument.length;

console.log(bold('  Fact integrity'));
const baselineFactKeys = [...baseFacts.keys()];
const retainedFactKeys = baselineFactKeys.filter((key) => liveFacts.has(key));
const retiredFactKeys = baselineFactKeys.filter(
  (key) => !liveFacts.has(key) && excusedByReplacement(key)
);
const absentExemptFactKeys = baselineFactKeys.filter(
  (key) => !liveFacts.has(key) && KNOWN_FALSE_POSITIVE_FACTS.has(key)
);
const accountedFactCount = retainedFactKeys.length + retiredFactKeys.length + absentExemptFactKeys.length;
const accountedFactKeys = new Set([
  ...retainedFactKeys,
  ...retiredFactKeys,
  ...absentExemptFactKeys
]);
const multiplyAccountedFactKeys = baselineFactKeys.filter((key) =>
  Number(retainedFactKeys.includes(key))
  + Number(retiredFactKeys.includes(key))
  + Number(absentExemptFactKeys.includes(key)) > 1
);
const unaccountedFactKeys = baselineFactKeys.filter((key) => !accountedFactKeys.has(key));
const baselineAccountingComplete = accountedFactCount === baseFacts.size
  && accountedFactKeys.size === baseFacts.size
  && multiplyAccountedFactKeys.length === 0;
if (!baselineAccountingComplete) {
  failures.push(
    `baseline fact accounting invariant failed: ${retainedFactKeys.length} retained + `
    + `${retiredFactKeys.length} contract-retired + ${absentExemptFactKeys.length} absent exempt = `
    + `${accountedFactCount}, expected ${baseFacts.size} unique baseline keys`
    + `; unaccounted: ${unaccountedFactKeys.join(', ') || 'none'}`
    + `; multiply accounted: ${multiplyAccountedFactKeys.join(', ') || 'none'}`
  );
}
const retiredFactCount = retiredFactKeys.length;
const retiredOwnershipCount = retiredFactKeys.reduce(
  (count, key) => count + inspectRetirementCoverage(key).baselineOwners.length, 0
);
if (!goneFromDocument.length && !goneSections.length && baselineAccountingComplete) {
  console.log(`  ${green('✓')} ${retainedFactKeys.length} retained baseline fact tokens remain in the document`);
  console.log(
    `  ${green('✓')} ${retiredFactCount} contract-retired baseline fact tokens have all `
    + `${retiredOwnershipCount} baseline section ownerships covered by passing exact replacement contracts`
  );
  console.log(
    `  ${green('✓')} ${absentExemptFactKeys.length} absent baseline fact `
    + `${absentExemptFactKeys.length === 1 ? 'token is an exempt extractor artefact' : 'tokens are exempt extractor artefacts'}`
  );
  console.log(`  ${green('✓')} ${accountedFactCount}/${baseFacts.size} baseline fact tokens are accounted for exactly once`);
} else {
  console.log(
    `  ${red('✖')} baseline fact accounting failed `
    + `(${accountedFactCount} category entries for ${baseFacts.size} unique baseline keys)`
  );
}
console.log(`\n${bold('  Section/fact owner integrity')}`);
if (ownerAccountingComplete) {
  console.log(`  ${green('✓')} ${ownerAccounting.retained.length} baseline owner pairs remain in their original sections`);
  console.log(`  ${green('✓')} ${ownerAccounting.replaced.length} lost owner pairs have passing exact replacement contracts`);
  console.log(`  ${green('✓')} ${ownerAccounting.relocated.length} lost owner pairs have one-to-one reviewed relocation contracts`);
  console.log(`  ${green('✓')} ${ownerAccounting.exempt.length} lost owner pairs are exempt extractor artefacts`);
  console.log(`  ${green('✓')} ${ownerAccountedCount}/${baselineOwnerPairs.length} baseline owner pairs are accounted for exactly once`);
} else {
  console.log(`  ${red('✖')} ${ownerAccountedCount}/${baselineOwnerPairs.length} baseline owner pairs are accounted for exactly once`);
}
console.log(
  `  ${manifestSealProofPassed ? green('✓') : red('✖')} reviewed manifest SHA-256 seal: `
  + REVIEWED_FACT_REPLACEMENT_MANIFEST_SHA256
);
console.log(
  `  ${manifestInventoryProofPassed ? green('✓') : red('✖')} reviewed manifest inventory: `
  + `${FACT_REPLACEMENT_CONTRACTS.length} contracts, ${manifestOwnerCount} unique retired owners`
);
console.log(
  `  ${proofMark(f1OwnerProofPassed)} positive owner-retirement proof: `
  + `${f1ContractId} owns ${f1Section}:${f1Fact}${proofSuffix(f1OwnerProofPassed)}`
);
console.log(`  ${unrelatedEvidenceDeletionProofPassed ? green('✓') : red('✖')} full-path mutation rejects unrelated same-section evidence plus owner deletion`);
console.log(`  ${appendedManifestProofPassed ? green('✓') : red('✖')} full-path mutation rejects an appended contract without a reviewed seal update`);
console.log(`  ${proofMark(alteredEvidenceSealProofPassed)} full-path mutation rejects an altered owner/evidence relationship without a seal update${proofSuffix(alteredEvidenceSealProofPassed)}`);
console.log(`  ${manifestMismatchDiagnosticProofPassed ? green('✓') : red('✖')} manifest seal mismatch reports one actionable diagnostic and safely skips contract details`);
console.log(`  ${proofMark(staleContractProofPassed)} full-path mutation rejects a stale still-present retirement${proofSuffix(staleContractProofPassed)}`);
console.log(`  ${proofMark(evidenceFreeDeletionProofPassed)} full-path mutation rejects an empty owner evidence mapping${proofSuffix(evidenceFreeDeletionProofPassed)}`);
console.log(`  ${proofMark(baselineEvidenceDeletionProofPassed)} full-path mutation rejects baseline-old replacement evidence${proofSuffix(baselineEvidenceDeletionProofPassed)}`);
console.log(`  ${proofMark(missingEvidenceProofPassed)} full-path mutation rejects missing replacement evidence${proofSuffix(missingEvidenceProofPassed)}`);
console.log(`  ${proofMark(crossSectionEvidenceProofPassed)} full-path mutation rejects cross-section-only replacement evidence${proofSuffix(crossSectionEvidenceProofPassed)}`);
console.log(
  `  ${ownerMutationProofPassed ? green('✓') : red('✖')} full-path mutation rejects an uncontracted owner deletion: `
  + ownerMutationProofLabel
);
console.log(`  ${proofMark(duplicateCoverageProofPassed)} full-path mutation rejects duplicate replacement coverage${proofSuffix(duplicateCoverageProofPassed)}`);
console.log(`  ${proofMark(globalSurvivalProofPassed)} full-path mutation rejects global-key masking of an owner loss${proofSuffix(globalSurvivalProofPassed)}`);
console.log(`  ${proofMark(broadRewriteFloorProofPassed)} full-path mutation rejects a broad rewrite floor masking an owner loss${proofSuffix(broadRewriteFloorProofPassed)}`);
console.log(`  ${manyToOneRelocationProofPassed ? green('✓') : red('✖')} full-path mutation rejects a many-to-one relocation`);
console.log(`  ${currentContractsProofPassed ? green('✓') : red('✖')} full-path positive proof accepts the current sealed reviewed manifest`);
if (moved.length) {
  console.log(`\n${bold('  Lost section ownerships with the same key elsewhere')} ${dim('(each loss still requires an exact contract)')}`);
  for (const m of moved.slice(0, 15)) console.log(`  ${dim('→')} ${m.k}  ${dim(`${m.from.join(', ')} left; still present in ${m.to.join(', ')}`)}`);
  if (moved.length > 15) console.log(`  ${dim(`… and ${moved.length - 15} more`)}`);
}
for (const [key, reason] of KNOWN_FALSE_POSITIVE_FACTS) {
  if (!baseFacts.has(key)) {
    console.log(`  ${yellow('!')} false-positive exemption is stale — ${key} is no longer in the baseline, drop the entry`);
  } else if (absentExemptFactKeys.includes(key)) {
    console.log(`  ${dim('→')} ${dim(`absent exempt extractor artefact: ${key} (${reason})`)}`);
  } else {
    console.log(`  ${dim('→')} ${dim(`configured extractor artefact remains present and is not counted absent: ${key} (${reason})`)}`);
  }
}
for (const contract of FACT_REPLACEMENT_CONTRACTS) {
  const status = replacementStatus.get(contract.id);
  if (!status) {
    console.log(
      `  ${red('→')} ${red(`${contract.id}: SKIPPED — reviewed manifest seal mismatch; owner accounting was not evaluated`)}`
    );
    continue;
  }
  const paint = status.ok ? dim : red;
  console.log(
    `  ${paint('→')} ${paint(`${contract.id}: ${status.retiredHere.length}/${contract.owners.length} exact retired owner mapping(s), sealed per-owner evidence ${status.ok ? 'verified' : 'FAILED'}`)}`
  );
}
for (const contract of SECTION_REWRITE_CONTRACTS) {
  const status = sectionContractStatus.get(contract.id);
  const paint = status.ok ? dim : red;
  console.log(`  ${paint('→')} ${paint(`${contract.id}: ${status.words} words (floor ${contract.minWords}), required claims ${status.ok ? 'verified' : 'FAILED'}`)}`);
}

// --- 3. changed sections table --------------------------------------------
if (perSection.length) {
  console.log(`\n${bold('  Sections touched')}`);
  console.log(dim('  section                                          words        med  >35  colon  semi  filler'));
  for (const s of perSection.sort((a, b) => a.dw - b.dw)) {
    const arrow = `${s.b.words}→${s.l.words}`;
    const pct = `${s.dw >= 0 ? '+' : ''}${(s.dw * 100).toFixed(0)}%`;
    const paint = s.dw < SHRINK_LIMIT && !s.acceptedRewrite ? red : green;
    console.log(
      `  ${paint(s.id.slice(0, 46).padEnd(46))} ${arrow.padStart(11)} ${pct.padStart(5)}` +
      `  ${String(s.b.medianSentence + '→' + s.l.medianSentence).padStart(6)}` +
      ` ${String(s.b.over35 + '→' + s.l.over35).padStart(5)}` +
      ` ${String(s.b.colonDefs + '→' + s.l.colonDefs).padStart(6)}` +
      ` ${String(s.b.semicolons + '→' + s.l.semicolons).padStart(5)}` +
      ` ${String(s.b.filler + '→' + s.l.filler).padStart(7)}`
    );
  }
}

// --- 4. document-wide style movement -------------------------------------
const roll = (secs) => {
  const o = { words: 0, sentences: 0, over35: 0, over45: 0, colonDefs: 0, semicolons: 0, filler: 0 };
  for (const s of Object.values(secs)) for (const k of Object.keys(o)) o[k] += s.style[k] || 0;
  return o;
};
const rb = roll(base);
const rl = roll(live);
console.log(`\n${bold('  Readability, whole document')}`);
for (const k of Object.keys(rb)) {
  const better = ['over35', 'over45', 'colonDefs', 'semicolons', 'filler'].includes(k);
  const d = rl[k] - rb[k];
  const tag = !better ? dim('(informational)') : d < 0 ? green(`${d}`) : d > 0 ? yellow(`+${d}`) : dim('0');
  console.log(`  ${k.padEnd(14)} ${String(rb[k]).padStart(6)} → ${String(rl[k]).padStart(6)}   ${tag}`);
}

// --- 5. new facts need a human ---------------------------------------------
if (warnings.length) {
  console.log(`\n${bold('  New facts introduced')} ${dim('(not a failure — but tech.md requires each to be verified and dated)')}`);
  for (const w of warnings.slice(0, 40)) console.log(`  ${yellow('!')} ${w}`);
  if (warnings.length > 40) console.log(`  ${dim(`… and ${warnings.length - 40} more sections`)}`);
  console.log(`  ${yellow('!')} ${addedTotal} new fact token(s) in total`);
}

// --- report ---------------------------------------------------------------
if (failures.length) {
  console.error(`\n${red(bold(`✖ ${failures.length} knowledge regression(s)`))}\n`);
  for (const f of failures) console.error(`  • ${f}`);
  console.error(`\nEvery lost section/fact owner needs a passing exact replacement or one-to-one reviewed relocation contract.`);
  console.error(`Re-read the section named above against the baseline before re-running.\n`);
  process.exit(1);
}

console.log(`\n${green(bold('✓ no knowledge regression'))} — baseline facts remain, or every baseline owning section has a passing exact replacement contract.\n`);
