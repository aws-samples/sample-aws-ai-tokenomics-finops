"""Tests for the Bedrock price-map resolver.

Run from ``tools/calculators/``::

    python3 -m unittest discover

The fixtures are real-row extracts of the two public bulk offers that price Bedrock
models: ``tests/fixtures/bedrock_offer_sample.json`` (``AmazonBedrock``, legacy
display-name usagetypes) and ``tests/fixtures/bedrock_fm_offer_sample.json``
(``AmazonBedrockFoundationModels``, the ``MP:`` usagetypes that price current Claude).
Every test asserts the join is STRUCTURAL (usagetype + regionCode, plus servicename for
``MP:`` rows), never a description-regex match, which is the correctness trap the design
exists to remove.
"""

import copy
import os
import unittest

from pricing import (
    AmbiguousMatchError,
    MissingCoverageError,
    PendingCoverageError,
    is_stale,
    load_offer_rows,
    load_price_map,
    resolve,
    strip_inference_profile_prefix,
    to_per_1M_usd,
)

_FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "bedrock_offer_sample.json")
_FM_FIXTURE = os.path.join(
    os.path.dirname(__file__), "fixtures", "bedrock_fm_offer_sample.json"
)


class ResolverTestCase(unittest.TestCase):
    def setUp(self):
        self.fm_rows = load_offer_rows(_FM_FIXTURE)
        self.rows = load_offer_rows(_FIXTURE) + self.fm_rows
        self.price_map = load_price_map()
        self.verified = [r for r in self.price_map if r.get("status") == "verified"]
        self.pending = [
            r for r in self.price_map if r.get("status") == "unverified_pending_join"
        ]

    # 1. Exactly-one resolution for every verified map row.
    def test_every_verified_row_resolves_to_exactly_one(self):
        self.assertTrue(self.verified, "expected at least one verified map row")
        for entry in self.verified:
            row = resolve(
                entry["model_id"], entry["region"], entry["dimension"], self.rows
            )
            self.assertEqual(
                row["attributes"]["usagetype"], entry["join"]["usagetype"]
            )
            self.assertEqual(row["attributes"]["regionCode"], entry["region"])
            # The curated price must equal the price the offer row actually carries.
            self.assertAlmostEqual(to_per_1M_usd(row), entry["price_per_1M_usd"])

    # 2. Missing coverage is loud (0-match and no-map-row both raise).
    def test_missing_coverage_raises(self):
        # A curated usagetype absent from the fixture must raise, not silently return.
        synthetic_map = [
            {
                "model_id": "test.model-v1:0",
                "region": "us-west-2",
                "dimension": "input",
                "join": {
                    "usagetype": "USW2-DoesNotExist-input-tokens",
                    "service_tier": None,
                    "operation": "",
                },
                "status": "verified",
            }
        ]
        with self.assertRaises(MissingCoverageError):
            resolve(
                "test.model-v1:0", "us-west-2", "input", self.rows, price_map=synthetic_map
            )
        # A model ID with no curated row at all also raises.
        with self.assertRaises(MissingCoverageError):
            resolve("does.not.exist-v1:0", "us-west-2", "input", self.rows)

    # 3. Ambiguous (>=2 match) is loud.
    def test_ambiguous_match_raises(self):
        dup = [
            {
                "sku": "AAA",
                "attributes": {
                    "regionCode": "us-west-2",
                    "usagetype": "USW2-Claude3Sonnet-input-tokens",
                    "operation": "",
                },
                "unit": "1K tokens",
                "price_per_unit_usd": 0.003,
                "description": "row A",
            },
            {
                "sku": "BBB",
                "attributes": {
                    "regionCode": "us-west-2",
                    "usagetype": "USW2-Claude3Sonnet-input-tokens",
                    "operation": "",
                },
                "unit": "1K tokens",
                "price_per_unit_usd": 0.003,
                "description": "row B",
            },
        ]
        with self.assertRaises(AmbiguousMatchError):
            resolve(
                "anthropic.claude-3-sonnet-20240229-v1:0", "us-west-2", "input", dup
            )

    # 4. Resolution ignores the free-text description entirely.
    def test_resolution_ignores_description(self):
        baseline = resolve(
            "anthropic.claude-3-sonnet-20240229-v1:0", "us-west-2", "input", self.rows
        )
        mutated = copy.deepcopy(self.rows)
        for row in mutated:
            if row["attributes"].get("usagetype") == "USW2-Claude3Sonnet-input-tokens":
                row["description"] = "TOTALLY DIFFERENT PROSE $9.99 per 1M for SomethingElse"
        after = resolve(
            "anthropic.claude-3-sonnet-20240229-v1:0", "us-west-2", "input", mutated
        )
        self.assertEqual(baseline["sku"], after["sku"])
        self.assertEqual(baseline["price_per_unit_usd"], after["price_per_unit_usd"])

    # 5. Unit normalisation: every resolved row's unit matches the curated unit_source,
    # 1K-token rows scale x1000 and 1M-token rows are already per 1M.
    def test_unit_normalisation_to_per_1M(self):
        for entry in self.verified:
            row = resolve(
                entry["model_id"], entry["region"], entry["dimension"], self.rows
            )
            self.assertIn(row["unit"], ("1K tokens", "1M tokens"))
            self.assertEqual(row["unit"], entry["unit_source"])
        sonnet = resolve(
            "anthropic.claude-3-sonnet-20240229-v1:0", "us-west-2", "input", self.rows
        )
        self.assertAlmostEqual(to_per_1M_usd(sonnet), 3.00)
        sonnet45 = resolve(
            "anthropic.claude-sonnet-4-5-20250929-v1:0", "ap-southeast-2", "input", self.rows
        )
        self.assertEqual(sonnet45["unit"], "1M tokens")
        self.assertAlmostEqual(to_per_1M_usd(sonnet45), 3.30)

    def test_to_per_1M_rejects_unknown_unit(self):
        # Real non-token units from the FoundationModels offer must never be scaled.
        for unit in ("1M TPM Hour", "hour", "1K requests"):
            with self.assertRaises(ValueError):
                to_per_1M_usd({"unit": unit, "price_per_unit_usd": 3.0})

    # 5b. MP: usagetypes are shared by every model in the Region: without servicename the
    # join is ambiguous (loud), and with it the join is exactly one row.
    def test_mp_usagetype_needs_servicename(self):
        shared = "APS2-MP:APS2_InputTokenCount-Units"
        sharers = [r for r in self.fm_rows if r["attributes"]["usagetype"] == shared]
        self.assertGreater(len(sharers), 1, "fixture must carry a usagetype collision")
        unpinned = [
            {
                "model_id": "anthropic.claude-sonnet-4-5-20250929-v1:0",
                "region": "ap-southeast-2",
                "dimension": "input",
                "join": {"usagetype": shared, "service_tier": None, "operation": ""},
                "status": "verified",
            }
        ]
        with self.assertRaises(AmbiguousMatchError):
            resolve(
                "anthropic.claude-sonnet-4-5-20250929-v1:0",
                "ap-southeast-2",
                "input",
                self.rows,
                price_map=unpinned,
            )
        for entry in self.verified:
            if "-MP:" in (entry["join"]["usagetype"] or ""):
                self.assertTrue(
                    entry["join"].get("servicename"),
                    "%s %s uses an MP: usagetype but pins no servicename"
                    % (entry["model_id"], entry["dimension"]),
                )

    # 5c. Pinning servicename never lets one model's price stand in for another's.
    def test_servicename_mismatch_is_missing_coverage(self):
        wrong = [
            {
                "model_id": "anthropic.claude-sonnet-4-5-20250929-v1:0",
                "region": "ap-southeast-2",
                "dimension": "input",
                "join": {
                    "usagetype": "APS2-MP:APS2_InputTokenCount-Units",
                    "service_tier": None,
                    "operation": "",
                    "servicename": "Claude Sonnet 4.5",
                },
                "status": "verified",
            }
        ]
        with self.assertRaises(MissingCoverageError):
            resolve(
                "anthropic.claude-sonnet-4-5-20250929-v1:0",
                "ap-southeast-2",
                "input",
                self.rows,
                price_map=wrong,
            )

    # 6. Inference-profile prefix strips to the same base row.
    def test_inference_profile_prefix_stripped(self):
        self.assertEqual(
            strip_inference_profile_prefix(
                "us.anthropic.claude-3-sonnet-20240229-v1:0"
            ),
            "anthropic.claude-3-sonnet-20240229-v1:0",
        )
        base = resolve(
            "anthropic.claude-3-sonnet-20240229-v1:0", "us-west-2", "input", self.rows
        )
        prefixed = resolve(
            "us.anthropic.claude-3-sonnet-20240229-v1:0", "us-west-2", "input", self.rows
        )
        self.assertEqual(base["sku"], prefixed["sku"])

    # 7. Coverage manifest: current-gen Claude family present with input and output rows,
    # every row either verified (and so resolvable, see test 1) or explicitly pending, and
    # no model ID carrying a placeholder date segment once its row is verified.
    def test_coverage_manifest_current_claude_family(self):
        ids = [r["model_id"] for r in self.price_map]
        self.assertTrue(any("sonnet-4-5" in i for i in ids))
        self.assertTrue(any("opus-4" in i for i in ids))
        self.assertTrue(any("haiku-4-5" in i for i in ids))
        for token in ("sonnet-4-5", "opus-4", "haiku-4-5"):
            dims = {
                r["dimension"]
                for r in self.price_map
                if token in r["model_id"]
            }
            self.assertIn("input", dims, "%s lacks an input row" % token)
            self.assertIn("output", dims, "%s lacks an output row" % token)
            statuses = {
                r["status"] for r in self.price_map if token in r["model_id"]
            }
            self.assertTrue(
                statuses <= {"verified", "unverified_pending_join"}, statuses
            )
        for r in self.price_map:
            if r["status"] == "verified":
                self.assertNotIn("UNVERIFIED", r["model_id"])
            else:
                # A pending row carries no price at all, never a guessed one.
                self.assertIsNone(r["price_per_1M_usd"])
                self.assertIsNone(r["join"]["usagetype"])
                self.assertIsNone(r["verified_date"])

    # 7a. Coverage manifest for the current generation in us-east-1: every model the runbook
    # prices has input and output rows there, either verified or explicitly pending.
    def test_coverage_manifest_current_generation_us_east_1(self):
        expected = {
            "anthropic.claude-haiku-5-5": "verified",
            "anthropic.claude-sonnet-5-5": "verified",
            "anthropic.claude-opus-5-5": "verified",
            "anthropic.claude-sonnet-5": "verified",
            "anthropic.claude-sonnet-4-6": "verified",
            "anthropic.claude-opus-4-8": "verified",
            "openai.gpt-6-astra": "verified",
            "openai.gpt-6-sol": "unverified_pending_join",
            "openai.gpt-6-luna": "unverified_pending_join",
            "openai.gpt-6.1-sol": "unverified_pending_join",
            "openai.gpt-5.6-sol": "unverified_pending_join",
            "openai.gpt-5.6-luna": "unverified_pending_join",
        }
        for model_id, status in expected.items():
            rows = [
                r
                for r in self.price_map
                if r["model_id"] == model_id and r["region"] == "us-east-1"
            ]
            dims = {r["dimension"] for r in rows}
            self.assertTrue({"input", "output"} <= dims, "%s lacks input/output" % model_id)
            self.assertEqual({r["status"] for r in rows}, {status}, model_id)

    # 7a2. A current-generation MP: row joins the In-Region Standard SKU, never the global.,
    # long-context, batch or longer-TTL variant that the fixture carries beside it for the
    # same model, and those variants really are priced differently.
    def test_current_rows_pick_in_region_standard_sku(self):
        current = [
            r
            for r in self.verified
            if r["region"] == "us-east-1" and "-MP:" in r["join"]["usagetype"]
        ]
        self.assertGreaterEqual(len(current), 24)
        for entry in current:
            row = resolve(entry["model_id"], entry["region"], entry["dimension"], self.rows)
            usagetype = row["attributes"]["usagetype"]
            for variant in ("global", "Global", "long_ctx", "Batch", "_1h_"):
                self.assertNotIn(variant, usagetype, entry)
            siblings = [
                r
                for r in self.fm_rows
                if r["attributes"].get("regionCode") == "us-east-1"
                and r["attributes"].get("servicename") == entry["join"]["servicename"]
                and r["attributes"].get("inferenceType") == row["attributes"]["inferenceType"]
                and r["sku"] != row["sku"]
            ]
            self.assertTrue(siblings, "fixture lacks a variant beside %s" % row["sku"])
            self.assertTrue(
                any(s["price_per_unit_usd"] != row["price_per_unit_usd"] for s in siblings),
                "no differently priced variant beside %s" % row["sku"],
            )

    # 7a3. The rows added from the 2026-11 offer carry their dated source.
    def test_current_rows_provenance(self):
        for entry in self.verified:
            if entry["region"] != "us-east-1":
                continue
            self.assertEqual(entry["verified_date"], "2026-11-05")
            self.assertIn("/AmazonBedrockFoundationModels/20261012084008/us-east-1/", entry["source_url"])
            self.assertEqual(entry["unit_source"], "1M tokens")

    # 7a4. A pending row says why it is pending, so nobody fills it with a guessed price.
    def test_pending_rows_state_reason(self):
        for entry in self.pending:
            self.assertTrue(entry.get("note"), entry["model_id"])
        for model_id in ("openai.gpt-6-sol", "openai.gpt-6-luna", "openai.gpt-6.1-sol"):
            notes = [r["note"] for r in self.pending if r["model_id"] == model_id]
            self.assertTrue(notes, model_id)
            for note in notes:
                self.assertIn("model card", note)
            with self.assertRaises(PendingCoverageError):
                resolve(model_id, "us-east-1", "input", self.rows)

    # 7b. A pending row raises PendingCoverageError, not a silent wrong price.
    def test_pending_row_raises_pending_coverage(self):
        entry = self.pending[0]
        with self.assertRaises(PendingCoverageError):
            resolve(entry["model_id"], entry["region"], entry["dimension"], self.rows)

    # 8. Provenance + freshness.
    def test_verified_rows_have_provenance(self):
        for entry in self.verified:
            self.assertTrue(entry.get("source_url"))
            self.assertTrue(entry.get("verified_date"))

    def test_is_stale_window(self):
        fresh = {"verified_date": "2026-07-07"}
        old = {"verified_date": "2020-01-01"}
        self.assertFalse(is_stale(fresh, "2026-07-10", window_days=90))
        self.assertTrue(is_stale(old, "2026-07-10", window_days=90))
        # A pending row (no verified_date) is always stale.
        self.assertTrue(is_stale({"verified_date": None}, "2026-07-10"))

    # Full four-dimension coverage exists for at least one model (spec Req 1.1 / 4.3).
    def test_four_dimensions_covered(self):
        dims = {r["dimension"] for r in self.price_map}
        self.assertTrue({"input", "output", "cache_read", "cache_write"} <= dims)

    # Every row is keyed by region + dimension + join.usagetype (key present, may be null).
    def test_rows_are_structurally_keyed(self):
        for r in self.price_map:
            self.assertIn("region", r)
            self.assertIn("dimension", r)
            self.assertIn("usagetype", r["join"])


if __name__ == "__main__":
    unittest.main()
