# Runbook archive

Point-in-time snapshots of `../index.html`, kept so a content regression is provable rather than argued.
`scripts/verify-runbook.mjs` (structure) and `scripts/verify-runbook-facts.mjs` (facts) both diff the
live `../index.html` against the **newest** snapshot here. Between them they fail if any lever,
question, table, citation, worked example, `id` or external URL has been lost, or if any quantity,
price, code identifier or citation has left the document.

```bash
npm run verify             # static + facts + headless-Chromium DOM checks
npm run verify:static      # counts + id/URL/anchor set-differences vs this archive
npm run verify:facts       # quantities, prices, identifiers, citations vs this archive
```

| File | Date | Why kept |
|---|---|---|
| `index-2026-10-29-github-pages-b5a9736.html` | 29 Oct 2026 | **Current baseline.** The runbook as first published on GitHub, from upstream commit `b5a9736`. Taken only after the published file passed both verifiers against the previous upstream baseline with exactly the expected differences: the internal greeting element (`#whoami`), the internal community-channel link, and the three brand tokens of the old title. Every lever, question, table, figure, worked card, citation and fact token is otherwise identical to that baseline. |

## Baseline counts in `index-2026-10-29-github-pages-b5a9736.html`

| Item | Count |
|---|---|
| `<h4 id=` (levers, checklists and principles) | 33 |
| Levers in the lever-index table | 35 |
| Assessment questions (`class="assess-q"`) | 69 |
| Assessment blocks (`class="assess"`) | 26 |
| Per-layer summary panels (`class="assess-report"`) | 6 |
| Worked cost cards (`class="worked-card"`) | 4 |
| Data tables (`<table>`) | 26 |
| Reference entries (unique `id="ref-N"`) | 136 |
| `<figure>` | 5 |
| Unique `id=` attributes | 242 |
| Unique external URLs | 137 |
| Unique fact tokens (`verify:facts`) | 666 (1,060 section/fact owner pairs) |

## Rules

- **Snapshots are immutable.** Never edit a file in here. If the runbook changes, the diff belongs in
  the live file and in the verifier's output, not in a rewritten snapshot.
- **Add a new snapshot only at a meaningful milestone**: a release, or before a structural change large
  enough that a content-loss argument is plausible. One row per snapshot in the table above, with the
  reason.
- **Name it `index-YYYY-MM-DD-<label>-<commit>.html`.** The date is load-bearing:
  `scripts/lib/archive.mjs` orders snapshots by it rather than alphabetically.
- **The verifiers read the newest snapshot.** Adding one re-baselines *both* checks, so only add one
  once the current file has passed against the previous snapshot. Adding a snapshot is the only way to
  move the floor; that is deliberate, so re-baselining is a reviewable act in a pull request. Check
  that the new file actually became the baseline:

  ```bash
  node -e "import('./scripts/lib/archive.mjs').then(m=>console.log(m.newestSnapshot('content/archive')))"
  ```

- Snapshots are **not** published: `scripts/build-site.mjs` reads only `../index.html`.
