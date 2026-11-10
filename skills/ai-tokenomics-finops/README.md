# AI Tokenomics FinOps agent skill

Runs the [AI Tokenomics FinOps runbook](https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/) self-assessment
inside your coding agent, against your own project. It reviews code, config, IaC and docs read-only, asks you what the
files cannot show, and drafts the same unranked gap report the runbook exports. It follows the open
[Agent Skills](https://agentskills.io/specification) format: one folder with a `SKILL.md`.

## Install

Copy this folder into your client's skills directory:

```sh
git clone --depth 1 https://github.com/aws-samples/sample-aws-ai-tokenomics-finops.git
cp -r sample-aws-ai-tokenomics-finops/skills/ai-tokenomics-finops <skills directory>/
```

| Client | Project skills directory | Personal skills directory | Source |
|---|---|---|---|
| Kiro (IDE and CLI) | `.kiro/skills/` | `~/.kiro/skills/` | [Kiro: Agent Skills](https://kiro.dev/docs/skills/) (the IDE can also import a skill from a GitHub folder URL) |
| Claude Code on Amazon Bedrock | `.claude/skills/` | `~/.claude/skills/` | [Claude Code: skills](https://code.claude.com/docs/en/skills) |
| OpenAI Codex with Amazon Bedrock (CLI, IDE extension) | `.agents/skills/` | `~/.agents/skills/` | [Codex: skills](https://developers.openai.com/codex/skills) |
| OpenCode with Amazon Bedrock | `.opencode/skills/` (also reads `.claude/skills/`, `.agents/skills/`) | `~/.config/opencode/skills/` | [OpenCode: skills](https://opencode.ai/docs/skills) |

Other agents: put the folder anywhere in the repo and add one line to `AGENTS.md`, or paste it as a prompt:
`For an AI Tokenomics FinOps assessment, read and follow skills/ai-tokenomics-finops/SKILL.md.`

## Use

> Run the AI Tokenomics FinOps assessment on this repo.

Or invoke it directly: `/ai-tokenomics-finops` in Kiro and Claude Code, `$ai-tokenomics-finops` in Codex. See
[`examples/`](examples/) for a real run and its report.

## How it keeps a run small

A triage step picks the track. A local pre-scan (`scripts/prescan.mjs`) runs each question's search patterns and
prints a fixed-size summary with `path:line` refs (default 3 hits per question, 160 characters a line, hard caps on
files and bytes, marked `TRUNCATED` when hit). The agent then loads one lever at a time and writes its findings to
disk, and `scripts/report.mjs` assembles the report. On the sample project, a Kiro CLI run loaded about 16k tokens
with triage, against about 33k for the skill plus every reference and the project files (bytes ÷ 4).

## Privacy

It runs locally in your agent. It reads your project and changes nothing in it: the only files it writes are under
`.ai-finops-assessment/`. The scripts use no dependencies, make no network calls, skip secret-shaped files (`.env`,
keys, credentials, Terraform state) and withhold any line that looks like a secret. Nothing leaves your machine
beyond what your agent already sends to its model provider.

## Roadmap (planned, not shipped)

This release is Level 1: static review only.

- Level 2 (opt-in, Track 1): a local, deterministic script reads coding-agent session logs and extracts aggregates only (token counts, model IDs, turns, cache reads and writes, compactions), never prompt or code content; the skill reasons over that summary. Per-client adapters, starting with Claude Code and Codex configured for Amazon Bedrock, and Kiro if its log format is documented. It never installs hooks or edits your config by default.
- Level 3 (opt-in, both tracks): read-only AWS access to Amazon Bedrock CloudWatch metrics, model invocation logs and the Cost and Usage Report for organisation-level, client-agnostic evidence, as aggregates only.
- Both will emit the pre-scan's fixed-size summary shape (`ai-finops-summary/1`) with evidence sources `session-logs` and `aws-metrics`, which are reserved now and rejected by `scripts/report.mjs`.

## Maintainers

`references/` and `assets/` are generated from `content/index.html` and `content/assessment-evidence.json` by
`npm run build:skill`; do not edit them. `npm run verify:skill` fails on drift, on a question without an evidence spec
and on a spec without a question. Build and test commands are in [CONTRIBUTING](../../CONTRIBUTING.md#build-and-verify).
