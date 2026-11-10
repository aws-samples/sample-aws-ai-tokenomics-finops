<!-- GENERATED from content/ by scripts/build-skill.mjs. Do not edit; run `npm run build:skill`. -->

# Retrieval

- Track: Track 2 - Purpose-Built Agentic AI Application · Agent Harness
- Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#retrieval-cost
- Can be scoped out: yes, if the user confirms it does not apply
- What it saves: Lowers the fixed cost of a searchable corpus and the retrieved input that every grounded call carries.

Answer each question with: `yes` (Fully covered), `wip` (Partially), `no` (Not covered), `na` (N/A), or `unknown` when neither the files nor the user answer it.

## `rag-q1` Does your vector store’s pricing model fit your query volume?

- Fully covered looks like: Choose the store by how it is queried. A large corpus with low or uneven query volume suits pay-per-use storage; only steady, high query rates that need millisecond answers justify capacity billed by the hour.
- Evidence: The vector store and its pricing model against query volume.
- Search: iac, code, config files for `opensearch|aoss|s3.?vectors|pgvector|pinecone`, `knowledge.?base|vector`

## `rag-q2` Do you retrieve the fewest, smallest chunks that answer the question?

- Fully covered looks like: Retrieved input per call is roughly chunks returned × tokens per chunk. Set the number of results on purpose, size chunks to the answer, and where quality needs a wide search, rerank a larger candidate set down to a few before generation.
- Evidence: Retrieval sized to the question: result count, chunk size, reranking.
- Search: code, config, iac files for `numberOfResults|top_?k|topK`, `chunk(ing)?_?(size|tokens)|maxTokens.*chunk|overlap`, `rerank`

## `rag-q3` Do your re-syncs embed only what changed?

- Fully covered looks like: Embedding cost follows corpus churn. Sync incrementally, change only metadata files when only metadata changed, and settle the parsing and chunking choices up front, because changing them later means a new knowledge base and a full re-ingest.
- Evidence: Re-syncs that embed only changed documents.
- Search: code, iac files for `start_ingestion_job|StartIngestionJob|ingestion`, `re-?sync|incremental|changed|content.?hash`

## Citations

- [164] Build enterprise search for agents with Amazon Bedrock Managed Knowledge Base. AWS Machine Learning Blog; accessed 5 November 2026. https://aws.amazon.com/blogs/machine-learning/build-enterprise-search-for-agents-with-amazon-bedrock-managed-knowledge-base/
- [165] Building cost-effective RAG applications with Amazon Bedrock Knowledge Bases and Amazon S3 Vectors. AWS Machine Learning Blog, July 2025; accessed 5 November 2026. https://aws.amazon.com/blogs/machine-learning/building-cost-effective-rag-applications-with-amazon-bedrock-knowledge-bases-and-amazon-s3-vectors/
- [166] Configure and customize queries and response generation. Amazon Bedrock User Guide, AWS; accessed 5 November 2026. https://docs.aws.amazon.com/bedrock/latest/userguide/kb-test-config.html
- [167] Improve the relevance of query responses with a reranker model. Amazon Bedrock User Guide, AWS; accessed 5 November 2026. https://docs.aws.amazon.com/bedrock/latest/userguide/rerank.html
- [168] AWS Price List bulk offer, AmazonBedrock (offer version 20261102165015, Amazon Rerank 1.0 search units, us-west-2). AWS; accessed 5 November 2026. https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonBedrock/current/index.json
- [169] Sync your data with your Amazon Bedrock knowledge base. Amazon Bedrock User Guide, AWS; accessed 5 November 2026. https://docs.aws.amazon.com/bedrock/latest/userguide/kb-data-source-sync-ingest.html

Glob sets: iac = **/*.tf **/*.tf.json **/cdk.json **/{template,cloudformation,serverless,samconfig}*.{yaml,yml,json,toml} **/{infra,infrastructure,iac,cdk,terraform,stacks}/**; code = **/*.{py,js,mjs,cjs,ts,tsx,jsx,java,kt,go,rs,cs,rb,php,scala,swift,vue,svelte,html}; config = **/*.{json,jsonc,yaml,yml,toml,ini,cfg,conf,properties}
