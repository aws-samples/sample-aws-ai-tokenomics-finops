#!/usr/bin/env node
/**
 * AI Tokenomics FinOps pre-scan (Level 1, static).
 *
 * Runs the runbook's per-question evidence patterns (assets/assessment.json) over a workspace and prints
 * a fixed-size summary: capped hits per question, with file:line references. The agent reads this summary
 * instead of the repository.
 *
 * Guarantees: Node built-ins only; no network; read-only (writes nothing, only prints); never follows
 * symlinks; never opens secret-shaped files (.env, keys, credentials, Terraform state); withholds any
 * matched line that looks like it holds a secret; hard caps on files, bytes and output, with a
 * `truncated` marker when a cap is hit. Same input, same output: no clock, sorted traversal.
 *
 * Usage: node prescan.mjs [root] [--track track-1|track-2] [--lever <anchor>]... [--format md|json]
 *        [--max-hits 1-5] [--context 0|1] [--max-files N] [--max-bytes N]
 */

import { lstatSync, readdirSync, readFileSync, openSync, readSync, closeSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCHEMA = 'ai-finops-summary/1';
const HERE = dirname(fileURLToPath(import.meta.url));
export const ASSESSMENT = join(HERE, '..', 'assets', 'assessment.json');

export const DEFAULTS = { maxHits: 3, context: 0, maxFiles: 5000, maxBytes: 20 * 1024 * 1024, maxFileBytes: 1024 * 1024, lineWidth: 160 };

// Directories never entered: VCS, dependencies, build output, local caches, the assessment's own output.
const SKIP_DIRS = new Set(['.git', '.hg', '.svn', 'node_modules', '.venv', 'venv', '__pycache__', 'dist', 'build', 'out',
  'target', '.next', '.nuxt', '.terraform', 'cdk.out', '.serverless', '.aws-sam', 'coverage', 'vendor', '.aws', '.ssh',
  '.gnupg', '.ai-finops-assessment', '.idea', '.vscode']);

// Files never opened, because they commonly hold secrets.
const SECRET_FILE = /^(\.env(\..*)?|.*\.(pem|key|p12|pfx|jks|keystore|ppk|tfstate|tfstate\.backup|tfvars)|id_(rsa|dsa|ecdsa|ed25519)(\.pub)?|credentials(\..*)?|\.netrc|\.npmrc|\.pypirc|\.git-credentials|secrets?\..*|.*\.secrets?)$/i;

// A matched line that looks like it carries a secret value is reported by reference only.
const SECRET_LINE = /(secret|passw(or)?d|api[_-]?key|access[_-]?key|private[_-]?key|auth[_-]?token|bearer)\w*["']?\s*[:=]|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY/i;

/** Minimal glob -> RegExp: `**` (any depth), `*`, `?` and `{a,b}`, matched against a /-separated path. */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      i++;
      if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*';
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else if (c === '{') {
      const end = glob.indexOf('}', i);
      if (end < 0) throw new Error(`unclosed { in glob ${glob}`);
      re += '(?:' + glob.slice(i + 1, end).split(',').map((s) => s.replace(/[.+^$()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')).join('|') + ')';
      i = end;
    } else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$');
}

/** Evidence source of a file at Level 1: iac, docs, code or config. */
export function classify(rel, sets) {
  if (sets.iac.some((r) => r.test(rel))) return 'iac';
  if (/\.(md|mdx|rst|adoc|txt)$/i.test(rel)) return 'docs';
  if (sets.code.some((r) => r.test(rel))) return 'code';
  return 'config';
}

function isBinary(path) {
  const fd = openSync(path, 'r');
  try {
    const buf = Buffer.alloc(8192);
    const n = readSync(fd, buf, 0, buf.length, 0);
    return buf.subarray(0, n).includes(0);
  } finally { closeSync(fd); }
}

/** List candidate files under root, sorted, without following symlinks; counts what it skipped and why. */
function listFiles(root, opts, skipped) {
  const files = [];
  let truncated = null;
  const visit = (dir) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { skipped.unreadable++; return; }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    // The installed skill itself is not evidence about the user's project.
    if (entries.some((e) => e.name === 'SKILL.md') && dir.split(sep).pop() === 'ai-tokenomics-finops') { skipped.skillDir++; return; }
    for (const e of entries) {
      if (truncated) return;
      const p = join(dir, e.name);
      if (e.isSymbolicLink()) { skipped.symlink++; continue; }
      if (e.isDirectory()) { if (SKIP_DIRS.has(e.name)) skipped.ignoredDir++; else visit(p); continue; }
      if (!e.isFile()) continue;
      if (SECRET_FILE.test(e.name)) { skipped.secret++; continue; }
      if (files.length >= opts.maxFiles) { truncated = `file cap reached (${opts.maxFiles} files)`; return; }
      files.push(p);
    }
  };
  visit(root);
  return { files, truncated };
}

/**
 * Scan `root` for the given questions. Returns the fixed-size summary object (schema ai-finops-summary/1).
 * Levels 2 and 3 are planned to emit the same shape with a different `source`.
 */
export function scan(root, assessment, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  opts.maxHits = Math.min(5, Math.max(1, opts.maxHits | 0));
  opts.context = Math.min(1, Math.max(0, opts.context | 0));
  const sets = Object.fromEntries(Object.entries(assessment.globSets).map(([k, v]) => [k, v.map(globToRegExp)]));
  const questions = [];
  for (const t of assessment.tracks) for (const l of t.levers) for (const q of l.questions) {
    if (opts.track && t.id !== opts.track) continue;
    if (opts.levers && opts.levers.length && !opts.levers.includes(l.anchor)) continue;
    questions.push({ track: t.id, lever: l.anchor, ...q, res: q.spec.patterns.map((p) => new RegExp(p, 'i')), globs: q.spec.in.flatMap((s) => sets[s]) });
  }

  const skipped = { secret: 0, binary: 0, large: 0, ignoredDir: 0, symlink: 0, unreadable: 0, skillDir: 0 };
  const { files, truncated: listCap } = listFiles(root, opts, skipped);
  let truncated = listCap;
  let filesScanned = 0, bytesScanned = 0;
  const found = new Map(questions.map((q) => [q.key, { total: 0, bySource: {}, shown: [] }]));

  for (const path of files) {
    const rel = relative(root, path).split(sep).join('/');
    const wanted = questions.filter((q) => q.globs.some((r) => r.test(rel)));
    if (!wanted.length) continue;
    const size = lstatSync(path).size;
    if (size > opts.maxFileBytes) { skipped.large++; continue; }
    if (bytesScanned + size > opts.maxBytes) { truncated = truncated || `byte cap reached (${opts.maxBytes} bytes)`; break; }
    if (isBinary(path)) { skipped.binary++; continue; }
    const lines = readFileSync(path, 'utf8').split(/\r?\n/);
    filesScanned++; bytesScanned += size;
    const source = classify(rel, sets);
    for (const q of wanted) {
      const f = found.get(q.key);
      lines.forEach((line, i) => {
        if (!q.res.some((r) => r.test(line))) return;
        f.total++;
        f.bySource[source] = (f.bySource[source] || 0) + 1;
        if (f.shown.length >= opts.maxHits) return;
        const from = Math.max(0, i - opts.context), to = Math.min(lines.length - 1, i + opts.context);
        const text = [];
        for (let j = from; j <= to; j++) {
          const s = lines[j].trim();
          text.push(SECRET_LINE.test(s) ? '[line withheld: may hold a secret]' : s.length > opts.lineWidth ? s.slice(0, opts.lineWidth - 1) + '…' : s);
        }
        f.shown.push({ ref: `${rel}:${i + 1}`, source, text });
      });
    }
  }

  return {
    schema: SCHEMA,
    level: 1,
    source: 'static',
    caps: { maxHits: opts.maxHits, context: opts.context, maxFiles: opts.maxFiles, maxBytes: opts.maxBytes, maxFileBytes: opts.maxFileBytes },
    scanned: { files: filesScanned, bytes: bytesScanned },
    skipped,
    truncated: !!truncated,
    truncatedReason: truncated || null,
    questions: questions.map((q) => {
      const f = found.get(q.key);
      return { id: q.key, track: q.track, lever: q.lever, hits: f.total, bySource: f.bySource, shown: f.shown, more: f.total - f.shown.length };
    })
  };
}

/** Markdown rendering of the summary: one line per question, then its capped hits. */
export function renderMarkdown(s) {
  const out = [`# AI Tokenomics FinOps pre-scan (${s.schema}, level ${s.level}, ${s.source})`, ''];
  const sk = Object.entries(s.skipped).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(', ') || 'none';
  out.push(`Scanned ${s.scanned.files} files, ${s.scanned.bytes} bytes. Skipped: ${sk}. Caps: ${s.caps.maxHits} hits per question, ${s.caps.maxFiles} files, ${s.caps.maxBytes} bytes.`);
  out.push(s.truncated ? `TRUNCATED: ${s.truncatedReason}. Ask the user to narrow the path.` : 'Truncated: no.', '');
  let lever = null;
  for (const q of s.questions) {
    if (q.lever !== lever) { if (lever) out.push(''); out.push(`## ${q.track} · ${q.lever}`, ''); lever = q.lever; }
    const by = Object.entries(q.bySource).sort().map(([k, n]) => `${k} ${n}`).join(', ');
    out.push(`- ${q.id}: ${q.hits ? `${q.hits} hit${q.hits === 1 ? '' : 's'} (${by})` : 'no hits'}${q.more > 0 ? `, ${q.more} not shown` : ''}`);
    for (const h of q.shown) out.push(`  - ${h.ref} [${h.source}] ${h.text.map((t) => '`' + t.replace(/`/g, "'") + '`').join(' / ')}`);
  }
  return out.join('\n') + '\n';
}

function parseArgs(argv) {
  const o = { root: '.', levers: [], format: 'md' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[++i]; };
    if (a === '--track') o.track = v();
    else if (a === '--lever') o.levers.push(v());
    else if (a === '--format') o.format = v();
    else if (a === '--max-hits') o.maxHits = Number(v());
    else if (a === '--context') o.context = Number(v());
    else if (a === '--max-files') o.maxFiles = Number(v());
    else if (a === '--max-bytes') o.maxBytes = Number(v());
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else o.root = a;
  }
  if (!['md', 'json'].includes(o.format)) throw new Error('--format is md or json');
  return o;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const o = parseArgs(process.argv.slice(2));
    const assessment = JSON.parse(readFileSync(ASSESSMENT, 'utf8'));
    if (o.track && !assessment.tracks.some((t) => t.id === o.track)) throw new Error(`unknown track ${o.track}`);
    const s = scan(o.root, assessment, o);
    process.stdout.write(o.format === 'json' ? JSON.stringify(s, null, 1) + '\n' : renderMarkdown(s));
  } catch (e) {
    console.error(`prescan: ${e.message}`);
    process.exit(2);
  }
}
