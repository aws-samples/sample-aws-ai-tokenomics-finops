#!/usr/bin/env node
/**
 * Assemble the gap report from per-lever findings files, so the agent does not have to keep earlier
 * levers in context. Node built-ins only; no network; reads the findings directory and prints Markdown.
 *
 * Findings file: <findings-dir>/<lever-anchor>.json
 *   { "lever": "<anchor>", "outOfScope": false,
 *     "answers": [{ "id": "<question id>", "answer": "yes|wip|no|na|unknown", "source": "code|config|iac|docs|user|none",
 *                   "refs": ["path:line"], "confidence": "high|medium|low", "note": "..." }] }
 *
 * Usage: node report.mjs <findings-dir> --date YYYY-MM-DD --workspace <name> [--track track-1|track-2]...
 * Exit 2 on invalid findings, listing every problem.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ASSESSMENT = join(HERE, '..', 'assets', 'assessment.json');

const ANSWERS = ['yes', 'wip', 'no', 'na', 'unknown'];
const CONFIDENCE = ['high', 'medium', 'low'];
const REF = /^[^\s:][^:]*:\d+(-\d+)?$/;

/** Read and validate every findings file. Returns { byLever, errors }. */
export function loadFindings(dir, assessment) {
  const errors = [];
  const byLever = new Map();
  const levers = new Map(assessment.tracks.flatMap((t) => t.levers.map((l) => [l.anchor, { ...l, track: t.id }])));
  const ev = assessment.evidenceSources;
  if (!existsSync(dir)) return { byLever, errors: [`findings directory not found: ${dir}`] };
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
    const where = name;
    let f;
    try { f = JSON.parse(readFileSync(join(dir, name), 'utf8')); } catch (e) { errors.push(`${where}: not valid JSON (${e.message})`); continue; }
    const lever = levers.get(f.lever);
    if (!lever) { errors.push(`${where}: unknown lever "${f.lever}"`); continue; }
    if (name !== `${f.lever}.json`) errors.push(`${where}: file name must be ${f.lever}.json`);
    if (f.outOfScope && !lever.scopable) errors.push(`${where}: lever "${f.lever}" cannot be scoped out`);
    const ids = new Set(lever.questions.map((q) => q.key));
    const answers = new Map();
    for (const a of f.answers || []) {
      const at = `${where} ${a.id}`;
      if (!ids.has(a.id)) { errors.push(`${at}: not a question of lever "${f.lever}"`); continue; }
      if (answers.has(a.id)) errors.push(`${at}: answered twice`);
      if (!ANSWERS.includes(a.answer)) errors.push(`${at}: answer must be one of ${ANSWERS.join(', ')}`);
      if (ev.reserved.includes(a.source)) errors.push(`${at}: evidence source "${a.source}" is reserved for a later level`);
      else if (a.answer === 'unknown' ? a.source !== ev.unknown : !ev.emit.includes(a.source)) {
        errors.push(`${at}: source must be ${a.answer === 'unknown' ? `"${ev.unknown}" for an unknown answer` : `one of ${ev.emit.join(', ')}`}`);
      }
      if (!CONFIDENCE.includes(a.confidence)) errors.push(`${at}: confidence must be one of ${CONFIDENCE.join(', ')}`);
      const refs = a.refs || [];
      if (!Array.isArray(refs) || refs.some((r) => typeof r !== 'string' || !REF.test(r))) errors.push(`${at}: refs must be "path:line" strings`);
      if (['code', 'config', 'iac', 'docs'].includes(a.source) && !refs.length) errors.push(`${at}: a ${a.source} answer needs at least one path:line ref`);
      if (a.source === 'user' && !a.note) errors.push(`${at}: a user answer needs a note saying what the user said`);
      answers.set(a.id, a);
    }
    byLever.set(f.lever, { outOfScope: !!f.outOfScope, answers });
  }
  return { byLever, errors };
}

/** Render the report for the given tracks (default: every track with at least one findings file). */
export function renderReport(assessment, byLever, { date, workspace, tracks }) {
  const label = Object.fromEntries(assessment.options.map((o) => [o.v, o.label]));
  label.unknown = 'Unknown';
  const chosen = assessment.tracks.filter((t) => (tracks && tracks.length ? tracks.includes(t.id) : t.levers.some((l) => byLever.has(l.anchor))));
  const docs = [];
  for (const t of chosen) {
    const rows = t.levers.map((l) => {
      const f = byLever.get(l.anchor);
      const qs = l.questions.map((q) => ({ q, a: f?.answers.get(q.key) || { answer: 'unknown', source: 'none', refs: [], confidence: 'low', note: 'Not assessed.' } }));
      const states = qs.map((x) => x.a.answer);
      const status = f?.outOfScope ? 'Out of scope'
        : states.some((s) => s === 'no' || s === 'wip') ? 'Gap'
          : states.some((s) => s === 'unknown') ? 'Incomplete' : 'Covered';
      return { l, qs, status };
    });
    const counted = rows.filter((r) => r.status !== 'Out of scope').flatMap((r) => r.qs);
    const c = Object.fromEntries(ANSWERS.map((k) => [k, counted.filter((x) => x.a.answer === k).length]));
    const answered = counted.length - c.unknown;
    const line = (x) => {
      const ev = [x.a.refs.join(', '), x.a.note].filter(Boolean).join(' — ');
      return [`- \`${x.q.key}\` [${label[x.a.answer]}] ${x.q.text}`,
        `  Source: ${x.a.source} · Confidence: ${x.a.confidence}${ev ? ` · Evidence: ${ev}` : ''}`];
    };
    const out = [
      `# AI Tokenomics FinOps assessment — ${t.title}`, '',
      `Agent-assisted static review (Level 1) of ${workspace}, ${date}. Dated, not attributed.`, '',
      `> ${assessment.disclaimer} ${assessment.reportNote}`, '',
      `Coverage: ${c.yes} fully covered · ${c.wip} partially · ${c.no} not covered · ${c.na} N/A · ${c.unknown} unknown (${answered}/${counted.length} answered).`, ''
    ];
    const scopedOut = rows.filter((r) => r.status === 'Out of scope').map((r) => r.l.name);
    if (scopedOut.length) out.push(`Out of scope (excluded from every count above): ${scopedOut.join(', ')}.`, '');
    out.push('## Gaps to address', '', 'In runbook order. This list is not ranked or prioritised.', '');
    const gaps = rows.filter((r) => r.status === 'Gap');
    if (!gaps.length) out.push('_No gaps recorded._', '');
    for (const r of gaps) {
      out.push(`### ${r.l.name}`, '', `Runbook: ${r.l.url}`, `What it saves: ${r.l.saves}`, '');
      for (const x of r.qs) if (x.a.answer === 'no' || x.a.answer === 'wip') out.push(...line(x));
      out.push('');
    }
    out.push('## Full answer log', '');
    for (const r of rows) {
      out.push(`### ${r.l.layer} · ${r.l.name} — ${r.status}`, '');
      if (r.status !== 'Out of scope') for (const x of r.qs) out.push(...line(x));
      out.push('');
    }
    out.push('## Next step', '', assessment.cta, '');
    docs.push(out.join('\n'));
  }
  return docs.join('\n---\n\n');
}

function parseArgs(argv) {
  const o = { tracks: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[++i]; };
    if (a === '--date') o.date = v();
    else if (a === '--workspace') o.workspace = v();
    else if (a === '--track') o.tracks.push(v());
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else o.dir = a;
  }
  if (!o.dir) throw new Error('give the findings directory');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date || '')) throw new Error('--date YYYY-MM-DD is required');
  if (!o.workspace) throw new Error('--workspace <name> is required');
  return o;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const o = parseArgs(process.argv.slice(2));
    const assessment = JSON.parse(readFileSync(ASSESSMENT, 'utf8'));
    const { byLever, errors } = loadFindings(o.dir, assessment);
    if (errors.length) { console.error(`report: ${errors.length} problem(s) in the findings:\n- ${errors.join('\n- ')}`); process.exit(2); }
    process.stdout.write(renderReport(assessment, byLever, o));
  } catch (e) {
    console.error(`report: ${e.message}`);
    process.exit(2);
  }
}
