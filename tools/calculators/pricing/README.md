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
any attribute value in the `us-west-2` offer. The current Claude family (Sonnet 4.5,
Opus 4.x, Haiku 4.5) is not in the bulk offer at all; the only Anthropic rows are five
legacy `-input-tokens` rows (Claude 2.0, 2.1, Instant, 3 Haiku, 3 Sonnet), and
`ap-southeast-2` has zero Anthropic rows.

Sources: [GetProducts API reference](https://docs.aws.amazon.com/aws-cost-management/latest/APIReference/API_pricing_GetProducts.html),
[GetAttributeValues API reference](https://docs.aws.amazon.com/aws-cost-management/latest/APIReference/API_pricing_GetAttributeValues.html),
[Reading an offer file](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/reading-an-offer.html),
[Bedrock pricing bulk offer region index](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonBedrock/current/region_index.json).

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
`service_tier` and `operation` where those are present. Concretely, for a curated row:

```
price_row  <=  match on ( attributes.regionCode == region
                          AND attributes.usagetype == curated join.usagetype )
               confirm with ( service_tier, operation ) where the curated row sets them
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
  `-v1:0` suffix) and does populate `service_tier`. The `-mantle-` segment is part of the AWS billing identifier, so the parser matches it as written. Claude does not use this style, so you
  cannot lift a Claude model ID from any usagetype. That is why a curated map is required.

Unit: token rows are priced per `1K tokens`, so multiply by 1000 to reach per-1M tokens.
`to_per_1M_usd(row)` does this and rejects an unrecognised unit rather than silently
returning a wrong scale.

Cross-region: a geographic inference profile (`us.` / `eu.` / `apac.` prefix) is billed
at the source Region and adds no premium, so the resolver strips the prefix to the base
model ID rather than duplicating a row per prefix. Only the `global.` profile has its own
lower-priced `-cross-region-global` usagetype, so only that warrants its own row, and only
for models where AWS publishes it.

## Price discipline (AC4)

The map does not hardcode volatile current-generation per-token prices. Every
`status == unverified_pending_join` row has `price_per_1M_usd` set to `null`; every row
that does carry a non-null `price_per_1M_usd` carries a resolvable AWS `source_url` and a
`verified_date`. The only priced rows are the legacy figures read directly from the
2026-07-07 bulk offer (for example Claude 3 Sonnet at `$3.00 / 1M input tokens`, that is
`0.00300 per 1K tokens` times 1000). Current Opus 4.x, Sonnet 4.5, and Haiku 4.5 numbers
are left as `unverified_pending_join` for a maintainer to read live and date.

Model IDs for the Active Claude family (Opus 4.5, Haiku 4.5, and 3.5 Haiku) are marked
UNVERIFIED: their exact date-stamps are not on the AWS model-lifecycle page, which lists
only Legacy models. Those rows carry a clearly labelled placeholder date segment
(`UNVERIFIED_DATE`) instead of an invented date; confirm the exact
`anthropic.claude-...-YYYYMMDD-v1:0` string on the model card before use. Claude Sonnet
4.5 (`20250929`) and Opus 4.1 (`20250805`) use the IDs from the original request and the
model-lifecycle page respectively.

## Maintenance note: new model launches (AC3)

When a new model launches:

1. Add its rows to `bedrock_price_map.json` (base model ID, region, and the input, output,
   cache_read, and cache_write dimensions) with `status = unverified_pending_join` and
   `join.usagetype`, `price_per_1M_usd`, and `verified_date` all `null`. This makes a
   missing model a visible flagged row, not a silent gap.
2. Populate `join.usagetype`, `price_per_1M_usd`, and `verified_date` from a signed
   `GetProducts` (`ServiceCode=AmazonBedrock`, filter `regionCode`) or the dated Bedrock
   pricing page, then set `status = verified`.
3. Re-run `python3 -m unittest discover` from `tools/calculators/`. The
   coverage-manifest test flags any supported model still lacking input and output rows,
   and the exactly-one-resolution test turns a renamed `usagetype` into a red test rather
   than a wrong number. Use `is_stale(entry, today)` to flag rows whose `verified_date` is
   older than the freshness window (90 days by default).
