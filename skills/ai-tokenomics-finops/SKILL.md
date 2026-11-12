---
name: ai-tokenomics-finops
description: Run the AI Tokenomics FinOps self-assessment on the current workspace and write a gap report. Reviews code, config, IaC and design docs read-only for Amazon Bedrock token-cost levers (model choice, prompt caching, batch and service tiers, max tokens, reasoning effort, context, tools, guardrails, attribution) and for coding-agent cost practices. Use when the user asks to assess or reduce the token cost of an AI coding agent or an AI application on Amazon Bedrock, or asks for a tokenomics or AI FinOps gap report.
license: MIT-0
compatibility: Any agent that reads Agent Skills (SKILL.md). The pre-scan and report scripts need Node.js 18 or later and a shell; without them, search with the same patterns by hand.
metadata:
  source: https://github.com/aws-samples/sample-aws-ai-tokenomics-finops
  level: "1"
---

# AI Tokenomics FinOps self-assessment (Level 1: static review)

You run the [AI Tokenomics FinOps runbook](https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/) self-assessment against the user's own project and write a gap report. Every check is a runbook question, identified by its question ID.

## Rules

- **Read-only.** Never run the user's code, builds or tests, never edit their files, never make network calls. The only files you write are under `.ai-finops-assessment/` in the workspace root (ask first, and suggest adding it to `.gitignore`).
- **No secrets.** Never open `.env*`, keys, credential or token files, Terraform state, or anything under `~/.aws` or `~/.ssh`. Cite a secret's `path:line`, never its value.
- **Stay small.** Do not load all references up front. Load one track index, then one lever file at a time. Never cat or bulk-read the repo. Cite `path:line`; never paste file contents into findings.
- **Ask, don't dig.** When the evidence is ambiguous, or the pre-scan is truncated or the repo is too large, ask the user to narrow the path or answer the question directly instead of reading more files.
- **Never fabricate.** No evidence and no answer from the user means `unknown`.
- **Scope.** Amazon Bedrock inference, Kiro, and third-party clients that run on Amazon Bedrock. Mark anything else out of scope.
- **Not ranked.** Gaps stay in runbook order as bullets, never numbered, ranked or prioritised.

## Workflow

1. **Triage.** List the top two levels of the workspace. Agent config (`.kiro/`, `.claude/`, `.codex/`, `.opencode/`, `AGENTS.md`) suggests Track 1, AI Coding Assistant. Bedrock SDK calls, agent frameworks and IaC suggest Track 2, Purpose-Built Agentic AI Application. Say what you found and confirm the track or tracks with the user.
2. **Pre-scan.** Run `node <this skill>/scripts/prescan.mjs <workspace> --track <track-1|track-2>`. It prints a capped summary of hits per question ID with `path:line` refs and writes nothing. Read the summary, not the repo. Do not open project files whole.
3. **Pick levers.** Read `references/<track>/index.md`. Keep every lever, but for a scopable Track 2 lever with no hits that plainly does not apply (for example Retrieval in an app with no retrieval), ask the user whether to mark it out of scope. If the user can't answer, keep the lever in scope and mark its questions `unknown`.
4. **One lever at a time.** Read lever files one at a time, never in parallel; write that lever's findings before opening the next. Read `references/<track>/<lever>.md`, then read at most 20 lines around a pre-scan `path:line`, only when a hit needs context: pass your read tool a line range (offset and limit), never read a project file without one, even a short one. Answer each question with its answer, evidence source (`code`, `config`, `iac`, `docs` or `user`), `path:line` refs and confidence. Collect what only the user can answer and ask in one batch per lever or per layer. Write `.ai-finops-assessment/findings/<lever>.json` in the format in `references/findings-and-report.md`, then move on without carrying that lever's detail forward.
5. **Report.** Run `node <this skill>/scripts/report.mjs .ai-finops-assessment/findings --date <today> --workspace <name>` and save the script's stdout to `.ai-finops-assessment/report.md` with your file-write tool (do not use a shell redirect). Save it unchanged: never shorten, summarise or rewrite the report. Fix any findings problem it lists and re-run. Show the user the coverage line and the gaps, and end with the report's closing paragraph about the AWS account team.

Without a shell, apply each lever file's search patterns yourself (at most 5 matches per question), and write the report by hand as `references/findings-and-report.md` describes.

The live runbook keeps answers in the browser and has no import format, so nothing is exported to it.
