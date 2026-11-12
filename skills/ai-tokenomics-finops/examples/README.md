# Example run

This folder is the answer key for the sample project. Do not copy it into your skills folder.

- [`sample-bedrock-app/`](sample-bedrock-app/): a tiny, invented Track 2 project on Amazon Bedrock with deliberate
  cost gaps. It is not runnable and not a recommended pattern.
- [`sample-findings/`](sample-findings/): the per-lever findings Kiro CLI 3.1.0 wrote when it ran this skill on that
  project (non-interactive, 2026-11-10, workspace name `sample-bedrock-app`). Later smoke tests in Claude Code
  2.1.322 on Amazon Bedrock and Kiro CLI 3.2.1 with the same answers found the same gaps.
- [`sample-gap-report.md`](sample-gap-report.md): the report `scripts/report.mjs` assembled from those findings.
  `npm run verify:skill` regenerates it and fails if it differs.

## User answers given in the prompt

The run was non-interactive, so these answers were given up front (evidence source `user`); everything else came
from the files or was marked `unknown`:

- This is our own support assistant built on Amazon Bedrock. Assess Track 2 only.
- We have no evaluation set and do not measure cost per resolved ticket.
- Finance reviews the AWS bill monthly; there is no per-team chargeback beyond the resource tags.
- The web chat does not show users anything about cost or usage.
- Self-hosting or distillation is not on our roadmap, and the app has no retrieval; treat those two levers as out
  of scope.

To reproduce, copy `sample-bedrock-app/` somewhere outside this repo, install the skill into it, and give your agent
the answers above with the date and workspace name. Agent output varies between runs and models, so expect the same
gaps, not identical wording.
