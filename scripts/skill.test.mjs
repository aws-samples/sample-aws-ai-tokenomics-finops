// Tests for the agent skill: the generator (scripts/build-skill.mjs), the pre-scan and the report assembler.
// Run: node --test scripts/skill.test.mjs (part of npm run verify:skill).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, readdirSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { renderSkillFiles, joinEvidence, RUNBOOK, EVIDENCE } from './build-skill.mjs';
import { loadModel, personaMarkupProblems } from './lib/skill-model.mjs';
import { scan, renderMarkdown, globToRegExp, workspaceListing } from '../skills/ai-tokenomics-finops/scripts/prescan.mjs';
import { readRange, MAX_LINES } from '../skills/ai-tokenomics-finops/scripts/read.mjs';
import { loadFindings, renderReport } from '../skills/ai-tokenomics-finops/scripts/report.mjs';

const { files } = renderSkillFiles();
const assessment = JSON.parse(files['assets/assessment.json']);
const evidence = () => JSON.parse(readFileSync(EVIDENCE, 'utf8'));
const tmp = (t) => { const d = mkdtempSync(join(tmpdir(), 'skill-test-')); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };
const write = (root, rel, body) => { mkdirSync(join(root, rel, '..'), { recursive: true }); writeFileSync(join(root, rel), body); };

// ---- generator ------------------------------------------------------------------------------------

test('generator: one file per lever, one index per track, 74 checks', () => {
  const levers = Object.keys(files).filter((f) => /^references\/track-\d\/(?!index\.md)[^/]+$/.test(f));
  const cites = Object.keys(files).filter((f) => /^references\/track-\d\/citations\/[^/]+\.md$/.test(f));
  assert.equal(levers.length, 28);
  assert.equal(cites.length, 28);
  assert.ok(levers.every((f) => !files[f].includes('## Citations')));
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

test('prescan: workspace listing is two levels, dirs first, skips bulky and hidden dirs, keeps agent config, caps with a count', (t) => {
  const root = tmp(t);
  for (const d of ['.git', 'node_modules', '.ai-finops-assessment', '.kiro/skills', 'app/sub', 'docs']) mkdirSync(join(root, d), { recursive: true });
  write(root, 'app/agent.py', 'x\n');
  write(root, 'app/sub/deep.py', 'x\n');
  write(root, 'README.md', 'x\n');
  write(root, '.env', 'x\n');
  assert.deepEqual(workspaceListing(root), ['- .kiro/', '  - skills/', '- app/', '  - sub/', '  - agent.py', '- docs/', '- README.md']);
  for (let i = 0; i < 70; i++) write(root, `f${String(i).padStart(2, '0')}.txt`, 'x\n');
  const capped = workspaceListing(root);
  assert.equal(capped.length, 61);
  assert.equal(capped[60], '... 17 more');
});

// ---- read.mjs -------------------------------------------------------------------------------------

const lines100 = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';

test('read: prints the requested lines, numbered, and withholds secret lines', (t) => {
  const root = tmp(t);
  write(root, 'app/a.py', lines100.replace('line 4', 'api_key = "abc123"'));
  const out = readRange('app/a.py', 3, 5, { root });
  assert.equal(out, 'app/a.py lines 3-5 of 100\n3: line 3\n4: [line withheld: may hold a secret]\n5: line 5\n');
  assert.throws(() => readRange('app/a.py', 101, 102, { root }), /past the end/);
  assert.throws(() => readRange('app/a.py', 5, 3, { root }), /start <= end/);
});

test('read: caps a range at MAX_LINES and says what to read next', (t) => {
  const root = tmp(t);
  write(root, 'a.txt', lines100);
  const out = readRange('a.txt', 1, 100, { root }).trimEnd().split('\n');
  assert.equal(out.length, MAX_LINES + 2);
  assert.equal(out[MAX_LINES], `${MAX_LINES}: line ${MAX_LINES}`);
  assert.match(out.at(-1), new RegExp(`capped at ${MAX_LINES} lines; read ${MAX_LINES + 1}-100 next`));
});

test('read: refuses paths outside the workspace, symlink escapes and secret-shaped files', (t) => {
  const outside = tmp(t);
  write(outside, 'x.txt', 'outside\n');
  const root = tmp(t);
  write(root, '.env', 'A=1\n');
  write(root, '.aws/config', 'x\n');
  symlinkSync(join(outside, 'x.txt'), join(root, 'link.txt'));
  assert.throws(() => readRange(join(outside, 'x.txt'), 1, 1, { root }), /outside the workspace/);
  assert.throws(() => readRange(relative(root, join(outside, 'x.txt')), 1, 1, { root }), /outside the workspace/);
  assert.throws(() => readRange('link.txt', 1, 1, { root }), /outside the workspace/);
  assert.throws(() => readRange('.env', 1, 1, { root }), /may hold secrets/);
  assert.throws(() => readRange('.aws/config', 1, 1, { root }), /may hold secrets/);
  assert.match(readRange(fileURLToPath(new URL('../skills/ai-tokenomics-finops/SKILL.md', import.meta.url)), 1, 2, { root }), /^.+ lines 1-2 of /);
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

// ---- report --out ---------------------------------------------------------------------------------

const REPORT_CLI = fileURLToPath(new URL('../skills/ai-tokenomics-finops/scripts/report.mjs', import.meta.url));
const SAMPLE_FINDINGS = fileURLToPath(new URL('../skills/ai-tokenomics-finops/examples/sample-findings', import.meta.url));
const runReport = (cwd, extra) => spawnSync(process.execPath,
  [REPORT_CLI, SAMPLE_FINDINGS, '--date', '2026-11-10', '--workspace', 'sample-bedrock-app', ...extra], { cwd, encoding: 'utf8' });

test('report --out: writes inside .ai-finops-assessment/, creates it, prints one line, same bytes as stdout', (t) => {
  const cwd = tmp(t);
  const stdout = runReport(cwd, []);
  assert.equal(stdout.status, 0);
  const r = runReport(cwd, ['--out', '.ai-finops-assessment/report.md']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim().split('\n').length, 1);
  assert.match(r.stdout, /^report: wrote \.ai-finops-assessment\/report\.md/);
  assert.equal(readFileSync(join(cwd, '.ai-finops-assessment', 'report.md'), 'utf8'), stdout.stdout);
});

test('report --out: refuses paths outside .ai-finops-assessment/, writing nothing', (t) => {
  const cwd = tmp(t);
  const outside = tmp(t);
  mkdirSync(join(cwd, 'elsewhere'));
  symlinkSync(join(cwd, 'elsewhere'), join(cwd, '.ai-finops-assessment'));
  for (const bad of ['report.md', '../report.md', '.ai-finops-assessment/../report.md', '.ai-finops-assessment',
    join(outside, 'report.md'), '.ai-finops-assessment-x/report.md', '.ai-finops-assessment/report.md']) {
    const r = runReport(cwd, ['--out', bad]);
    assert.equal(r.status, 2, `${bad} -> ${r.stdout}`);
    assert.match(r.stderr, /refused/);
  }
  assert.deepEqual(readdirSync(join(cwd, 'elsewhere')), []);
  assert.deepEqual(readdirSync(outside), []);
});

// ---- personas -------------------------------------------------------------------------------------


test('personas: a missing tag, an unknown tag or ai-pm-leader as a tag fails the build and verify', (t) => {
  const html = readFileSync(RUNBOOK, 'utf8');
  assert.deepEqual(personaMarkupProblems(html), []);
  const cases = [
    [html.replace(/(data-key="cwr-q1") data-personas="[^"]*"/, '$1'), /cwr-q1: data-personas is missing or empty/],
    [html.replace(/(data-key="cwr-q1") data-personas="[^"]*"/, '$1 data-personas="finance"'), /cwr-q1: unknown persona tag finance/],
    [html.replace(/(data-key="cwr-q1") data-personas="[^"]*"/, '$1 data-personas="ai-pm-leader"'), /cwr-q1: ai-pm-leader is the all-questions view/]
  ];
  for (const [bad, re] of cases) {
    assert.ok(personaMarkupProblems(bad).some((p) => re.test(p)), String(re));
    const d = tmp(t);
    writeFileSync(join(d, 'index.html'), bad);
    assert.throws(() => loadModel(join(d, 'index.html')), re);
  }
});

test('personas: tags reach the assets, the track index and each lever file', () => {
  assert.deepEqual(assessment.personas.map((p) => p.id), ['ai-pm-leader', 'governance', 'developer', 'builder']);
  const all = assessment.tracks.flatMap((t) => t.levers.flatMap((l) => l.questions));
  assert.ok(all.every((x) => x.personas.length >= 1));
  assert.match(files['references/track-1/index.md'], /^- `builder` \(App builder\), 0: this track has no App builder questions\./m);
  assert.match(files['references/track-2/index.md'], /^- `developer` \(Developer\), 1: psr-q1\. Do not open these lever files: `know-what-you-spend`/m);
  assert.match(files['references/track-1/right-size-the-model-to-the-task.md'], /## `rsm-q2`[^\n]*\n\n- Personas: governance, developer\n/);
});

test('prescan --persona: scans only that role\'s questions; ai-pm-leader scans all', (t) => {
  const root = fixture(t);
  const ids = (o) => scan(root, assessment, o).questions.map((x) => x.id);
  const dev = ids({ persona: 'developer' });
  assert.equal(dev.length, 15);
  assert.ok(dev.includes('psr-q1') && dev.includes('msc-q1') && !dev.includes('qsh-q1') && !dev.includes('cwr-q1'));
  assert.deepEqual(ids({ persona: 'ai-pm-leader' }), ids({}));
  assert.equal(scan(root, assessment, { persona: 'governance', track: 'track-2' }).persona, 'governance');
  assert.ok(!('persona' in scan(root, assessment, {})));
  assert.match(renderMarkdown(scan(root, assessment, { persona: 'builder' })), /^Persona: builder\. Only its questions are listed/m);
  const cli = spawnSync(process.execPath, [fileURLToPath(new URL('../skills/ai-tokenomics-finops/scripts/prescan.mjs', import.meta.url)), root, '--persona', 'finance'], { encoding: 'utf8' });
  assert.equal(cli.status, 2);
  assert.match(cli.stderr, /unknown persona finance/);
});

test('report: without --persona, and with ai-pm-leader, the output is byte-identical to main', (t) => {
  // examples/sample-gap-report.md is the report main's report.mjs produced from the sample findings (this PR does
  // not change it), so it is the fixture for "unchanged".
  const fromMain = readFileSync(fileURLToPath(new URL('../skills/ai-tokenomics-finops/examples/sample-gap-report.md', import.meta.url)), 'utf8');
  const cwd = tmp(t);
  assert.equal(runReport(cwd, []).stdout, fromMain);
  assert.equal(runReport(cwd, ['--persona', 'ai-pm-leader']).stdout, fromMain);
});

const forRole = (t, role) => {
  const d = tmp(t);
  const keys = new Map(assessment.tracks.flatMap((tr) => tr.levers.flatMap((l) => l.questions.map((x) => [x.key, x.personas]))));
  for (const name of readdirSync(SAMPLE_FINDINGS)) {
    const f = JSON.parse(readFileSync(join(SAMPLE_FINDINGS, name), 'utf8'));
    f.answers = f.answers.filter((a) => keys.get(a.id).includes(role));
    if (f.answers.length || f.outOfScope) writeFileSync(join(d, name), JSON.stringify(f));
  }
  return d;
};

test('report --persona governance: header, in-scope counts and the skipped list by lever', (t) => {
  const { byLever, errors } = loadFindings(forRole(t, 'governance'), assessment, { persona: 'governance' });
  assert.deepEqual(errors, []);
  const md = renderReport(assessment, byLever, { date: '2026-11-10', workspace: 'w', persona: 'governance' });
  assert.match(md, /^Persona: Governance, platform or FinOps\. Questions for other roles were skipped and are listed under "Not assessed for this persona"\.$/m);
  // 10 governance questions; Self-host or distill is scoped out, so 9 are counted.
  assert.match(md, /Coverage: 1 fully covered · 3 partially · 4 not covered · 0 N\/A · 1 unknown \(8\/9 answered\)/);
  const skipped = md.split('## Not assessed for this persona')[1].split('## Next step')[0];
  assert.equal((skipped.match(/`[a-z]+-q\d`/g) || []).length, 29);
  assert.match(skipped, /^- Route to the right model: `rtm-q1`$/m);
  assert.match(skipped, /^- System prompt: `sp-q1`, `sp-q2`$/m);
  assert.ok(!/kwys-q/.test(skipped) && !/`cwr-q1`[\s\S]*Full answer log/.test(md.split('## Not assessed')[0]));
  assert.ok(!md.includes('### Agent Harness · System prompt'));
  assert.ok(md.trimEnd().endsWith(assessment.cta));
});

test('report --persona developer and builder on Track 1', () => {
  const dev = renderReport(assessment, new Map(), { date: '2026-11-10', workspace: 'w', tracks: ['track-1'], persona: 'developer' });
  assert.match(dev, /^Persona: Developer\./m);
  assert.match(dev, /\(0\/14 answered\)/);
  assert.match(dev, /^- Know how your coding agent is metered: `qsh-q1`, `qsh-q2`, `qsh-q3`$/m);
  assert.match(dev, /^- Right-size the model to the task: `rsm-q1`, `rsm-q3`, `rsm-q4`$/m);
  const builder = renderReport(assessment, new Map(), { date: '2026-11-10', workspace: 'w', tracks: ['track-1'], persona: 'builder' });
  assert.match(builder, /\(0\/0 answered\)/);
  assert.equal((builder.split('## Not assessed for this persona')[1].match(/`[a-z]+-q\d`/g) || []).length, 35);
});

test('report --persona: rejects an answer to another role\'s question and an unknown persona', (t) => {
  const { errors } = loadFindings(SAMPLE_FINDINGS, assessment, { persona: 'developer' });
  assert.ok(errors.some((e) => /cwr-q1: not a question for persona "developer"/.test(e)));
  assert.throws(() => renderReport(assessment, new Map(), { date: '2026-11-10', workspace: 'w', persona: 'finance' }), /unknown persona "finance"/);
  const cli = runReport(tmp(t), ['--persona', 'finance']);
  assert.equal(cli.status, 2);
  assert.match(cli.stderr, /unknown persona "finance"/);
});
