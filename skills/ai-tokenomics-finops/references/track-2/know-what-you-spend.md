<!-- GENERATED from content/ by scripts/build-skill.mjs. Do not edit; run `npm run build:skill`. -->

# Know what you spend and what it buys

- Track: Track 2 - Purpose-Built Agentic AI Application · Model Inference
- Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#know-what-you-spend
- Can be scoped out: yes, if the user confirms it does not apply
- What it saves: Visibility first. It saves nothing directly on the bill, but every other lever in this layer needs this decomposition to tell you whether it worked.

Answer each question with: `yes` (Fully covered), `wip` (Partially), `no` (Not covered), `na` (N/A), or `unknown` when neither the files nor the user answer it.

## `kwys-q1` Do you know your total agent spend and how it is constructed?

- Fully covered looks like: Write the equation down and measure every term: spend = users × sessions per user × turns per session × requests per turn × tokens per request × price per token. When the bill moves, name the term that moved it.
- Evidence: Spend decomposed into its terms: token usage read from responses, Bedrock metrics, budgets, bill reviews.
- Search: code, iac, docs files for `\busage\b`, `(input|output)_?tokens|(Input|Output)TokenCount`, `cost explorer|budget`

## `kwys-q2` Do you track cost per successful task, and gate releases on it?

- Fully covered looks like: Divide spend by what it bought: cost per successful task = total spend across all attempts / successful outcomes, and fail a release that raises it even when quality holds.
- Evidence: Cost per successful task measured, and a release gate on it.
- Search: code, docs, config files for `cost.?per.?(successful )?(task|resolution|outcome|ticket)`, `\beval(uation)?s?\b|golden set|regression`

## `kwys-q3` Is every dollar attributed to the team or workload that caused it?

- Fully covered looks like: Attribute in layers, strongest first: the team’s own account, then a tagged application inference profile per application or tenant, then cost allocation tags, then per-user tracking. Call the model through the profile ARN, never a raw model ID.
- Evidence: Attribution: per-team accounts, application inference profiles, cost allocation tags, request metadata.
- Search: iac, code files for `application-inference-profile|ApplicationInferenceProfile|create_inference_profile`, `cost.?allocation|\bTags?\b`, `requestMetadata`

## Citations

- [91] Unit Economics capability. FinOps Foundation (Linux Foundation). https://www.finops.org/framework/capabilities/unit-economics/
- [107] Track, allocate, and manage your generative AI cost and usage with Amazon Bedrock. AWS Machine Learning Blog. https://aws.amazon.com/blogs/machine-learning/track-allocate-and-manage-your-generative-ai-cost-and-usage-with-amazon-bedrock/
- [39] AGENTCOST01: Reasoning and execution cost optimization. AWS Well-Architected Agentic AI Lens. https://docs.aws.amazon.com/wellarchitected/latest/agentic-ai-lens/agentcost01.html
- [109] Running a Software Factory Efficiently at Uber Scale. Uber Engineering, Aug 2026. https://www.uber.com/au/en/blog/efficient-software-factory/
- [108] Data Exports table dictionary for CUR 2.0. AWS Data Exports User Guide. https://docs.aws.amazon.com/cur/latest/userguide/table-dictionary-cur2.html
- [47] Monitor model invocation using CloudWatch Logs and Amazon S3 (model invocation logging). Amazon Bedrock User Guide, AWS. https://docs.aws.amazon.com/bedrock/latest/userguide/model-invocation-logging.html
- [177] Migrating from FOCUS 1.0 to FOCUS 1.2. AWS Data Exports User Guide, AWS; accessed 5 November 2026. https://docs.aws.amazon.com/cur/latest/userguide/table-dictionary-focus-1-2-migrating.html
- [176] Introducing FOCUS 1.4: Invoice Reconciliation, Commitment Details, and Specification Maturity. FinOps Foundation, June 2026; accessed 5 November 2026. https://www.finops.org/insights/introducing-focus-1-4/
- [198] FOCUS 1.5 release scope: confirmed, in review and deferred. FinOps Foundation; accessed 9 November 2026. https://focus.finops.org/focus-1-5-release-scope/
- [190] Token Economics: The Atomic Unit of AI Value. FinOps Foundation (Linux Foundation), May 2026; accessed 8 November 2026. https://www.finops.org/insights/token-economics-the-atomic-unit-of-ai-value/
- [41] FinOps for AI Working Group. FinOps Foundation (Linux Foundation). https://www.finops.org/wg/finops-for-ai/
- [75] Track Amazon Bedrock costs by caller identity with IAM-based cost allocation. AWS Cloud Financial Management Blog. https://aws.amazon.com/blogs/aws-cloud-financial-management/track-amazon-bedrock-costs-by-caller-identity-with-iam-based-cost-allocation/
- [18] Create an application inference profile. Amazon Bedrock User Guide, AWS. https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-create.html
- [199] Getting started with Tokenomics on AWS. AWS Cloud Financial Management Blog; accessed 9 November 2026. https://aws.amazon.com/blogs/aws-cloud-financial-management/aws-tokenomics-strategy/
- [153] Best practices for cost attribution. Amazon Bedrock User Guide, AWS; accessed 5 November 2026. https://docs.aws.amazon.com/bedrock/latest/userguide/cost-mgmt-best-practices.html
- [152] AWS Cost Explorer, Budgets, and Dashboards now support Amazon Bedrock product attributes. AWS What’s New, October 2026; accessed 5 November 2026. https://aws.amazon.com/about-aws/whats-new/2026/10/aws-bedrock-attributes-in-cost-explorer/
- [146] Claude Haiku 5.5 model card (features, pricing and long-context note). Amazon Bedrock User Guide, AWS; accessed 5 November 2026. https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-5-5.html
- [151] AWS Cost Anomaly Detection supports third-party models on Amazon Bedrock. AWS What’s New, August 2026; accessed 5 November 2026. https://aws.amazon.com/about-aws/whats-new/2026/08/aws-cost-anomaly-detection-bedrock-3P/
- [110] Building a cost allocation strategy. AWS Tagging Best Practices whitepaper. https://docs.aws.amazon.com/whitepapers/latest/tagging-best-practices/building-a-cost-allocation-strategy.html
- [111] Get started with AWS Budgets Actions. AWS Cloud Financial Management Blog. https://aws.amazon.com/blogs/aws-cloud-financial-management/get-started-with-aws-budgets-actions/

Glob sets: code = **/*.{py,js,mjs,cjs,ts,tsx,jsx,java,kt,go,rs,cs,rb,php,scala,swift,vue,svelte,html}; iac = **/*.tf **/*.tf.json **/cdk.json **/{template,cloudformation,serverless,samconfig}*.{yaml,yml,json,toml} **/{infra,infrastructure,iac,cdk,terraform,stacks}/**; docs = **/*.{md,mdx,rst,adoc,txt}; config = **/*.{json,jsonc,yaml,yml,toml,ini,cfg,conf,properties}
