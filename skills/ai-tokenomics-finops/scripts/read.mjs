#!/usr/bin/env node
/**
 * Ranged, line-numbered file read for clients that have a shell but no file-read tool (for example Codex).
 *
 * Usage: node read.mjs <file> <start> <end>      (1-based, inclusive; run from the workspace root)
 *
 * Guarantees: Node built-ins only; no network; writes nothing. Resolves real paths and refuses anything
 * outside the workspace root (the current directory) or this skill's own folder, symlinks included.
 * Refuses secret-shaped files and dirs with the same rules as prescan.mjs, withholds any line that looks
 * like it holds a secret, and prints at most MAX_LINES lines.
 */

import { readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SECRET_FILE, SECRET_LINE } from './prescan.mjs';

export const MAX_LINES = 40;
const MAX_BYTES = 1024 * 1024;
const SECRET_DIRS = new Set(['.aws', '.ssh', '.gnupg']);
const SKILL_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

const inside = (base, p) => { const r = relative(base, p); return r === '' || (!r.startsWith('..') && !isAbsolute(r)); };

/** Return lines start..end of `file` (capped at MAX_LINES), numbered. Throws on any refused read. */
export function readRange(file, start, end, { root = process.cwd() } = {}) {
  const a = Number(start), b = Number(end);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < a) throw new Error('start and end must be whole numbers with 1 <= start <= end');
  let real;
  try { real = realpathSync(resolve(root, file)); } catch { throw new Error(`not found: ${file}`); }
  const base = [realpathSync(root), realpathSync(SKILL_DIR)].find((d) => inside(d, real));
  if (!base) throw new Error(`refused: ${file} is outside the workspace`);
  const parts = relative(base, real).split(sep);
  if (parts.some((s) => SECRET_DIRS.has(s)) || SECRET_FILE.test(parts.at(-1))) throw new Error(`refused: ${file} may hold secrets`);
  const st = statSync(real);
  if (!st.isFile()) throw new Error(`not a file: ${file}`);
  if (st.size > MAX_BYTES) throw new Error(`refused: ${file} is over ${MAX_BYTES} bytes`);
  const lines = readFileSync(real, 'utf8').split(/\r?\n/);
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  if (a > lines.length) throw new Error(`start ${a} is past the end of ${file} (${lines.length} lines)`);
  const last = Math.min(b, a + MAX_LINES - 1, lines.length);
  const out = [`${file} lines ${a}-${last} of ${lines.length}`];
  for (let i = a; i <= last; i++) out.push(`${i}: ${SECRET_LINE.test(lines[i - 1]) ? '[line withheld: may hold a secret]' : lines[i - 1]}`);
  if (b > last && last < lines.length) out.push(`(capped at ${MAX_LINES} lines; read ${last + 1}-${Math.min(b, lines.length)} next if you need it)`);
  return out.join('\n') + '\n';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const [file, start, end, ...rest] = process.argv.slice(2);
    if (!file || !start || !end || rest.length) throw new Error('usage: node read.mjs <file> <start> <end>');
    process.stdout.write(readRange(file, start, end));
  } catch (e) {
    console.error(`read: ${e.message}`);
    process.exit(2);
  }
}
