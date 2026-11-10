<!-- GENERATED from content/ by scripts/build-skill.mjs. Do not edit; run `npm run build:skill`. -->

# Tool design

- Track: Track 2 - Purpose-Built Agentic AI Application · Agent Harness
- Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#budget-the-tool-definition-weight
- Can be scoped out: yes, if the user confirms it does not apply
- What it saves: Lowers the fixed capability tax and prevents runtime output from becoming recurring context.

Answer each question with: `yes` (Fully covered), `wip` (Partially), `no` (Not covered), `na` (N/A), or `unknown` when neither the files nor the user answer it.

## `crs-q1` Do you keep a costed inventory of tools, skills and MCP servers?

- Fully covered looks like: Keep a versioned inventory of every tool, skill and MCP operation with an owner, a use case, its definition tokens and its measured runtime cost. definition tokens × calls per task is a fixed tax on every task.
- Evidence: A costed inventory of tools, skills and MCP servers.
- Search: code, config, docs files for `toolSpec|TOOL_SPECS|tools\s*=|@tool\b`, `mcpServers|inventory`

## `crs-q2` Does each call see only the tools it needs?

- Fully covered looks like: Separate the full registry from what one request carries: load a small core set plus the capabilities the current intent needs, and keep the rest out of the context.
- Evidence: Each call sent only the tools it needs.
- Search: code files for `toolConfig|tool_?choice|toolChoice`, `tools\s*[=:]`, `(select|filter)\w*.*tools`

## Citations

- [4] AGENTCOST02: Model costs. AWS Well-Architected Agentic AI Lens. https://docs.aws.amazon.com/wellarchitected/latest/agentic-ai-lens/agentcost02.html
- [38] Effective context engineering for AI agents. Anthropic Engineering, Sep 2025. https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- [83] AGENTCOST02-BP02: Cost optimize token consumption through efficient prompt engineering. AWS Well-Architected Agentic AI Lens. https://docs.aws.amazon.com/wellarchitected/latest/agentic-ai-lens/agentcost02-bp02.html
- [149] Claude Sonnet 5.5 model card (feature support). Amazon Bedrock User Guide, AWS; accessed 5 November 2026. https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-5-5.html
- [146] Claude Haiku 5.5 model card (features, pricing and long-context note). Amazon Bedrock User Guide, AWS; accessed 5 November 2026. https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-5-5.html
- [157] Introducing advanced tool use on the Claude Developer Platform (Tool Search Tool, Programmatic Tool Calling). Anthropic; accessed 5 November 2026. https://www.anthropic.com/research/advanced-tool-use
- [201] How MoEngage turned over 400 APIs into agent tools with AgentCore Gateway. AWS Machine Learning Blog; accessed 9 November 2026. https://aws.amazon.com/blogs/machine-learning/how-moengage-turned-over-400-apis-into-agent-tools-with-agentcore-gateway/
- [158] Implementing programmatic tool calling on Amazon Bedrock. AWS Machine Learning Blog; accessed 5 November 2026. https://aws.amazon.com/blogs/machine-learning/implementing-programmatic-tool-calling-on-amazon-bedrock/

Glob sets: code = **/*.{py,js,mjs,cjs,ts,tsx,jsx,java,kt,go,rs,cs,rb,php,scala,swift,vue,svelte,html}; config = **/*.{json,jsonc,yaml,yml,toml,ini,cfg,conf,properties}; docs = **/*.{md,mdx,rst,adoc,txt}
