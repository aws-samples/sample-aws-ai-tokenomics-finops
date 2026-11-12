# AI Tokenomics FinOps agent skill

Runs the [AI Tokenomics FinOps runbook](https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/) self-assessment
inside your coding agent, against your own project. It reviews code, config, IaC and docs read-only, asks you what the
files cannot show, and drafts the same unranked gap report the runbook exports. It follows the open
[Agent Skills](https://agentskills.io/specification) format: one folder with a `SKILL.md`.

## Install

Copy the skill into your client's skills directory, without `examples/`: it holds the sample project's answer key,
which an agent could mistake for evidence.

```sh
git clone --depth 1 https://github.com/aws-samples/sample-aws-ai-tokenomics-finops.git
mkdir -p <skills directory>/ai-tokenomics-finops
cd sample-aws-ai-tokenomics-finops/skills/ai-tokenomics-finops
cp -r SKILL.md references assets scripts <skills directory>/ai-tokenomics-finops/
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
disk, and `scripts/report.mjs` assembles the report.

Measured on the sample project (Track 2, 2026-11-12):

- **Skill content loaded:** about 15k tokens (bytes ÷ 4 of what the agent read: `SKILL.md`, the pre-scan summary, the
  track index, 17 lever files and ranged project reads), against about 36k for the skill, every reference and the
  whole project loaded up front.
- **Example billed usage, Claude Code 2.1.322 on Amazon Bedrock** (`us.anthropic.claude-sonnet-5-5`, 50 turns):
  58 uncached input, 92,673 cache-write, 2,028,596 cache-read and 21,392 output tokens, about $0.65 at list price.
  Billed tokens far exceed the content loaded because the harness prompt and the conversation are resent every turn.
- Kiro does not expose per-session token counts, so no billed figure is given for it.

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
