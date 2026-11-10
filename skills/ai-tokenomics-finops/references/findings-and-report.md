<!-- GENERATED from content/ by scripts/build-skill.mjs. Do not edit; run `npm run build:skill`. -->

# Findings files and the gap report

Write one findings file per assessed lever, `.ai-finops-assessment/findings/<lever>.json`, as soon as that lever is answered:

```json
{ "lever": "<lever file name without .md>", "outOfScope": false,
  "answers": [{ "id": "<question id>", "answer": "<answer>", "source": "<evidence source>",
                "refs": ["path/to/file.py:42"], "confidence": "high", "note": "one short sentence" }] }
```

- answer: `yes`, `wip`, `no`, `na` or `unknown`
- source: `code`, `config`, `iac`, `docs`, `user`; `none` only with `unknown`. Reserved for later levels, never use now: `session-logs`, `aws-metrics`.
- refs: `path:line` or `path:line-line`, never pasted file content; required for code, config, iac and docs answers.
- confidence: `high`, `medium` or `low`. A `user` answer needs a note saying what the user said.

Then assemble the report (it validates every file and exits 2 with the problems):

```sh
node <skill>/scripts/report.mjs .ai-finops-assessment/findings --date YYYY-MM-DD --workspace <name> > .ai-finops-assessment/report.md
```

Without a shell, write the report by hand in the same shape: title, date line, the disclaimer quote, a coverage line, "Gaps to address" (levers with a Not covered or Partially answer, in runbook order, each with its runbook link and "What it saves" line), "Full answer log" (every lever and question), and "Next step" with the paragraph below, copied exactly. Do not rank or prioritise gaps.

Disclaimer:

> Published as-is under MIT-0; this is not official AWS documentation. Prices and features change, so check the linked AWS pages before relying on a figure. This report was drafted by an AI agent from a read-only review of the workspace and the user's answers; check each answer before acting on it.

Next step:

This self-service assessment shows where your gaps are, but it does not rank or prioritise them. If you are an AWS customer and want a prioritised plan, share your gap report with your AWS account team and ask for a specialist-led engagement.
