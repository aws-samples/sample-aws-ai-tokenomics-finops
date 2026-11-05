# Bedrock model-ID to AWS Price List mapping

This package answers a correctness problem that anyone building a Bedrock pricing gateway
hits: the AWS Price List does not carry the Bedrock API
model ID, so naive tools fall back to parsing free-text price descriptions with a regex,
which breaks silently. The fix here is a curated, tested map keyed by structured fields
plus a resolver that matches by structured equality, never by prose.

Contents:

- `bedrock_price_map.json`, the canonical map, keyed by `(model_id, region, dimension)`.
- `resolver.py`, a stdlib-only, Python 3.9 compatible resolver.
- `__init__.py`, re-exporting the public surface.
- Tests live at `../tests/test_resolver.py` (run `python3 -m unittest discover` from
  `tools/calculators/`).

## Finding: does the Price List expose the model ID? (AC1)

No. The Bedrock API model ID (for example `anthropic.claude-3-sonnet-20240229-v1:0`) is
not a structured field in the AWS Price List. This was verified two ways.

There are two Price List surfaces, and they must be kept distinct:

- The **Query API** (`GetProducts`, `GetAttributeValues`, `DescribeServices` on
  `api.pricing.<region>.amazonaws.com`) is **SigV4-signed** (IAM required). An unsigned
  request returns `MissingAuthenticationTokenException`. `GetProducts` returns each
  `PriceList` entry as a JSON string you parse; `MaxResults` caps at 100.
- The **public bulk offer** (`offers/v1.0/aws/AmazonBedrock/current/index.json` and the
  per-region `.../<version>/<region>/index.json`) is plain HTTPS, no credentials. It is
  the practical source for a calculator: every row at once.

Both surfaces carry the **same product schema**: `products{}` keyed by SKU, plus
`terms.OnDemand{}` keyed by the same SKU. The SKU is the correlation key between a
product and its price.

The `AmazonBedrock` offer returns exactly **21** structured attribute keys (union across
all products in the 2026-07-07 `us-west-2` offer, offer version `20260707080509`):
`architecture`, `architectureName`, `customModelUnitVersion`, `feature`, `featureType`,
`inferenceType`, `location`, `locationType`, `model`, `modelUnit`, `operation`,
`policyType`, `provider`, `regionCode`, `service_tier`, `servicecode`, `servicename`,
`titanModel`, `titanModelUnit`, `tokenType`, and `usagetype`.

Note what is absent: there is **no `modelId` field** (nor `model_id`, nor `apiModelId`).
The closest structured field is `model`, which is a display name (`"Claude 3 Sonnet"`),
not the API model ID. Empirically, **0 of 1,007 products contain `anthropic.claude`** in
any attribute value in the `us-west-2` offer.

The `AmazonBedrock` offer is not the only one. In it, the only Anthropic rows are five
legacy `-input-tokens` rows (Claude 2.0, 2.1, Instant, 3 Haiku, 3 Sonnet), and
`ap-southeast-2` has none. The **current Claude family is in the public bulk Price List**,
in the separate `AmazonBedrockFoundationModels` offer
(`offers/v1.0/aws/AmazonBedrockFoundationModels/current/index.json`, same plain-HTTPS,
no-credentials access, same `products{}` plus `terms.OnDemand{}` schema). Re-checked on
2026-11-05 against offer version `20261012084008`: `ap-southeast-2` carries Sonnet 4.5,
Haiku 4.5 and the newer Claude models under Marketplace-style `MP:` usagetypes, for
example `APS2-MP:APS2_InputTokenCount-Units` for In-Region input tokens and
`APS2-MP:APS2_InputTokenCount_Global-Units` for the `global.` profile. That offer has 10
attribute keys (`feature`, `inferenceType`, `location`, `locationType`, `model`,
`operation`, `provider`, `regionCode`, `servicename`, `usagetype`), and it still has no
model-ID field. Opus 4.1 and Opus 4.5 are priced there in `us-west-2` but have no
`ap-southeast-2` SKU, so those map rows stay pending.

The same offer prices the current generation in `us-east-1` (checked 2026-11-05, same
version `20261012084008`): Claude Haiku, Sonnet and Opus 5.5, Claude Sonnet 5, Claude
Opus 4.8, Claude Sonnet 4.6 and OpenAI GPT-6 Astra. OpenAI GPT-6 Sol, GPT-6 Luna, GPT-6.1
Sol and GPT-5.6 Sol have no SKU in either bulk offer in any Region, and GPT-5.6 Luna has
one only in `us-gov-west-1` (in the `AmazonBedrock` offer, version `20261102165015`). Those
models are priced only on their Amazon Bedrock model cards, so their map rows stay pending.

Sources: [GetProducts API reference](https://docs.aws.amazon.com/aws-cost-management/latest/APIReference/API_pricing_GetProducts.html),
[GetAttributeValues API reference](https://docs.aws.amazon.com/aws-cost-management/latest/APIReference/API_pricing_GetAttributeValues.html),
[Reading an offer file](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/reading-an-offer.html),
[Bedrock pricing bulk offer region index](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonBedrock/current/region_index.json),
[Bedrock foundation-models bulk offer region index](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonBedrockFoundationModels/current/region_index.json).

## Guidance: match usage to price without brittle regex (AC3)

The free-text `description` is the correctness trap. Verbatim samples read from the
offer this pass show why: `"$0.00300 per 1K tokens for Claude3Sonnet-input-tokens inUS
West (Oregon)"` (note `inUS West`, no space), `"$ 0.0008 per 1K tokens for Nova
Pro-input-tokens in us-west-2 (Oregon)"` (space after `$`, region as a code),
`"$0.00125 per 1K token for Nova2.0Pro-...-cross-region-global..."` (`1K token`,
singular). A regex over that prose would have to absorb `$` with or without a space,
`1K token` versus `1K tokens`, `inUS West` versus `in us-west-2`, and display name versus
raw usagetype versus API slug. It breaks the day AWS tweaks any string, and in a pricing
path a silent break ships a wrong number.

Match instead by **structured equality on `usagetype` plus `regionCode`**, confirmed with
`service_tier`, `operation` and `servicename` where those are present. Concretely, for a
curated row:

```
price_row  <=  match on ( attributes.regionCode == region
                          AND attributes.usagetype == curated join.usagetype )
               confirm with ( service_tier, operation, servicename ) where the curated row sets them
```

`resolve(model_id, region, dimension, offer_rows)` does exactly this and returns exactly
one row. Zero matches raise `MissingCoverageError` (a new or renamed model, or a missing
region). Two or more raise `AmbiguousMatchError` (a tier, cache, or batch variant leaked
into the key). The resolver never reads `description` or the `model` display name; a test
mutates the description and asserts resolution is unchanged.

Two `usagetype` conventions exist, so do not try to derive a model ID from the string:

- **Legacy display-name style** (Anthropic Claude, Amazon Nova):
  `USW2-Claude3Sonnet-input-tokens`, a squashed display name, not the API model ID.
  `service_tier` is absent for this family, so the map stores it as `null` (meaning "do
  not constrain on this field").
- **Newer provider-slug style** (Mistral, Qwen, Kimi, and others):
  `USW2-mistral.mistral-large-3-675b-instruct-mantle-input-tokens-standard`, which embeds
  a provider-prefixed slug (close to, but not identical to, the invoke-time model ID, no
  `-v1:0` suffix) and does populate `service_tier`. The `-mantle-` segment is part of the AWS billing identifier, so the parser matches it as written.
- **Marketplace style** (current Claude, in the `AmazonBedrockFoundationModels` offer):
  `APS2-MP:APS2_InputTokenCount-Units`, which names only the Region and the dimension. Every
  model in the Region shares it (Sonnet 4.5, Sonnet 4.6, Haiku 4.5 and Claude 3 Haiku all
  bill input as `APS2-MP:APS2_InputTokenCount-Units`), so `usagetype` plus `regionCode`
  alone is ambiguous by design. These rows also pin `join.servicename`, the exact
  Marketplace product name (`"Claude Sonnet 4.5 (Amazon Bedrock Edition)"`), which is the
  same product name Cost and Usage Reports carry. It is compared by exact equality, never by
  pattern, and a row that leaves it null is not constrained on it. Without it the resolver
  raises `AmbiguousMatchError`, which a test asserts.

  Newer models in the same offer use a second `MP:` spelling that names the tier and the
  variant: `USE1-MP:USE1_input_tokens_standard-Units` for In-Region Standard input, with
  separate SKUs such as `..._input_tokens_global_standard-Units` (the `global.` profile),
  `..._input_tokens_long_ctx_standard-Units` (long-context pricing, for Claude Haiku 5.5 and
  GPT-6 Astra) and `..._cache_write_tokens_1h_standard-Units` (a 1-hour cache write; GPT-6
  Astra has `..._cache_write_tokens_30m_standard-Units` instead). Claude Sonnet 4.6 still uses
  the older `InputTokenCount` spelling. The map stores whichever exact string the offer row
  carries, plus `servicename`; a test asserts each current row joins the In-Region Standard
  SKU and not one of the variants the fixture carries beside it.

Neither Claude convention embeds the API model ID, so you cannot lift a Claude model ID from
any usagetype. That is why a curated map is required.

Unit: `AmazonBedrock` token rows are priced per `1K tokens` (multiply by 1000 to reach
per-1M tokens); `AmazonBedrockFoundationModels` token rows are priced per `1M tokens`
(already per 1M). `to_per_1M_usd(row)` handles both and rejects any other unit (such as the
`1M TPM Hour` reserved rows) rather than silently returning a wrong scale.

Cross-region: a geographic inference profile (`us.` / `eu.` / `apac.` prefix) is billed
at the source Region and adds no premium over In-Region, so the resolver strips the prefix
to the base model ID rather than duplicating a row per prefix. Only the `global.` profile
has its own lower-priced usagetype (`-cross-region-global` in `AmazonBedrock`, `_Global` in
`AmazonBedrockFoundationModels`), so only that warrants its own row, and only for models
where AWS publishes it. Every mapped `MP:` row is the In-Region / Geo price; the `global.`
price is about 10% lower and is not mapped yet. Long-context rates and the 1-hour (or
30-minute) cache write are not mapped either: the map is keyed by dimension alone, so it
carries the default short-context Standard rate.

## Price discipline (AC4)

The map does not hardcode volatile current-generation per-token prices from memory. Every
`status == unverified_pending_join` row has `price_per_1M_usd` set to `null`; every row
that does carry a non-null `price_per_1M_usd` carries a resolvable AWS `source_url` and a
`verified_date`, and a test asserts that price equals the price on the offer row it
resolves to. As of 2026-11-05:

- The legacy figures are read from the `AmazonBedrock` offer, version `20261102165015`
  (for example Claude 3 Sonnet at `$3.00 / 1M input tokens`, that is `0.00300 per 1K
  tokens` times 1000). They are unchanged since the 2026-07-07 offer.
- Sonnet 4.5 and Haiku 4.5 in `ap-southeast-2` are read from the
  `AmazonBedrockFoundationModels` offer, version `20261012084008` (Sonnet 4.5 `$3.30` input
  and `$16.50` output, Haiku 4.5 `$1.10` input and `$5.50` output, per 1M tokens,
  In-Region).
- Opus 4.1 and Opus 4.5 in `ap-southeast-2` stay `unverified_pending_join`: neither offer
  has a Sydney SKU for them. Do not copy a `us-west-2` price into a Sydney row.
- The current generation in `us-east-1` is read from the `AmazonBedrockFoundationModels`
  offer, version `20261012084008`, In-Region Standard, USD per 1M tokens:

  | Model | Input | Output | Cache read | Cache write |
  |---|---|---|---|---|
  | Claude Haiku 5.5 | 0.11 | 0.55 | 0.011 | 0.1375 |
  | Claude Sonnet 5.5 | 2.20 | 11.00 | 0.11 | 2.75 |
  | Claude Opus 5.5 | 4.40 | 22.00 | 0.22 | 5.50 |
  | Claude Sonnet 5 | 2.20 | 11.00 | 0.22 | 2.75 |
  | OpenAI GPT-6 Astra | 11.00 | 55.00 | 1.10 | 13.75 (30-minute) |
  | Claude Opus 4.8 | 5.50 | 27.50 | not mapped | not mapped |
  | Claude Sonnet 4.6 | 3.30 | 16.50 | not mapped | not mapped |

  Claude cache writes are the default 5-minute write. Each row's SKU is in its `note`.
- OpenAI GPT-6 Sol, GPT-6 Luna, GPT-6.1 Sol, GPT-5.6 Sol and GPT-5.6 Luna in `us-east-1`
  stay `unverified_pending_join`, input and output: no bulk offer has a `us-east-1` SKU for
  them, and they are priced only on their model cards. Do not copy a model-card or GovCloud
  price into these rows.

Model IDs: Sonnet 4.5 (`anthropic.claude-sonnet-4-5-20250929-v1:0`), Haiku 4.5
(`anthropic.claude-haiku-4-5-20251001-v1:0`) and Opus 4.5
(`anthropic.claude-opus-4-5-20251101-v1:0`) were confirmed on their Amazon Bedrock model
cards on 2026-11-05, which replaces the earlier `UNVERIFIED_DATE` placeholders. Opus 4.1
(`20250805`) is from the model-lifecycle page. The current-generation IDs carry no date
stamp (`anthropic.claude-haiku-5-5`, `anthropic.claude-sonnet-5-5`,
`anthropic.claude-opus-5-5`, `anthropic.claude-sonnet-5`, `anthropic.claude-sonnet-4-6`,
`anthropic.claude-opus-4-8`, `openai.gpt-6-astra`, `openai.gpt-6-sol`, `openai.gpt-6-luna`,
`openai.gpt-6.1-sol`, `openai.gpt-5.6-sol`, `openai.gpt-5.6-luna`) and were read from each
model's Amazon Bedrock card on 2026-11-05. Never invent a date-stamp: if a new model's card
is not yet published, use a clearly labelled placeholder as before.

## Maintenance note: new model launches (AC3)

When a new model launches:

1. Add its rows to `bedrock_price_map.json` (base model ID, region, and the input, output,
   cache_read, and cache_write dimensions) with `status = unverified_pending_join` and
   `join.usagetype`, `price_per_1M_usd`, and `verified_date` all `null`. This makes a
   missing model a visible flagged row, not a silent gap.
2. Populate `join.usagetype`, `price_per_1M_usd`, `unit_source`, `source_url` and
   `verified_date` from the dated public bulk offer that prices the model (`AmazonBedrock`
   or `AmazonBedrockFoundationModels`; a signed `GetProducts` with the same `ServiceCode`
   works too), then set `status = verified`. For an `MP:` usagetype also set
   `join.servicename` to the row's exact `servicename`, and add the real offer rows to the
   matching fixture under `../tests/fixtures/`.
3. Re-run `python3 -m unittest discover` from `tools/calculators/`. The
   coverage-manifest test flags any supported model still lacking input and output rows,
   and the exactly-one-resolution test turns a renamed `usagetype` into a red test rather
   than a wrong number. Use `is_stale(entry, today)` to flag rows whose `verified_date` is
   older than the freshness window (90 days by default).
