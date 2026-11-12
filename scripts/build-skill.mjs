#!/usr/bin/env node
/**
 * Generate the agent skill's references and data from the runbook.
 *
 *   content/index.html  (levers, questions, answer options, "What it saves", citations, CTA, disclaimer) ─┐
 *   content/assessment-evidence.json  (per-question evidence spec: what answers it, globs, patterns) ───┴─►
 *
 *   skills/ai-tokenomics-finops/references/track-N/index.md      one line per lever: load this first
 *   skills/ai-tokenomics-finops/references/track-N/<lever>.md    one lever: its questions and evidence specs
 *   skills/ai-tokenomics-finops/references/track-N/citations/<lever>.md  that lever's citations, for the reader
 *   skills/ai-tokenomics-finops/references/findings-and-report.md findings schema, report rules, CTA
 *   skills/ai-tokenomics-finops/assets/assessment.json           the same, for scripts/prescan.mjs and report.mjs
 *
 * Nothing in these outputs is hand-copied: verify-skill.mjs re-renders them and fails on any byte of drift,
 * on a question without a spec, and on a spec without a question. SKILL.md itself is authored.
 *
 * Prices stay out of this output except where the runbook's own "What it saves" line carries a figure, so
 * the skill holds no second price list to go stale.
 */

import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadModel, EVIDENCE_SOURCES } from './lib/skill-model.mjs';
import { SITE_URL } from './build-site.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const RUNBOOK = join(REPO_ROOT, 'content', 'index.html');
export const EVIDENCE = join(REPO_ROOT, 'content', 'assessment-evidence.json');
export const SKILL_DIR = join(REPO_ROOT, 'skills', 'ai-tokenomics-finops');
/** Directories the generator owns outright: every file in them must be one it renders. */
export const GENERATED_DIRS = ['references', 'assets'];

const HEADER = '<!-- GENERATED from content/ by scripts/build-skill.mjs. Do not edit; run `npm run build:skill`. -->';
const REPORT_NOTE = "This report was drafted by an AI agent from a read-only review of the workspace and the user's answers; check each answer before acting on it.";

/** Join each runbook question with its evidence spec; throw on any unmapped question, orphan spec or bad spec. */
export function joinEvidence(model, evidence) {
  const problems = [];
  const keys = model.tracks.flatMap((t) => t.levers.flatMap((l) => l.questions.map((q) => q.key)));
  const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
  if (dup.length) problems.push(`duplicate question IDs in the runbook: ${[...new Set(dup)].join(', ')}`);
  const specs = evidence.questions || {};
  for (const k of keys) if (!specs[k]) problems.push(`unmapped question: ${k} has no evidence spec`);
  for (const k of Object.keys(specs)) if (!keys.includes(k)) problems.push(`orphan spec: ${k} is not a runbook question`);
  for (const [name, globs] of Object.entries(evidence.globSets || {})) {
    if (!Array.isArray(globs) || !globs.length) problems.push(`glob set "${name}" is empty`);
  }
  for (const [k, s] of Object.entries(specs)) {
    if (!s.evidence || typeof s.evidence !== 'string') problems.push(`${k}: evidence is missing`);
    if (!Array.isArray(s.in) || !s.in.length) problems.push(`${k}: "in" lists no glob set`);
    for (const set of s.in || []) if (!evidence.globSets?.[set]) problems.push(`${k}: unknown glob set "${set}"`);
    if (!Array.isArray(s.patterns) || !s.patterns.length) problems.push(`${k}: no search patterns`);
    for (const p of s.patterns || []) { try { new RegExp(p, 'i'); } catch (e) { problems.push(`${k}: bad pattern ${p}: ${e.message}`); } }
    if ('ask' in s && typeof s.ask !== 'boolean') problems.push(`${k}: ask must be true or false`);
  }
  if (problems.length) throw new Error(`evidence specs do not match the runbook:\n  - ${problems.join('\n  - ')}`);
  for (const t of model.tracks) for (const l of t.levers) for (const q of l.questions) {
    const s = specs[q.key];
    q.spec = { evidence: s.evidence, in: s.in, patterns: s.patterns, ask: !!s.ask };
  }
  return model;
}

const leverFile = (t, l) => `references/${t.id}/${l.anchor}.md`;
const citationFile = (t, l) => `references/${t.id}/citations/${l.anchor}.md`;
const answerLine = (options) => `Answer each question with: ${options.map((o) => `\`${o.v}\` (${o.label})`).join(', ')}, or \`unknown\` when neither the files nor the user answer it.`;

function renderIndex(t, options) {
  const qn = t.levers.reduce((n, l) => n + l.questions.length, 0);
  const out = [HEADER, '', `# ${t.title}: lever index`, '',
    `${t.levers.length} levers, ${qn} questions, in runbook order. Load ONE lever file at a time, only for levers the triage kept. Runbook: ${SITE_URL}#${t.id}`, '',
    answerLine(options), ''];
  if (t.levers.some((l) => l.scopable)) out.push('Levers marked "scopable" may be reported Out of scope when the user confirms they do not apply.', '');
  out.push('| Layer | Lever | Questions | File |', '|---|---|---|---|');
  for (const l of t.levers) {
    out.push(`| ${l.layer} | ${l.name}${l.scopable ? ' (scopable)' : ''} | ${l.questions.map((q) => q.key).join(', ')} | \`${leverFile(t, l)}\` |`);
  }
  return out.join('\n') + '\n';
}

function renderLever(t, l, options, globSets) {
  const out = [HEADER, '', `# ${l.name}`, '', `- Track: ${t.title} · ${l.layer}`, `- Runbook: ${SITE_URL}#${l.anchor}`];
  if (l.scopable) out.push('- Can be scoped out: yes, if the user confirms it does not apply');
  out.push(`- What it saves: ${l.saves}`, '', answerLine(options), '');
  for (const q of l.questions) {
    out.push(`## \`${q.key}\` ${q.text}`, '');
    if (q.bestPractice) out.push(`- Fully covered looks like: ${q.bestPractice}`);
    out.push(`- Evidence: ${q.spec.evidence}`);
    out.push(`- Search: ${q.spec.in.join(', ')} files for ${q.spec.patterns.map((p) => '`' + p + '`').join(', ')}`);
    if (q.spec.ask) out.push('- Usually only the user knows: search, then ask.');
    out.push('');
  }
  out.push(`Glob sets: ${[...new Set(l.questions.flatMap((q) => q.spec.in))].map((s) => `${s} = ${globSets[s].join(' ')}`).join('; ')}`);
  out.push('', `Citations for the reader (not needed to answer): \`${citationFile(t, l)}\``);
  return out.join('\n') + '\n';
}

// Citations live in their own file so a lever load carries only what the agent needs to answer:
// some clients' read tools cannot stop at a heading.
function renderCitations(t, l) {
  const out = [HEADER, '', `# Citations: ${l.name}`, '', `Runbook: ${SITE_URL}#${l.anchor}`, ''];
  for (const c of l.citations) out.push(`- [${c.n}] ${c.title} ${c.url}`);
  return out.join('\n') + '\n';
}

function renderReportDoc(model) {
  const ev = EVIDENCE_SOURCES;
  return [HEADER, '', '# Findings files and the gap report', '',
    'Write one findings file per assessed lever, `.ai-finops-assessment/findings/<lever>.json`, as soon as that lever is answered:', '',
    '```json',
    '{ "lever": "<lever file name without .md>", "outOfScope": false,',
    '  "answers": [{ "id": "<question id>", "answer": "<answer>", "source": "<evidence source>",',
    '                "refs": ["path/to/file.py:42"], "confidence": "high", "note": "one short sentence" }] }',
    '```', '',
    `- answer: ${model.options.map((o) => `\`${o.v}\``).join(', ')} or \`unknown\``,
    `- source: ${ev.emit.map((s) => `\`${s}\``).join(', ')}; \`${ev.unknown}\` only with \`unknown\`. Reserved for later levels, never use now: ${ev.reserved.map((s) => `\`${s}\``).join(', ')}.`,
    '- refs: `path:line` or `path:line-line`, never pasted file content; required for code, config, iac and docs answers.',
    '- confidence: `high`, `medium` or `low`. A `user` answer needs a note saying what the user said.', '',
    'Then assemble the report (it validates every file and exits 2 with the problems):', '',
    '```sh',
    'node <skill>/scripts/report.mjs .ai-finops-assessment/findings --date YYYY-MM-DD --workspace <name> --out .ai-finops-assessment/report.md',
    '```', '',
    'Without a shell, write the report by hand in the same shape: title, date line, the disclaimer quote, a coverage line, "Gaps to address" (levers with a Not covered or Partially answer, in runbook order, each with its runbook link and "What it saves" line), "Full answer log" (every lever and question), and "Next step" with the paragraph below, copied exactly. Do not rank or prioritise gaps.', '',
    'Disclaimer:', '', `> ${model.disclaimer} ${REPORT_NOTE}`, '',
    'Next step:', '', model.cta, ''].join('\n');
}

/** Every generated file, path relative to the skill directory -> content. */
export function renderSkillFiles(htmlPath = RUNBOOK, evidencePath = EVIDENCE) {
  const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
  const model = joinEvidence(loadModel(htmlPath), evidence);
  const files = {};
  for (const t of model.tracks) {
    if (!/^track-\d+$/.test(t.id)) throw new Error(`unexpected track section id #${t.id}`);
    files[`references/${t.id}/index.md`] = renderIndex(t, model.options);
    for (const l of t.levers) {
      files[leverFile(t, l)] = renderLever(t, l, model.options, evidence.globSets);
      files[citationFile(t, l)] = renderCitations(t, l);
    }
  }
  files['references/findings-and-report.md'] = renderReportDoc(model);
  const data = {
    $comment: 'GENERATED from content/ by scripts/build-skill.mjs. Do not edit; run npm run build:skill.',
    runbook: SITE_URL,
    options: model.options,
    evidenceSources: EVIDENCE_SOURCES,
    disclaimer: model.disclaimer,
    reportNote: REPORT_NOTE,
    cta: model.cta,
    globSets: evidence.globSets,
    tracks: model.tracks.map((t) => ({
      id: t.id, title: t.title,
      levers: t.levers.map((l) => ({
        anchor: l.anchor, name: l.name, layer: l.layer, scopable: l.scopable, url: `${SITE_URL}#${l.anchor}`, saves: l.saves,
        questions: l.questions.map((q) => ({ key: q.key, qid: q.qid, text: q.text, spec: q.spec }))
      }))
    }))
  };
  files['assets/assessment.json'] = JSON.stringify(data, null, 1) + '\n';
  return { model, files };
}

function main() {
  const { model, files } = renderSkillFiles();
  // The generated directories are owned outright, so a lever that is renamed or removed leaves no stale file.
  for (const d of GENERATED_DIRS) rmSync(join(SKILL_DIR, d), { recursive: true, force: true });
  for (const [rel, body] of Object.entries(files)) {
    const p = join(SKILL_DIR, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, body);
  }
  const levers = model.tracks.reduce((n, t) => n + t.levers.length, 0);
  const qs = model.tracks.reduce((n, t) => n + t.levers.reduce((m, l) => m + l.questions.length, 0), 0);
  console.log('✔ build-skill');
  console.log(`  ${model.tracks.length} tracks, ${levers} levers, ${qs} questions, ${qs} evidence specs -> skills/ai-tokenomics-finops/ (${Object.keys(files).length} files)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { main(); } catch (e) { console.error(`\n✖ build-skill: ${e.message}\n`); process.exit(1); }
}
