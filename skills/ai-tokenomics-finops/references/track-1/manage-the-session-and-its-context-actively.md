<!-- GENERATED from content/ by scripts/build-skill.mjs. Do not edit; run `npm run build:skill`. -->

# Manage the session and its context actively

- Track: Track 1 - AI Coding Assistant · End User
- Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#manage-the-session-and-its-context-actively
- What it saves: 20 to 40 per cent on long sessions from the documented context habits. Delegating noisy work protects the main thread but can increase total tokens, so count it only when measured cost per successful task improves (Measure cost per successful task).

Answer each question with: `yes` (Fully covered), `wip` (Partially), `no` (Not covered), `na` (N/A), or `unknown` when neither the files nor the user answer it.

## `msc-q1` Do developers reset context between unrelated tasks, rather than waiting for automatic compaction?

- Fully covered looks like: Run the assistant's clear command when you start a new task. Do not wait for auto-compaction. By the time it fires, the context is already full and you have paid for far more tokens than the task needed. The vendor's own worked comparison puts three tasks run in one session at 1.9x the tokens of the same three with a clear between them (Maximizing the value of your Claude Code sessions [90]).
- Evidence: Guidance to reset context between unrelated tasks rather than wait for compaction.
- Search: docs, agent-config files for `/clear|/new|/compact`, `(reset|clear) (the )?context|new session`
- Usually only the user knows: search, then ask.

## `msc-q2` Do you use rewind features to unwind a change the coding agent made?

- Fully covered looks like: If the agent goes down the wrong path, rewind to a checkpoint instead of carrying on. Otherwise the failed attempt stays in context and you pay for it again on every turn that follows.
- Evidence: Use of rewind or checkpoints to undo an agent change.
- Search: docs, agent-config files for `/rewind|checkpoint|/undo`
- Usually only the user knows: search, then ask.

## `msc-q3` When a session repeatedly reaches its context limit, do you identify the source before resetting it?

- Fully covered looks like: Most assistants have a command that shows exactly what's filling your context — which tools and files used the tokens, plus cache misses and oversized files (Claude Code, Manage costs effectively [60]). Check that before you reset, so you fix the actual cause instead of hitting the same wall next session.
- Evidence: A habit of finding what fills the context before resetting a session.
- Search: docs files for `/context|context (limit|usage)`
- Usually only the user knows: search, then ask.

## `rpt-q1` Do developers point the agent at specific files by path rather than asking it to discover them through open-ended exploration?

- Fully covered looks like: Precise reads keep the working set small from the start. Point the agent at specific files by path rather than asking it to go and find them: "read src/auth/login.ts and src/auth/session.ts" spends no tokens on exploration.
- Evidence: Guidance to name files by path instead of open-ended exploration.
- Search: docs, agent-config files for `by path|file paths?|@file|#file`
- Usually only the user knows: search, then ask.

## `ivs-q1` Do developers keep large command output out of the main session by filtering it or delegating bounded analysis?

- Fully covered looks like: Large command output can pollute the main context and be re-sent on later turns. Stop unnecessary output before deciding whether to delegate it.
- Evidence: Large command output kept out of the main session: filtering, output limits, delegated analysis.
- Search: docs, agent-config files for `\|\s*(head|tail|grep)`, `BASH_MAX_OUTPUT_LENGTH|output limit`, `delegat|sub-?agent`

## `ail-q1` Do you keep your always-loaded instruction files small, pushing occasional workflows on-demand and pruning them periodically?

- Fully covered looks like: Keep always-loaded instruction files limited to conventions, the directory map, and key commands. Move specialised workflows into on-demand skills or separate documents.
- Evidence: Small always-loaded instruction files, with occasional workflows loaded on demand.
- Search: agent-config files for `inclusion:\s*\w+`, `^#{1,2} `

## `msc-q4` Do developers review their configured MCP servers periodically and remove the ones no longer in use?

- Fully covered looks like: Review configured MCP servers and remove those that no longer support a real workflow. Implementations load catalogues differently, so measure standing context rather than assuming a fixed overhead.
- Evidence: A periodic review that removes unused MCP servers.
- Search: agent-config, docs files for `mcpServers|\[mcp_servers`, `review|prune|remove unused`
- Usually only the user knows: search, then ask.

## `msc-q5` Do developers pick the model and the reasoning effort before the first prompt, rather than switching part-way through a session?

- Fully covered looks like: Both settings sit in the cached prefix, so changing either one part-way through a session invalidates the cache. The whole conversation is then re-prefilled at the new model's price, and toggling fast mode does the same (Maximizing the value of your Claude Code sessions [90]). Decide both before the first prompt.
- Evidence: A habit of picking model and effort before the first prompt.
- Search: docs files for `/model|switch(ing)? models?`
- Usually only the user knows: search, then ask.

## Citations

- [90] Maximizing the value of your Claude Code sessions. Anthropic blog, as of Aug 2026. https://claude.com/blog/maximizing-the-value-of-your-claude-code-sessions
- [60] Manage costs effectively. Claude Code documentation. https://code.claude.com/docs/en/costs
- [106] Developer commands for Codex CLI. OpenAI Codex documentation. https://developers.openai.com/codex/cli/slash-commands
- [102] Slash commands. OpenAI Codex documentation. https://developers.openai.com/codex/reference/slash-commands
- [103] Use ChatGPT Work and Codex with Amazon Bedrock. OpenAI Codex documentation. https://developers.openai.com/codex/amazon-bedrock
- [63] Hooks reference. Claude Code documentation. https://code.claude.com/docs/en/hooks
- [125] Set up Claude Code in a monorepo or large codebase. Claude Code Docs, Anthropic. https://code.claude.com/docs/en/large-codebases
- [126] Context engineering: memory, compaction, and tool clearing. Claude Cookbook, Anthropic. https://platform.claude.com/cookbook/tool-use-context-engineering-context-engineering-tools
- [100] Subagents. OpenAI Codex documentation. https://learn.chatgpt.com/docs/agent-configuration/subagents
- [99] Custom instructions with AGENTS.md. OpenAI Codex documentation. https://developers.openai.com/codex/agent-configuration/agents-md
- [101] Model Context Protocol configuration. OpenAI Codex documentation. https://developers.openai.com/codex/extend/mcp
- [98] Best practices for Codex. OpenAI. https://learn.chatgpt.com/guides/best-practices

Glob sets: docs = **/*.{md,mdx,rst,adoc,txt}; agent-config = **/.kiro/** **/.claude/** **/.codex/** **/.opencode/** **/.agents/** **/AGENTS.md **/CLAUDE.md **/.mcp.json **/mcp.json **/opencode.json
