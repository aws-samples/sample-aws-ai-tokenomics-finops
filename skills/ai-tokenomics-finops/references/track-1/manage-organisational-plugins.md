<!-- GENERATED from content/ by scripts/build-skill.mjs. Do not edit; run `npm run build:skill`. -->

# Manage organisational plugins

- Track: Track 1 - AI Coding Assistant · Agent Harness
- Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#manage-organisational-plugins
- What it saves: A good tool set one team finds becomes the default for everyone. Keeping the same tools loaded fleet-wide keeps the prompt prefix identical across sessions, so caching keeps working, and it stops unreviewed tools from quietly working their way into what's loaded on every call.

Answer each question with: `yes` (Fully covered), `wip` (Partially), `no` (Not covered), `na` (N/A), or `unknown` when neither the files nor the user answer it.

## `mop-q1` Do you ship a reviewed, approved baseline of MCP servers and skills at organisation, team, and project level, rather than leaving each developer to assemble their own?

- Fully covered looks like: Curate the toolset in layers that match the work. An organisation baseline carries common tools, a team layer carries domain tools, and a repository layer carries project-specific tools.
- Evidence: A committed baseline of approved MCP servers and skills at org, team or project level.
- Search: agent-config files for `mcpServers`, `\[mcp_servers`, `"mcp"\s*:`, `skills?/`

## `mop-q2` Does third-party token-efficiency tooling go through your own security, supply-chain, and data-handling review?

- Fully covered looks like: Community tooling cuts cost at points the assistant does not. Put each tool through your own security review before you adopt it.
- Evidence: A security, supply-chain and data-handling review for third-party agent tooling.
- Search: docs files for `security review`, `supply.?chain`, `approved (tools|plugins|servers|extensions)`, `allow.?list`
- Usually only the user knows: search, then ask.

## Citations

- [123] What is the Model Context Protocol (MCP)? Model Context Protocol project. https://modelcontextprotocol.io/introduction
- [124] Claude Code hooks: best examples with configs. AY Automate (third-party practitioner). https://www.ayautomate.com/blog/best-claude-code-hooks
- [98] Best practices for Codex. OpenAI. https://learn.chatgpt.com/guides/best-practices
- [101] Model Context Protocol configuration. OpenAI Codex documentation. https://developers.openai.com/codex/extend/mcp

Glob sets: agent-config = **/.kiro/** **/.claude/** **/.codex/** **/.opencode/** **/.agents/** **/AGENTS.md **/CLAUDE.md **/.mcp.json **/mcp.json **/opencode.json; docs = **/*.{md,mdx,rst,adoc,txt}
