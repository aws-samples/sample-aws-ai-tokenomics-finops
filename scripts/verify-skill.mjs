#!/usr/bin/env node
/**
 * Gate for the agent skill in skills/ai-tokenomics-finops/.
 *
 *   1. Drift: the generated references/ and assets/ equal a fresh render from content/, byte for byte,
 *      with no stale or extra file in either directory.
 *   2. Mapping: every runbook question has exactly one evidence spec and every spec is a runbook question;
 *      counts are pinned to the runbook's own markup.
 *   3. SKILL.md: valid Agent Skills frontmatter (name, description), short body, every linked file exists.
 *   4. Public safety: no out-of-scope client, internal host or marker, or alias in any skill file.
 *   5. Example: the committed sample report is exactly what scripts/report.mjs assembles from the committed
 *      sample findings, carries the runbook's CTA and disclaimer, and uses only Level 1 evidence sources.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { renderSkillFiles, SKILL_DIR, GENERATED_DIRS, RUNBOOK } from './build-skill.mjs';
import { OUT_OF_SCOPE, NEEDLE_RE, ALIAS_RE } from './lib/public-safety.mjs';
import { loadFindings, renderReport } from '../skills/ai-tokenomics-finops/scripts/report.mjs';

// Pinned to the runbook. Change them in the same PR that adds or removes a lever or question.
const EXPECT = { tracks: 2, levers: 28, questions: 74, perTrack: { 'track-1': [11, 35], 'track-2': [17, 39] } };
const SAMPLE = { dir: join(SKILL_DIR, 'examples', 'sample-findings'), report: join(SKILL_DIR, 'examples', 'sample-gap-report.md'), date: '2026-11-10', workspace: 'sample-bedrock-app' };

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✖\x1b[0m'} ${name}${detail ? `\x1b[2m — ${detail}\x1b[0m` : ''}`);
};
const walk = (d) => (existsSync(d) ? readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)])) : []);
const rel = (p) => relative(SKILL_DIR, p).split(sep).join('/');

console.log('\n\x1b[1mverify-skill\x1b[0m — agent skill gate');

// 1 + 2. Render (throws on an unmapped question, orphan spec or invalid spec) and compare.
let rendered;
try { rendered = renderSkillFiles(); } catch (e) { check('evidence specs map 1:1 to runbook questions', false, e.message); process.exit(1); }
const { model, files } = rendered;
check('evidence specs map 1:1 to runbook questions (no orphan, no unmapped)', true);

const levers = model.tracks.flatMap((t) => t.levers);
const questions = levers.flatMap((l) => l.questions);
const html = readFileSync(RUNBOOK, 'utf8');
check(`${EXPECT.tracks} tracks`, model.tracks.length === EXPECT.tracks, `${model.tracks.length}`);
check(`${EXPECT.levers} levers`, levers.length === EXPECT.levers, `${levers.length}`);
check(`${EXPECT.questions} questions`, questions.length === EXPECT.questions, `${questions.length}`);
check('question count equals the runbook markup', questions.length === (html.match(/class="assess-q"/g) || []).length);
check('lever count equals the runbook markup', levers.length === (html.match(/<div class="assess" /g) || []).length);
for (const t of model.tracks) {
  const [l, q] = EXPECT.perTrack[t.id] || [];
  const tq = t.levers.reduce((n, x) => n + x.questions.length, 0);
  check(`${t.id}: ${l} levers, ${q} questions`, t.levers.length === l && tq === q, `${t.levers.length}, ${tq}`);
}
const assets = JSON.parse(files['assets/assessment.json']);
const assetKeys = assets.tracks.flatMap((t) => t.levers.flatMap((l) => l.questions.map((q) => q.key)));
check('every check in assets/assessment.json is one runbook question ID', JSON.stringify(assetKeys) === JSON.stringify(questions.map((q) => q.key)), `${assetKeys.length} checks`);
check('every lever file names exactly its own question IDs', model.tracks.every((t) => t.levers.every((l) => {
  const body = files[`references/${t.id}/${l.anchor}.md`] || '';
  const ids = [...body.matchAll(/^## `([^`]+)`/gm)].map((m) => m[1]);
  return JSON.stringify(ids) === JSON.stringify(l.questions.map((q) => q.key));
})));
check('every lever has its citations file, and the lever file carries none', model.tracks.every((t) => t.levers.every((l) => {
  const cites = files[`references/${t.id}/citations/${l.anchor}.md`] || '';
  const lever = files[`references/${t.id}/${l.anchor}.md`] || '';
  return l.citations.every((c) => cites.includes(c.url)) && !/^- \[\d+\] /m.test(lever);
})), `${levers.length} citation files`);

const drift = [];
for (const [p, body] of Object.entries(files)) {
  const f = join(SKILL_DIR, p);
  if (!existsSync(f)) drift.push(`missing ${p}`);
  else if (readFileSync(f, 'utf8') !== body) drift.push(`stale ${p}`);
}
for (const d of GENERATED_DIRS) for (const f of walk(join(SKILL_DIR, d))) if (!(rel(f) in files)) drift.push(`not generated ${rel(f)}`);
check('generated references and assets match the runbook', drift.length === 0, drift.length ? `${drift.join(', ')} (run npm run build:skill)` : `${Object.keys(files).length} files`);

// 3. SKILL.md frontmatter and links.
const skill = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');
const fm = (skill.match(/^---\n([\s\S]*?)\n---\n/) || [])[1];
const field = (k) => ((fm || '').match(new RegExp(`^${k}:\\s*(.+)$`, 'm')) || [])[1]?.trim();
const name = field('name'), desc = field('description');
check('SKILL.md has YAML frontmatter', !!fm);
check('name is valid and matches the folder', !!name && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) && name.length <= 64 && name === 'ai-tokenomics-finops', name);
check('description is 1-1024 characters', !!desc && desc.length <= 1024, `${desc?.length ?? 0}`);
check('SKILL.md body is under 500 lines', skill.split('\n').length < 500, `${skill.split('\n').length}`);
check('SKILL.md limits the shell to the two node scripts', /\*\*File tools only\.\*\*[^\n]*shell only for `node scripts\/prescan\.mjs` and `node scripts\/report\.mjs --out/.test(skill));
const links = [...skill.matchAll(/`((?:references|scripts|assets)\/[^`<>\s]+)`/g)].map((m) => m[1]);
check('every file SKILL.md names exists', links.every((l) => existsSync(join(SKILL_DIR, l))), links.join(', '));

// 4. Public safety across every text file in the skill.
const textFiles = walk(SKILL_DIR).filter((f) => /\.(md|mjs|json|py|yaml|yml)$/.test(f));
const hits = [];
for (const f of textFiles) {
  const t = readFileSync(f, 'utf8');
  for (const re of [OUT_OF_SCOPE, NEEDLE_RE, ALIAS_RE]) for (const m of t.match(re) || []) hits.push(`${rel(f)}: ${m}`);
}
check('no out-of-scope client, internal host or marker, or alias in the skill', hits.length === 0, hits.length ? hits.slice(0, 5).join('; ') : `${textFiles.length} files`);

// 5. The example report.
const { byLever, errors } = loadFindings(SAMPLE.dir, assets);
check('sample findings are valid', errors.length === 0 && byLever.size > 0, errors.length ? errors.slice(0, 3).join('; ') : `${byLever.size} lever files`);
const expected = renderReport(assets, byLever, SAMPLE);
const sample = existsSync(SAMPLE.report) ? readFileSync(SAMPLE.report, 'utf8') : '';
check('sample report equals report.mjs output from the sample findings', sample === expected, 'regenerate: node skills/ai-tokenomics-finops/scripts/report.mjs skills/ai-tokenomics-finops/examples/sample-findings --date 2026-11-10 --workspace sample-bedrock-app');
check('sample report ends with the runbook account-team paragraph', sample.trimEnd().endsWith(model.cta));
check('sample report carries the runbook disclaimer', sample.includes(model.disclaimer));
const sources = [...sample.matchAll(/Source: ([\w-]+)/g)].map((m) => m[1]);
const allowed = [...assets.evidenceSources.emit, assets.evidenceSources.unknown];
check('sample report uses only Level 1 evidence sources', sources.length > 0 && sources.every((s) => allowed.includes(s)), [...new Set(sources)].join(', '));
check('sample report does not rank gaps', !/\b(priority|prioriti[sz]ed list|rank(ed|ing)? \d|top \d)\b/i.test(sample.replace(model.cta, '').replace('This list is not ranked or prioritised.', '')));

console.log(failed ? `\n\x1b[31m\x1b[1m✖ ${failed} skill check(s) failed\x1b[0m\n` : '\n\x1b[32m\x1b[1m✓ all skill checks passed\x1b[0m\n');
process.exit(failed ? 1 : 0);
