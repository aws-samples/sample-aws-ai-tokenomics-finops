# Calculators

Modular Bedrock cost-calculator deliverables land here (code + usage notes).

Pricing: `pricing/` holds the canonical Bedrock model-ID to AWS Price List mapping, its stdlib resolver, and the guidance doc (`pricing/README.md`) on matching usage to price by structured `usagetype` equality instead of brittle description regex.

Coverage, checked 2026-11-05 against the public bulk offers: legacy Claude and Nova Pro in `us-west-2`; Claude Sonnet 4.5 and Haiku 4.5 in `ap-southeast-2`; and in `us-east-1` the current generation, Claude Haiku, Sonnet and Opus 5.5, Claude Sonnet 5, Opus 4.8 and Sonnet 4.6, and OpenAI GPT-6 Astra. OpenAI GPT-6 Sol, GPT-6 Luna, GPT-6.1 Sol, GPT-6.1 Terra (added 2026-11-09) and GPT-5.6 Sol and Luna are listed but pending: no bulk offer has a `us-east-1` SKU for them yet. A pending row raises `PendingCoverageError` instead of returning a price.

Run the tests with `npm run test:calculators` from the repository root.
