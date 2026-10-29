/**
 * Which archive snapshot is the baseline.
 *
 * Shared by `verify-runbook.mjs` (structure) and `verify-runbook-facts.mjs` (facts) because the two
 * checks MUST agree on it. If they baseline against different snapshots, one can pass while the
 * other fails on the same file and neither result means anything.
 *
 * Ordering is by the ISO date embedded in the filename, NOT by `.sort()`. A plain alphabetical sort
 * ranks `index-beta-v0.9-9476b2b.html` BEFORE `index-beta-v0.9-b299029.html`, because '9' < 'b' —
 * so adding a newer snapshot whose commit happens to start with a digit would silently leave the
 * older one as the baseline, and the re-baselining would be a no-op nobody noticed. That is the
 * failure this module exists to prevent.
 *
 * Convention: `index-YYYY-MM-DD-<label>-<commit>.html`.
 * Legacy snapshots with no date sort oldest, so they can never shadow a dated one.
 */

import { readdirSync } from 'node:fs';

const SNAPSHOT = /^index-.*\.html$/;
const ISO_DATE = /index-(\d{4}-\d{2}-\d{2})-/;

/** All snapshot filenames, oldest → newest. */
export function snapshotsOldestFirst(archiveDir) {
  return readdirSync(archiveDir)
    .filter((f) => SNAPSHOT.test(f))
    .map((name) => ({ name, date: (name.match(ISO_DATE) || [, ''])[1] }))
    .sort((a, b) => (a.date === b.date ? a.name.localeCompare(b.name) : a.date.localeCompare(b.date)))
    .map((s) => s.name);
}

/** The newest snapshot filename, or null if the archive holds none. */
export function newestSnapshot(archiveDir) {
  const all = snapshotsOldestFirst(archiveDir);
  return all.length ? all[all.length - 1] : null;
}
