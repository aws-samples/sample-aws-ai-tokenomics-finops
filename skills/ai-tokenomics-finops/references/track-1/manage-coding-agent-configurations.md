<!-- GENERATED from content/ by scripts/build-skill.mjs. Do not edit; run `npm run build:skill`. -->

# Manage coding agent configurations

- Track: Track 1 - AI Coding Assistant · Agent Harness
- Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#manage-coding-agent-configurations
- What it saves: Expensive optional features off by default, fleet-wide — agent teams, the 1M-token context window, scheduled tasks — instead of trusting each developer to notice they're moving the bill. The saving stays invisible until you inventory what's switched on.

Answer each question with: `yes` (Fully covered), `wip` (Partially), `no` (Not covered), `na` (N/A), or `unknown` when neither the files nor the user answer it.

## `mcc-q1` Do you maintain an evidence-backed inventory of optional features that materially increase token use?

- Fully covered looks like: You cannot manage what you have not inventoried. Work with your internal AI champions (Developer education, Q4) to list the optional capabilities enabled across the fleet.
- Evidence: An inventory of optional agent features that raise token use (agent teams, 1M context, scheduled tasks).
- Search: docs, agent-config files for `agent teams?`, `1M|1m-context|context window`, `scheduled tasks?|background agents?`, `token.?(hungry|heavy|cost)`

## `mcc-q2` Have you disabled these token-hungry features centrally?

- Fully covered looks like: Turn the inventory into version-controlled fleet configuration alongside model and reasoning-effort defaults. Use managed settings where the product provides them (Claude Code settings, available settings [80]; Claude Code, Permissions [81]).
- Evidence: Managed or shared settings that switch those features off centrally.
- Search: agent-config, config files for `managed-settings`, `DISABLE_\w+`, `"disable\w*"\s*:\s*true`, `enabled\s*[:=]\s*false`

## Citations

- [100] Subagents. OpenAI Codex documentation. https://learn.chatgpt.com/docs/agent-configuration/subagents
- [80] Settings: available settings. Claude Code documentation. https://code.claude.com/docs/en/settings#available-settings
- [81] Permissions. Claude Code documentation. https://code.claude.com/docs/en/permissions
- [122] Deploy managed settings. Claude Code Docs, Anthropic. https://code.claude.com/docs/en/managed-settings
- [101] Model Context Protocol configuration. OpenAI Codex documentation. https://developers.openai.com/codex/extend/mcp

Glob sets: docs = **/*.{md,mdx,rst,adoc,txt}; agent-config = **/.kiro/** **/.claude/** **/.codex/** **/.opencode/** **/.agents/** **/AGENTS.md **/CLAUDE.md **/.mcp.json **/mcp.json **/opencode.json; config = **/*.{json,jsonc,yaml,yml,toml,ini,cfg,conf,properties}
