"""Resolve a Bedrock model ID to its AWS Price List offer row by structured equality.

The AWS Price List (both the SigV4-signed GetProducts Query API and the public bulk
offer) does NOT carry the Bedrock API model ID in any structured field. Matching on the
free-text ``description`` is brittle and breaks silently. This module resolves a price row
by equality on the structured ``usagetype`` plus ``regionCode`` (confirmed with
``service_tier`` / ``operation`` where the curated row specifies them), never by parsing
the ``description`` prose or the ``model`` display name. See ``README.md`` in this package.

Stdlib only. Python 3.9 compatible (the repo host runs 3.9.25).
"""

from __future__ import annotations

import datetime
import json
import os
from typing import Any, Dict, List, Optional, Union

__all__ = [
    "load_price_map",
    "load_offer_rows",
    "strip_inference_profile_prefix",
    "resolve",
    "to_per_1M_usd",
    "is_stale",
    "PendingCoverageError",
    "MissingCoverageError",
    "AmbiguousMatchError",
]

_MAP_FILENAME = "bedrock_price_map.json"

# Geographic cross-region inference-profile prefixes. The profile does not change the
# price (it is billed at the source Region), so strip it to recover the base model ID.
_PROFILE_PREFIXES = ("us.", "eu.", "apac.", "global.")


class PendingCoverageError(Exception):
    """The model is in scope but its join is not yet resolvable (status pending)."""


class MissingCoverageError(Exception):
    """No curated map row, or zero offer rows match the curated join key (0 match)."""


class AmbiguousMatchError(Exception):
    """More than one offer row matches the curated join key (>=2 match)."""


def load_price_map(path: Optional[str] = None) -> List[Dict[str, Any]]:
    """Load the curated model-ID to price-row map and return its ``rows`` list.

    ``path`` defaults to ``bedrock_price_map.json`` beside this module, so the loader is
    independent of the current working directory.
    """
    if path is None:
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), _MAP_FILENAME)
    with open(path, "r", encoding="utf-8") as handle:
        data = json.load(handle)
    return data["rows"]


def load_offer_rows(path: str) -> List[Dict[str, Any]]:
    """Flatten a bulk-offer JSON into row dicts joined by SKU.

    Each returned row is ``{sku, attributes{...}, unit, price_per_unit_usd, description}``.
    ``products{}`` supplies the attributes; ``terms.OnDemand{}`` (keyed by the same SKU)
    supplies the unit, USD price, and free-text description.
    """
    with open(path, "r", encoding="utf-8") as handle:
        data = json.load(handle)
    products = data.get("products", {})
    ondemand = data.get("terms", {}).get("OnDemand", {})
    rows = []  # type: List[Dict[str, Any]]
    for sku, product in products.items():
        attributes = product.get("attributes", {})
        unit = None  # type: Optional[str]
        price = None  # type: Optional[float]
        description = None  # type: Optional[str]
        for term in ondemand.get(sku, {}).values():
            for dimension in term.get("priceDimensions", {}).values():
                unit = dimension.get("unit")
                description = dimension.get("description")
                usd = dimension.get("pricePerUnit", {}).get("USD")
                price = float(usd) if usd is not None else None
                break
            break
        rows.append(
            {
                "sku": sku,
                "attributes": attributes,
                "unit": unit,
                "price_per_unit_usd": price,
                "description": description,
            }
        )
    return rows


def strip_inference_profile_prefix(model_id: str) -> str:
    """Remove a leading geographic inference-profile prefix (us./eu./apac./global.).

    ``us.anthropic.claude-3-sonnet-20240229-v1:0`` returns
    ``anthropic.claude-3-sonnet-20240229-v1:0``. Any other model ID is returned unchanged.
    """
    for prefix in _PROFILE_PREFIXES:
        if model_id.startswith(prefix):
            return model_id[len(prefix):]
    return model_id


def _find_map_entry(
    model_id: str,
    region: str,
    dimension: str,
    price_map: List[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    base_id = strip_inference_profile_prefix(model_id)
    for entry in price_map:
        if (
            entry.get("model_id") == base_id
            and entry.get("region") == region
            and entry.get("dimension") == dimension
        ):
            return entry
    return None


def resolve(
    model_id: str,
    region: str,
    dimension: str,
    offer_rows: List[Dict[str, Any]],
    price_map: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Return the single offer row that prices ``(model_id, region, dimension)``.

    Resolution is a structured-equality lookup, never a description-regex match:

    1. Strip any geographic inference-profile prefix and find the curated map entry for
       ``(base_id, region, dimension)``. No entry raises :class:`MissingCoverageError`.
    2. A ``status == unverified_pending_join`` entry (or a null ``join.usagetype``) raises
       :class:`PendingCoverageError`: the model is in scope but not yet resolvable.
    3. Otherwise match ``offer_rows`` on ``attributes.regionCode == region`` AND
       ``attributes.usagetype == entry.join.usagetype``, further constrained by
       ``service_tier`` / ``operation`` only where the entry specifies a non-null value.
       Zero matches raise :class:`MissingCoverageError`; two or more raise
       :class:`AmbiguousMatchError`; exactly one is returned.
    """
    if price_map is None:
        price_map = load_price_map()

    entry = _find_map_entry(model_id, region, dimension, price_map)
    if entry is None:
        raise MissingCoverageError(
            "no curated map row for ({0!r}, {1!r}, {2!r})".format(
                strip_inference_profile_prefix(model_id), region, dimension
            )
        )

    join = entry.get("join", {})
    usagetype = join.get("usagetype")
    if entry.get("status") == "unverified_pending_join" or usagetype is None:
        raise PendingCoverageError(
            "row for ({0!r}, {1!r}, {2!r}) is pending join; populate its usagetype "
            "and price from a signed GetProducts or the dated pricing page".format(
                entry.get("model_id"), region, dimension
            )
        )

    expected_service_tier = join.get("service_tier")
    expected_operation = join.get("operation")

    matches = []  # type: List[Dict[str, Any]]
    for row in offer_rows:
        attributes = row.get("attributes", {})
        if attributes.get("regionCode") != region:
            continue
        if attributes.get("usagetype") != usagetype:
            continue
        if expected_service_tier is not None and attributes.get("service_tier") != expected_service_tier:
            continue
        if expected_operation is not None and attributes.get("operation", "") != expected_operation:
            continue
        matches.append(row)

    if not matches:
        raise MissingCoverageError(
            "usagetype {0!r} (region {1!r}) has no offer row; a new/renamed model or a "
            "missing region".format(usagetype, region)
        )
    if len(matches) > 1:
        raise AmbiguousMatchError(
            "usagetype {0!r} (region {1!r}) matched {2} offer rows; the join key leaked "
            "a tier/cache/batch variant".format(usagetype, region, len(matches))
        )
    return matches[0]


def to_per_1M_usd(row: Dict[str, Any]) -> float:
    """Convert an offer row's price to USD per 1,000,000 tokens.

    The bulk offer quotes token pricing per ``1K tokens``, so this multiplies by 1000.
    An unrecognised unit raises ``ValueError`` rather than silently returning a wrong scale.
    """
    unit = row.get("unit")
    price = row.get("price_per_unit_usd")
    if price is None:
        raise ValueError("offer row has no price_per_unit_usd")
    if unit == "1K tokens":
        return price * 1000.0
    raise ValueError("unrecognised offer unit {0!r}; expected '1K tokens'".format(unit))


def _parse_date(value: Union[str, datetime.date]) -> datetime.date:
    if isinstance(value, datetime.datetime):
        return value.date()
    if isinstance(value, datetime.date):
        return value
    return datetime.date.fromisoformat(value)


def is_stale(
    entry: Dict[str, Any],
    today: Union[str, datetime.date],
    window_days: int = 90,
) -> bool:
    """Return True when the entry's ``verified_date`` is older than ``window_days``.

    A row with no ``verified_date`` (an ``unverified_pending_join`` row) is always stale:
    it needs a maintainer to read a live, dated price before it can price anything.
    """
    verified = entry.get("verified_date")
    if not verified:
        return True
    return (_parse_date(today) - _parse_date(verified)).days > window_days
