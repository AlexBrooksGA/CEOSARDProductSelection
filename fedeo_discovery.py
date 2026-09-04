"""Conservative discovery of FedEO collections outside the known product list.

Discovery is a separate, optional sidecar.  Returned collections are never
converted into :class:`models.Product`, appended to the catalogue, or used by
the application's filters, matching, comparison, or CEOS-ARD status logic.
"""

from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Any, Callable, Iterable
import unicodedata

from fedeo_api import search_collections
from fedeo_matching import FedeoCandidate, FedeoProductIdentity, HIGH_SCORE, score_collection
from fedeo_normalisation import FedeoCollection, normalise_collection


DISCOVERY_LIMIT = 20
VISIBLE_LIMIT = 8
POSSIBLE_OVERLAP_SCORE = 55

_FAMILY_QUERIES = {
    "surface reflectance": "surface reflectance",
    "surface temperature": "land surface temperature",
    "synthetic aperture radar": "SAR backscatter",
    "aquatic reflectance": "aquatic reflectance",
    "night-time lights": "night-time lights",
}


@dataclass(frozen=True, slots=True)
class FedeoDiscoverySearch:
    """Cached query result before catalogue-dependent overlap screening."""

    query: str
    collections: tuple[FedeoCollection, ...]
    malformed_count: int = 0


@dataclass(frozen=True, slots=True)
class FedeoDiscoveryRecord:
    """One returned collection with no reliable known-product overlap."""

    collection: FedeoCollection
    closest_known: FedeoCandidate | None = None


@dataclass(frozen=True, slots=True)
class FedeoDiscoveryBatch:
    """Display-safe discovery outcome and diagnostic counts."""

    query: str
    records: tuple[FedeoDiscoveryRecord, ...]
    additional_count: int
    returned_count: int
    overlaps_removed: int = 0
    duplicate_ids_removed: int = 0
    context_removed: int = 0
    malformed_count: int = 0

    @property
    def hidden_count(self) -> int:
        return max(0, self.additional_count - len(self.records))


def _canonical(value: str) -> str:
    text = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii").casefold()
    return " ".join(re.findall(r"[a-z0-9]+", text))


def canonical_discovery_query(query: str) -> str:
    """Return a stable cache key without changing the meaning of a query."""

    return " ".join(str(query or "").split()).strip()


def derive_discovery_query(
    selected_family: str,
    profile_families: Iterable[str] = (),
    search_text: str = "",
) -> str | None:
    """Choose one deterministic, meaningful search; never query the UI's All label."""

    family_key = str(selected_family or "").strip().casefold()
    if family_key and family_key != "all product families":
        return _FAMILY_QUERIES.get(family_key, str(selected_family).strip())

    user_query = canonical_discovery_query(search_text)
    if user_query:
        return user_query
    for family in profile_families:
        key = str(family or "").strip().casefold()
        if key in _FAMILY_QUERIES:
            return _FAMILY_QUERIES[key]
    return None


def search_and_normalise(
    query: str,
    *,
    searcher: Callable[..., list[dict[str, Any]]] = search_collections,
    limit: int = DISCOVERY_LIMIT,
) -> FedeoDiscoverySearch:
    """Make one bounded collection search and retain every valid raw response."""

    canonical_query = canonical_discovery_query(query)
    if not canonical_query:
        return FedeoDiscoverySearch("", ())
    raw_collections = searcher(canonical_query, limit=limit, max_pages=1)
    collections: list[FedeoCollection] = []
    malformed = 0
    for raw in raw_collections:
        try:
            collection = normalise_collection(raw)
        except (TypeError, ValueError):
            malformed += 1
            continue
        if not collection.collection_id:
            malformed += 1
            continue
        collections.append(collection)
    return FedeoDiscoverySearch(canonical_query, tuple(collections), malformed)


def _strong_title(candidate: FedeoCandidate) -> bool:
    return any(
        reason.startswith(("Normalised titles are exact.", "Titles strongly agree"))
        for reason in candidate.reasons
    )


def _is_overlap(candidate: FedeoCandidate) -> bool:
    if candidate.conflicts:
        return False
    high = candidate.score >= HIGH_SCORE and _strong_title(candidate) and len(candidate.corroborators) >= 2
    possible = candidate.score >= POSSIBLE_OVERLAP_SCORE or _strong_title(candidate)
    return high or possible


def _searchable_text(collection: FedeoCollection) -> str:
    values: list[str] = [collection.collection_id, collection.title or ""]
    for name in ("description", "platforms", "instruments", "agency", "product_type", "processing_levels"):
        value = collection.value(name)
        if isinstance(value, list):
            values.extend(str(item) for item in value)
        elif value not in (None, ""):
            values.append(str(value))
    return _canonical(" ".join(values))


def _matches_context(collection: FedeoCollection, context_text: str) -> bool:
    wanted = set(_canonical(context_text).split())
    return not wanted or wanted <= set(_searchable_text(collection).split())


def classify_discoveries(
    search_result: FedeoDiscoverySearch,
    known_identities: Iterable[FedeoProductIdentity],
    *,
    accepted_collection_ids: Iterable[str] = (),
    context_text: str = "",
    visible_limit: int = VISIBLE_LIMIT,
) -> FedeoDiscoveryBatch:
    """Remove known and possible overlaps without asserting global novelty."""

    if visible_limit < 0:
        raise ValueError("visible_limit cannot be negative.")
    identities = tuple(known_identities)
    known_ids = {
        value.strip().casefold()
        for identity in identities
        for value in identity.fedeo_collection_ids
        if value.strip()
    }
    known_ids.update(str(value).strip().casefold() for value in accepted_collection_ids if str(value).strip())

    seen_ids: set[str] = set()
    additional: list[FedeoDiscoveryRecord] = []
    overlaps_removed = 0
    duplicate_ids_removed = 0
    context_removed = 0
    for collection in search_result.collections:
        collection_key = collection.collection_id.strip().casefold()
        if collection_key in seen_ids:
            duplicate_ids_removed += 1
            continue
        seen_ids.add(collection_key)
        if collection_key in known_ids:
            overlaps_removed += 1
            continue
        if context_text and not _matches_context(collection, context_text):
            context_removed += 1
            continue

        candidates = [score_collection(identity, collection) for identity in identities]
        closest = min(
            candidates,
            key=lambda item: (-item.score, len(item.conflicts), item.collection_id.casefold()),
            default=None,
        )
        if any(_is_overlap(candidate) for candidate in candidates):
            overlaps_removed += 1
            continue
        additional.append(FedeoDiscoveryRecord(collection, closest))

    return FedeoDiscoveryBatch(
        query=search_result.query,
        records=tuple(additional[:visible_limit]),
        additional_count=len(additional),
        returned_count=len(search_result.collections) + search_result.malformed_count,
        overlaps_removed=overlaps_removed,
        duplicate_ids_removed=duplicate_ids_removed,
        context_removed=context_removed,
        malformed_count=search_result.malformed_count,
    )
