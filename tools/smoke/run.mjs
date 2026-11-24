#!/usr/bin/env node
/**
 * Local smoke run of the agent skill in one coding-agent client. Not run in CI: it calls a paid client.
 *
 * Usage: node tools/smoke/run.mjs --client claude|codex|kiro [--bin <client binary>] [--log <file>]
 *        [--timeout <minutes>]
 *        node tools/smoke/run.mjs --recheck <run dir>    (re-check a saved run; prints the line, appends nothing)
 *
 * It copies the sample project to a fresh temporary folder, installs the skill where the client looks for project
 * skills, runs the client headless with one fixed prompt, and checks the run:
 *   first_action     the first tool call opens this skill's SKILL.md (not a listing, search or other command)
 *   file_tools_only  every shell call is one of the skill's own scripts (prescan, report, read), unchained
 *   report_valid     the findings pass the report script's validator and the report file exists
 *   report_identical the report file is byte for byte what the report script prints for the same arguments
 * and appends one JSON line to the smoke log. The line holds no paths, names, hosts, ids, tokens or costs.
 * Node built-ins only.
 */

import { spawnSync, spawn } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKILL = join(ROOT, 'skills', 'ai-tokenomics-finops');
const SAMPLE = join(SKILL, 'examples', 'sample-bedrock-app');
const SKILL_FILES = ['SKILL.md', 'references', 'assets', 'scripts']; // never examples/: it holds the answer key
const WORKSPACE = 'sample-bedrock-app';
const PERSONA = 'ai-pm-leader';
const OUT = '.ai-finops-assessment';

// Bookkeeping tools that touch no file and run nothing; they do not count as the first action.
const BOOKKEEPING = new Set(['TodoWrite', 'todo_list', 'todo']);

const CLIENTS = {
  claude: {
    bin: 'claude',
    skillsDir: '.claude/skills',
    args: (prompt) => ['-p', prompt, '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits',
      '--allowedTools', 'Read,Write,Edit,Glob,Grep,Skill,Bash(node:*)'],
    parse: parseClaude
  },
  codex: {
    bin: 'codex',
    skillsDir: '.agents/skills',
    args: (prompt, ws) => ['exec', '--json', '--sandbox', 'workspace-write', '--skip-git-repo-check', '--ephemeral', '-C', ws, prompt],
    parse: parseCodex
  },
  kiro: {
    bin: 'kiro-cli',
    skillsDir: '.kiro/skills',
    args: (prompt) => ['chat', '--no-interactive', '--output-format', 'stream-json', '--trust-tools=fs_read,fs_write,execute_bash', prompt],
    parse: parseKiro
  }
};

export const prompt = (date) => [
  'Use the ai-tokenomics-finops skill to run the AI Tokenomics FinOps assessment on this repo.',
  'This run is non-interactive, so here are my answers up front.',
  'This is our own support assistant built on Amazon Bedrock. Assess Track 2 only. Persona: ai-pm-leader.',
  'We have no evaluation set and do not measure cost per resolved ticket.',
  'Finance reviews the AWS bill monthly; there is no per-team chargeback beyond the resource tags.',
  'The web chat does not show users anything about cost or usage.',
  'Self-hosting or distillation is not on our roadmap, and the app has no retrieval; treat those two levers as out of scope.',
  `You may write under ${OUT}/ without asking; leave .gitignore alone.`,
  `Today is ${date} and the workspace name is ${WORKSPACE}.`
].join(' ');

// ---------- transcript parsing: each client's events -> [{ kind, name, path?, command? }] ----------

function jsonLines(text) {
  return text.split('\n').flatMap((l) => { try { return l.trim() ? [JSON.parse(l)] : []; } catch { return []; } });
}

export function parseClaude(text) {
  const calls = [];
  for (const e of jsonLines(text)) {
    if (e.type !== 'assistant') continue;
    for (const c of e.message?.content || []) {
      if (c.type !== 'tool_use') continue;
      const i = c.input || {};
      const kind = { Read: 'read', Write: 'write', Edit: 'write', MultiEdit: 'write', NotebookEdit: 'write', Bash: 'shell',
        Glob: 'list', LS: 'list', Grep: 'search', Skill: 'skill' }[c.name] || 'other';
      calls.push({ kind, name: c.name, path: i.file_path || i.path, command: i.command, skill: i.skill || i.command });
    }
  }
  return calls;
}

export function parseCodex(text) {
  const calls = [];
  for (const e of jsonLines(text)) {
    if (e.type !== 'item.started' && e.type !== 'item.completed') continue;
    const it = e.item || {};
    if (calls.some((c) => c.id === it.id)) continue;
    if (it.type === 'command_execution') calls.push({ id: it.id, kind: 'shell', name: 'shell', command: unwrapShell(it.command) });
    else if (it.type === 'file_change') calls.push({ id: it.id, kind: 'write', name: 'patch', path: it.changes?.[0]?.path });
    else if (['mcp_tool_call', 'web_search'].includes(it.type)) calls.push({ id: it.id, kind: 'other', name: it.type });
  }
  return calls;
}

export function parseKiro(text) {
  const calls = [];
  for (const e of jsonLines(text)) {
    const u = e.type === 'sessionUpdate' ? e.data?.update : null;
    if (!u || u.sessionUpdate !== 'tool_call' || calls.some((c) => c.id === u.toolCallId)) continue;
    const name = u._meta?.kiro?.toolName || u.kind || 'tool';
    const raw = u.rawInput || {};
    const ops = raw.operations || [];
    const path = u.locations?.[0]?.path || ops[0]?.path || raw.path;
    let kind = { read: 'read', edit: 'write', delete: 'write', move: 'write', execute: 'shell', search: 'search' }[u.kind] || 'other';
    if (kind === 'read' && ops.some((o) => o.mode === 'Directory')) kind = 'list';
    if (kind === 'read' && ops.some((o) => o.mode === 'Search')) kind = 'search';
    if (/shell|bash|execute/i.test(name)) kind = 'shell';
    if (BOOKKEEPING.has(name)) kind = 'other';
    calls.push({ id: u.toolCallId, kind, name, path, command: raw.command });
  }
  return calls;
}

/** `bash -lc 'node x'` -> `node x`, so the check sees the command the model wrote. */
export function unwrapShell(cmd) {
  const s = Array.isArray(cmd) ? cmd.join(' ') : String(cmd || '');
  const m = s.match(/^(?:\S*\/)?(?:ba|z)?sh\s+-l?c\s+(['"])([\s\S]*)\1\s*$/);
  return m ? m[2] : s;
}

// ---------- checks ----------

const SKILL_SCRIPT = /^node\s+(?:"[^"]*|'[^']*|\S*)scripts\/(prescan|report|read)\.mjs['"]?(?:\s|$)/;
const CHAINED = /&&|\|\||[;|<>`]|\$\(/;
export const allowedShell = (cmd) => SKILL_SCRIPT.test(cmd.trim()) && !CHAINED.test(cmd);
const isSkillMd = (p) => /(^|\/)ai-tokenomics-finops\/SKILL\.md$/.test(p || '');

/** A short, path-free description of a tool call, and whether it opens SKILL.md. */
export function describe(call) {
  if (!call) return { text: 'none', opensSkill: false };
  if (call.kind === 'skill') return { text: `skill ${String(call.skill || '').replace(/[^\w-]/g, '')}`, opensSkill: /ai-tokenomics-finops/.test(call.skill || '') };
  if (call.kind === 'read') return { text: `read ${basename(call.path || '?')}`, opensSkill: isSkillMd(call.path) };
  if (call.kind === 'shell') {
    const cmd = call.command || '';
    const script = cmd.match(SKILL_SCRIPT)?.[1];
    if (script === 'read') {
      const file = cmd.match(/read\.mjs['"]?\s+['"]?(\S+?)['"]?(?:\s|$)/)?.[1];
      return { text: `read.mjs ${basename(file || '?')}`, opensSkill: isSkillMd(file) && !CHAINED.test(cmd) };
    }
    if (script) return { text: `${script}.mjs`, opensSkill: false };
    return { text: `shell ${basename(cmd.trim().split(/\s+/)[0] || '?')}`, opensSkill: false };
  }
  return { text: call.kind === 'other' ? call.name : call.kind, opensSkill: false };
}

function tokenize(cmd) {
  return [...cmd.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
}

/** The report script's arguments as the agent ran them, without --out; null when it never ran it. */
export function reportArgs(calls) {
  const run = [...calls].reverse().find((c) => c.kind === 'shell' && /scripts\/report\.mjs/.test(c.command || '') && /--out/.test(c.command));
  if (!run) return null;
  const t = tokenize(run.command.trim());
  const out = [];
  for (let i = 2; i < t.length; i++) {
    if (t[i] === '--out') { i++; continue; }
    out.push(t[i]);
  }
  return out;
}

async function checkReport(ws, calls, date) {
  const report = join(ws, OUT, 'report.md');
  const findings = join(ws, OUT, 'findings');
  if (!existsSync(report)) return { report_valid: false, report_identical: false, reason: 'no report produced' };
  const { loadFindings } = await import(join(SKILL, 'scripts', 'report.mjs'));
  const assessment = JSON.parse(readFileSync(join(SKILL, 'assets', 'assessment.json'), 'utf8'));
  const args = reportArgs(calls) || [`${OUT}/findings`, '--date', date, '--workspace', WORKSPACE, '--persona', PERSONA];
  const persona = args.includes('--persona') ? args[args.indexOf('--persona') + 1] : undefined;
  const files = existsSync(findings) ? readdirSync(findings).filter((n) => n.endsWith('.json')) : [];
  const { errors } = files.length ? loadFindings(findings, assessment, { persona }) : { errors: ['no findings'] };
  const md = readFileSync(report);
  const report_valid = !errors.length && md.toString('utf8').startsWith('# AI Tokenomics FinOps assessment');
  const r = spawnSync(process.execPath, [join(SKILL, 'scripts', 'report.mjs'), ...args], { cwd: ws, maxBuffer: 1 << 26 });
  const report_identical = r.status === 0 && Buffer.compare(r.stdout, md) === 0;
  return { report_valid, report_identical, reason: report_valid ? undefined : 'findings or report did not validate' };
}

/** Build the log line from a finished (or failed) run. */
export async function evaluate({ client, version, ws, transcript, date, wallSeconds, startError, runError }) {
  const calls = transcript ? CLIENTS[client].parse(transcript) : [];
  const line = { date: new Date().toISOString(), client, client_version: version, skill_commit: skillCommit() };
  if (startError || !calls.length) {
    return { ...line, first_action: 'not started', shell_calls: 0,
      checks: { first_action: false, file_tools_only: false, report_valid: false, report_identical: false },
      pass: false, wall_seconds: wallSeconds, reason: startError || runError || 'client made no tool call' };
  }
  const first = describe(calls.find((c) => !BOOKKEEPING.has(c.name)));
  const shell = calls.filter((c) => c.kind === 'shell');
  const rep = await checkReport(ws, calls, date);
  const checks = { first_action: first.opensSkill, file_tools_only: shell.every((c) => allowedShell(c.command || '')),
    report_valid: rep.report_valid, report_identical: rep.report_identical };
  const pass = Object.values(checks).every(Boolean);
  return { ...line, first_action: first.text, shell_calls: shell.length, checks, pass, wall_seconds: wallSeconds,
    ...(pass ? {} : { reason: runError || rep.reason || failed(checks) }) };
}

const failed = (checks) => `failed: ${Object.keys(checks).filter((k) => !checks[k]).join(', ')}`;

function skillCommit() {
  const git = (...a) => spawnSync('git', ['-C', ROOT, ...a], { encoding: 'utf8' });
  const sha = git('rev-parse', 'HEAD').stdout.trim() || 'unknown';
  return git('status', '--porcelain', '--', 'skills/ai-tokenomics-finops').stdout.trim() ? `${sha}+dirty` : sha;
}

function clientVersion(bin) {
  const r = spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 30000 });
  if (r.error) return { error: r.error.code === 'ENOENT' ? 'client binary not found' : 'client did not start' };
  return { version: `${r.stdout}${r.stderr}`.match(/\d+\.\d+\.\d+/)?.[0] || 'unknown' };
}

function setUp(client) {
  const run = realpathSync(mkdtempSync(join(tmpdir(), 'ai-finops-smoke-')));
  const ws = join(run, WORKSPACE);
  cpSync(SAMPLE, ws, { recursive: true });
  const dest = join(ws, CLIENTS[client].skillsDir, 'ai-tokenomics-finops');
  mkdirSync(dest, { recursive: true });
  for (const f of SKILL_FILES) cpSync(join(SKILL, f), join(dest, f), { recursive: true });
  spawnSync('git', ['init', '-q'], { cwd: ws });
  return { run, ws };
}

function runClient(bin, args, ws, minutes, transcriptPath) {
  return new Promise((done) => {
    const started = Date.now();
    const out = [], err = [];
    let child;
    try { child = spawn(bin, args, { cwd: ws, stdio: ['ignore', 'pipe', 'pipe'], detached: true }); } catch (e) { done({ startError: 'client did not start', wall: 0 }); return; }
    let timedOut = false;
    // Kill the whole process group: clients spawn helpers that would otherwise hold the pipes open.
    const timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); } }, minutes * 60000);
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => err.push(d));
    child.on('error', (e) => { clearTimeout(timer); done({ startError: e.code === 'ENOENT' ? 'client binary not found' : 'client did not start', wall: 0 }); });
    child.on('close', (code) => {
      clearTimeout(timer);
      const transcript = Buffer.concat(out).toString('utf8');
      writeFileSync(transcriptPath, transcript);
      writeFileSync(`${transcriptPath}.stderr`, Buffer.concat(err));
      const wall = Math.round((Date.now() - started) / 1000);
      done({ transcript, wall, code, timedOut });
    });
  });
}

function parseArgs(argv) {
  const o = { timeout: 45, log: join(ROOT, 'tools', 'smoke', 'smoke-log.jsonl') };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[++i]; };
    if (a === '--client') o.client = v();
    else if (a === '--bin') o.bin = v();
    else if (a === '--log') o.log = v();
    else if (a === '--timeout') o.timeout = Number(v());
    else if (a === '--recheck') o.recheck = v();
    else throw new Error(`unknown argument ${a}`);
  }
  if (!o.recheck && !CLIENTS[o.client]) throw new Error(`--client must be one of ${Object.keys(CLIENTS).join(', ')}`);
  if (!(o.timeout > 0)) throw new Error('--timeout must be a positive number of minutes');
  return o;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.recheck) {
    const meta = JSON.parse(readFileSync(join(o.recheck, 'meta.json'), 'utf8'));
    const transcript = existsSync(join(o.recheck, 'transcript.jsonl')) ? readFileSync(join(o.recheck, 'transcript.jsonl'), 'utf8') : '';
    console.log(JSON.stringify(await evaluate({ ...meta, ws: join(o.recheck, WORKSPACE), transcript })));
    return;
  }
  const c = CLIENTS[o.client];
  const bin = o.bin || c.bin;
  const date = new Date().toISOString().slice(0, 10);
  const v = clientVersion(bin);
  let line;
  if (v.error) {
    line = await evaluate({ client: o.client, version: null, date, wallSeconds: 0, startError: v.error });
  } else {
    const { run, ws } = setUp(o.client);
    console.error(`smoke: ${o.client} ${v.version} in ${run}`);
    const r = await runClient(bin, c.args(prompt(date), ws), ws, o.timeout, join(run, 'transcript.jsonl'));
    const runError = r.timedOut ? `timed out after ${o.timeout} min`
      : r.code !== 0 && !r.startError ? `client exited with code ${r.code}` : undefined;
    const meta = { client: o.client, version: v.version, date, wallSeconds: r.wall, startError: r.startError, runError };
    writeFileSync(join(run, 'meta.json'), JSON.stringify(meta));
    line = await evaluate({ ...meta, ws, transcript: r.transcript });
  }
  appendFileSync(o.log, `${JSON.stringify(line)}\n`);
  console.log(JSON.stringify(line));
  process.exitCode = line.pass ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  main().catch((e) => { console.error(`smoke: ${e.message}`); process.exit(2); });
}
