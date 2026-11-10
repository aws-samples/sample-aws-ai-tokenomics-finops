// Tests for the agent skill: the generator (scripts/build-skill.mjs), the pre-scan and the report assembler.
// Run: node --test scripts/skill.test.mjs (part of npm run verify:skill).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, readdirSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderSkillFiles, joinEvidence, RUNBOOK, EVIDENCE } from './build-skill.mjs';
import { loadModel } from './lib/skill-model.mjs';
import { scan, renderMarkdown, globToRegExp } from '../skills/ai-tokenomics-finops/scripts/prescan.mjs';
import { loadFindings, renderReport } from '../skills/ai-tokenomics-finops/scripts/report.mjs';

const { files } = renderSkillFiles();
const assessment = JSON.parse(files['assets/assessment.json']);
const evidence = () => JSON.parse(readFileSync(EVIDENCE, 'utf8'));
const tmp = (t) => { const d = mkdtempSync(join(tmpdir(), 'skill-test-')); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };
const write = (root, rel, body) => { mkdirSync(join(root, rel, '..'), { recursive: true }); writeFileSync(join(root, rel), body); };

// ---- generator ------------------------------------------------------------------------------------

test('generator: one file per lever, one index per track, 74 checks', () => {
  const levers = Object.keys(files).filter((f) => /^references\/track-\d\/(?!index\.md)/.test(f));
  assert.equal(levers.length, 28);
  assert.ok(files['references/track-1/index.md'] && files['references/track-2/index.md']);
  assert.equal(assessment.tracks.flatMap((t) => t.levers.flatMap((l) => l.questions)).length, 74);
});

test('generator: an unmapped question or an orphan spec fails the build', () => {
  const model = () => loadModel(RUNBOOK);
  const missing = evidence(); delete missing.questions['cwr-q1'];
  assert.throws(() => joinEvidence(model(), missing), /unmapped question: cwr-q1/);
  const orphan = evidence(); orphan.questions['zzz-q9'] = orphan.questions['cwr-q1'];
  assert.throws(() => joinEvidence(model(), orphan), /orphan spec: zzz-q9/);
  const badSet = evidence(); badSet.questions['cwr-q1'].in = ['nope'];
  assert.throws(() => joinEvidence(model(), badSet), /unknown glob set "nope"/);
  const badRe = evidence(); badRe.questions['cwr-q1'].patterns = ['('];
  assert.throws(() => joinEvidence(model(), badRe), /bad pattern/);
});

test('generator: a change to a runbook question changes the generated reference (drift is visible)', (t) => {
  const d = tmp(t);
  const html = readFileSync(RUNBOOK, 'utf8').replace('Is prompt caching on, with the stable content placed first?', 'Is prompt caching on? (edited)');
  writeFileSync(join(d, 'index.html'), html);
  const changed = renderSkillFiles(join(d, 'index.html'), EVIDENCE).files;
  assert.notEqual(changed['references/track-2/cache-what-repeats.md'], files['references/track-2/cache-what-repeats.md']);
  assert.match(changed['references/track-2/cache-what-repeats.md'], /Is prompt caching on\? \(edited\)/);
});

// ---- pre-scan -------------------------------------------------------------------------------------

test('prescan: glob matcher', () => {
  assert.ok(globToRegExp('**/*.py').test('a/b/c.py'));
  assert.ok(globToRegExp('**/*.py').test('c.py'));
  assert.ok(globToRegExp('**/*.{yaml,yml}').test('x/t.yml'));
  assert.ok(globToRegExp('**/{infra,cdk}/**').test('infra/a/b.ts'));
  assert.ok(!globToRegExp('**/*.py').test('a/b.pyc'));
});

function fixture(t) {
  const root = tmp(t);
  write(root, 'app/agent.py', 'x = 1\nsystem = [{"text": P}]\nbedrock_api_key = "abc123"  # cachePoint\n');
  write(root, 'app/many.py', Array.from({ length: 10 }, (_, i) => `cachePoint_${i} = 1`).join('\n'));
  write(root, '.env', 'cachePoint=secret\n');
  write(root, 'deploy.pem', 'cachePoint\n');
  write(root, 'node_modules/lib/x.py', 'cachePoint\n');
  write(root, '.kiro/skills/ai-tokenomics-finops/SKILL.md', 'cachePoint\n');
  write(root, '.kiro/skills/ai-tokenomics-finops/x.py', 'cachePoint\n');
  writeFileSync(join(root, 'app/bin.py'), Buffer.from('cachePoint\0\0'));
  symlinkSync(join(root, 'app/agent.py'), join(root, 'app/link.py'));
  return root;
}
const q = (s, id) => s.questions.find((x) => x.id === id);

test('prescan: skips secrets, dependencies, binaries, symlinks and the skill itself; withholds secret lines', (t) => {
  const s = scan(fixture(t), assessment, { track: 'track-2' });
  const refs = s.questions.flatMap((x) => x.shown.map((h) => h.ref));
  for (const bad of ['.env', 'deploy.pem', 'node_modules', '.kiro/', 'bin.py', 'link.py']) assert.ok(!refs.some((r) => r.includes(bad)), bad);
  assert.equal(s.skipped.secret, 2);
  assert.equal(s.skipped.binary, 1);
  assert.equal(s.skipped.symlink, 1);
  assert.equal(s.skipped.skillDir, 1);
  const withheld = q(s, 'cwr-q1').shown.find((h) => h.ref === 'app/agent.py:3');
  assert.deepEqual(withheld.text, ['[line withheld: may hold a secret]']);
  assert.ok(!JSON.stringify(s).includes('abc123'));
});

test('prescan: caps hits per question and clamps the cap to 5', (t) => {
  const root = fixture(t);
  const s = scan(root, assessment, { track: 'track-2' });
  assert.equal(q(s, 'cwr-q1').shown.length, 3);
  assert.equal(q(s, 'cwr-q1').hits, 12);
  assert.equal(q(s, 'cwr-q1').more, 9);
  assert.equal(scan(root, assessment, { track: 'track-2', maxHits: 50 }).caps.maxHits, 5);
  // context 1: the matched line plus one either side (app/agent.py:2 of 3 lines).
  assert.equal(scan(root, assessment, { track: 'track-2', context: 1 }).questions.find((x) => x.id === 'cwr-q1').shown[0].text.length, 3);
});

test('prescan: marks the summary truncated when a cap is hit', (t) => {
  const s = scan(fixture(t), assessment, { track: 'track-2', maxFiles: 1 });
  assert.equal(s.truncated, true);
  assert.match(s.truncatedReason, /file cap/);
  assert.match(renderMarkdown(s), /^TRUNCATED: /m);
});

test('prescan: deterministic and writes nothing', (t) => {
  const root = fixture(t);
  const snap = (d) => readdirSync(d, { recursive: true }).sort().map((f) => `${f}:${statSync(join(d, f), { throwIfNoEntry: false })?.mtimeMs}`).join('\n');
  const before = snap(root);
  const a = JSON.stringify(scan(root, assessment, {}));
  const b = JSON.stringify(scan(root, assessment, {}));
  assert.equal(a, b);
  assert.equal(snap(root), before);
  assert.equal(JSON.parse(a).schema, 'ai-finops-summary/1');
  assert.equal(JSON.parse(a).questions.length, 74);
});

// ---- report ---------------------------------------------------------------------------------------

const finding = (answers, extra = {}) => ({ lever: 'cache-what-repeats', answers, ...extra });
const ok = { id: 'cwr-q1', answer: 'no', source: 'code', refs: ['app/agent.py:27'], confidence: 'high', note: 'No cache point.' };

function findingsDir(t, objs) {
  const d = tmp(t);
  for (const o of objs) writeFileSync(join(d, `${o.lever}.json`), JSON.stringify(o));
  return d;
}

test('report: rejects reserved and invalid evidence sources, refs and scoping', (t) => {
  const bad = [
    [{ ...ok, source: 'session-logs' }, /reserved for a later level/],
    [{ ...ok, source: 'aws-metrics' }, /reserved for a later level/],
    [{ ...ok, answer: 'unknown' }, /"none" for an unknown answer/],
    [{ ...ok, refs: [] }, /needs at least one path:line ref/],
    [{ ...ok, refs: ['app/agent.py'] }, /path:line/],
    [{ ...ok, id: 'rtm-q1' }, /not a question of lever/],
    [{ ...ok, source: 'user', refs: [], note: '' }, /needs a note/]
  ];
  for (const [a, re] of bad) {
    const { errors } = loadFindings(findingsDir(t, [finding([a])]), assessment);
    assert.ok(errors.some((e) => re.test(e)), `${JSON.stringify(a)} -> ${errors.join('; ')}`);
  }
  const notScopable = { lever: 'developer-education', outOfScope: true, answers: [] };
  assert.ok(loadFindings(findingsDir(t, [notScopable]), assessment).errors.some((e) => /cannot be scoped out/.test(e)));
});

test('report: runbook order, not-assessed levers are unknown, ends with the account-team paragraph', (t) => {
  const { byLever, errors } = loadFindings(findingsDir(t, [finding([ok])]), assessment);
  assert.deepEqual(errors, []);
  const md = renderReport(assessment, byLever, { date: '2026-11-10', workspace: 'w' });
  assert.ok(md.trimEnd().endsWith(assessment.cta));
  assert.ok(md.includes(assessment.disclaimer));
  assert.match(md, /`cwr-q2` \[Unknown\][\s\S]*?Source: none/);
  const order = assessment.tracks[1].levers.map((l) => md.indexOf(`· ${l.name} — `));
  assert.ok(order.every((p, i) => p > 0 && (i === 0 || p > order[i - 1])));
  assert.match(md, /Coverage: 0 fully covered · 0 partially · 1 not covered · 0 N\/A · 38 unknown \(1\/39 answered\)/);
});
