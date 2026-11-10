# Example run

- [`sample-bedrock-app/`](sample-bedrock-app/): a tiny, invented Track 2 project on Amazon Bedrock with deliberate
  cost gaps. It is not runnable and not a recommended pattern.
- [`sample-findings/`](sample-findings/): the per-lever findings Kiro CLI 3.1.0 wrote when it ran this skill on that
  project (non-interactive, with a short list of user answers in the prompt, on 2026-11-10).
- [`sample-gap-report.md`](sample-gap-report.md): the report `scripts/report.mjs` assembled from those findings.
  `npm run verify:skill` regenerates it and fails if it differs.
