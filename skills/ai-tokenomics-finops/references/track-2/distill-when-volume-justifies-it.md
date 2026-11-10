<!-- GENERATED from content/ by scripts/build-skill.mjs. Do not edit; run `npm run build:skill`. -->

# Self-host or distill when volume justifies it

- Track: Track 2 - Purpose-Built Agentic AI Application · Model Inference
- Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#distill-when-volume-justifies-it
- Can be scoped out: yes, if the user confirms it does not apply
- What it saves: Break-even in 6 to 12 months above the thresholds. It converts a recurring per-invocation premium into a one-time training cost (distillation) or a fixed fleet cost you control (self-hosting); the cited thresholds are >$500/month and >10,000 invocations/month.

Answer each question with: `yes` (Fully covered), `wip` (Partially), `no` (Not covered), `na` (N/A), or `unknown` when neither the files nor the user answer it.

## `dis-q1` Does your volume clear the break-even for distillation or self-hosting?

- Fully covered looks like: Work out the break-even before the technique: months to break even = one-off training cost / monthly saving. Above about $500 a month and 10,000 invocations a month, customisation typically pays back within 6 to 12 months.
- Evidence: Invocation volume against the distillation or self-hosting break-even.
- Search: docs files for `invocations? per (month|day)|requests? per (month|day)`, `break.?even|distill|fine.?tun`
- Usually only the user knows: search, then ask.

## `dis-q2` Have you chosen the managed, managed-compute or self-managed path deliberately?

- Fully covered looks like: Pick the path by how much control you need: managed Bedrock Model Distillation, or reinforcement fine-tuning when you can score answers but lack labelled data, for the least engineering; SageMaker Training Jobs when you choose the student and its licence, and a self-managed HyperPod cluster only when you need a persistent cluster under your own control.
- Evidence: The managed, managed-compute or self-managed path chosen deliberately.
- Search: code, iac, docs files for `create_model_customization_job|CreateModelCustomizationJob|custom.?model|model.?import`, `sagemaker|endpoint|provisioned.?(model)?.?throughput`

## `dis-q3` Do you curate the training data, A/B test the student and plan a refresh?

- Fully covered looks like: Train only on high-confidence successful production completions, A/B test the student against the teacher before promoting it, and budget a refresh cadence so the student does not drift.
- Evidence: Curated training data, an A/B test of the student, and a refresh plan.
- Search: docs, code files for `training data|a/?b test|shadow`, `refresh|retrain`
- Usually only the user knows: search, then ask.

## Citations

- [13] AGENTCOST02-BP04: Customize models when break-even justifies it. AWS Well-Architected Agentic AI Lens. https://docs.aws.amazon.com/wellarchitected/latest/agentic-ai-lens/agentcost02-bp04.html
- [161] Customize Amazon Nova models with Amazon Bedrock fine-tuning. AWS Machine Learning Blog; accessed 5 November 2026. https://aws.amazon.com/blogs/machine-learning/customize-amazon-nova-models-with-amazon-bedrock-fine-tuning/
- [116] Goodnotes Pens the Future by Developing Generative AI Features. AWS Case Study, 2024. https://aws.amazon.com/solutions/case-studies/goodnotes/
- [159] Amazon Bedrock adds reinforcement fine-tuning simplifying how developers build smarter, more accurate AI models. AWS News Blog, December 2025; accessed 5 November 2026. https://aws.amazon.com/blogs/aws/improve-model-accuracy-with-reinforcement-fine-tuning-in-amazon-bedrock/
- [160] Reinforcement fine-tuning on Amazon Bedrock with OpenAI-Compatible APIs: a technical walkthrough. AWS Machine Learning Blog; accessed 5 November 2026. https://aws.amazon.com/blogs/machine-learning/reinforcement-fine-tuning-on-amazon-bedrock-with-openai-compatible-apis-a-technical-walkthrough/
- [117] Train a model. Amazon SageMaker AI Developer Guide, AWS. https://docs.aws.amazon.com/sagemaker/latest/dg/train-model.html
- [12] Effective cost optimization strategies for Amazon Bedrock. AWS Machine Learning Blog, Jun 2025. https://aws.amazon.com/blogs/machine-learning/effective-cost-optimization-strategies-for-amazon-bedrock/
- [51] Use Custom model import to import a customized model into Amazon Bedrock. Amazon Bedrock User Guide, AWS. https://docs.aws.amazon.com/bedrock/latest/userguide/model-customization-import-model.html
- [14] Model distillation. Amazon Bedrock User Guide, AWS. https://docs.aws.amazon.com/bedrock/latest/userguide/model-distillation.html

Glob sets: docs = **/*.{md,mdx,rst,adoc,txt}; code = **/*.{py,js,mjs,cjs,ts,tsx,jsx,java,kt,go,rs,cs,rb,php,scala,swift,vue,svelte,html}; iac = **/*.tf **/*.tf.json **/cdk.json **/{template,cloudformation,serverless,samconfig}*.{yaml,yml,json,toml} **/{infra,infrastructure,iac,cdk,terraform,stacks}/**
