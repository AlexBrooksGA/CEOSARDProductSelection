"""Conservative FedEO candidate matching and optional enrichment orchestration.

This module never mutates the application's :class:`models.Product` records.
Only an explicit FedEO identifier or a unique, strongly corroborated metadata
match is selected; possible matches remain diagnostics.
"""

from __future__ import annotations

from dataclasses import dataclass
from difflib import SequenceMatcher
import re
import unicodedata
from typing import Any, Callable, Iterable
from urllib.parse import parse_qs, unquote, urlparse

from fedeo_api import FedeoApiError, FedeoServiceError, get_collection, search_collections
from fedeo_normalisation import FedeoCollection, FedeoField, normalise_collection
from models import Product


EXACT_IDENTIFIER = "exact_identifier"
HIGH_CONFIDENCE = "high_confidence_metadata"
POSSIBLE_MATCH = "possible_match"
NO_MATCH = "no_match"

LOOKUP_OK = "ok"
LOOKUP_NOT_QUERIED = "not_queried"
LOOKUP_UNAVAILABLE = "unavailable"
LOOKUP_MALFORMED = "malformed"

HIGH_SCORE = 80
HIGH_MARGIN = 15


PROTECTED_PRODUCT_FIELDS = frozenset(
    {
        "ceos_ard_assessment_id", "ceos_ard_status", "ceos_ard_verified",
        "ceos_ard_pfs", "ceos_ard_assessment_level", "ceos_ard_record_url",
        "pfs_type", "pfs_version", "approval_date", "self_assessment_url",
        "peer_review_url", "ard_tier", "ard_tier_display", "ard_tier_notes",
        "geometric_accuracy_display", "geometric_accuracy_metric",
        "geometric_accuracy_value", "geometric_accuracy_unit",
        "radiometric_accuracy_display", "radiometric_accuracy_metric",
        "radiometric_accuracy_value", "radiometric_accuracy_unit", "notes",
        "radiometric_bit_depth", "radiometric_bit_depth_display", "bit_depth_basis",
    }
)


@dataclass(frozen=True, slots=True)
class FedeoProductIdentity:
    product_id: str
    product_name: str
    missions: tuple[str, ...] = ()
    instruments: tuple[str, ...] = ()
    providers: tuple[str, ...] = ()
    product_family: str | None = None
    processing_terms: tuple[str, ...] = ()
    dois: tuple[str, ...] = ()
    fedeo_collection_ids: tuple[str, ...] = ()
    external_urls: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class FedeoCandidate:
    collection_id: str
    title: str | None
    score: int
    corroborators: tuple[str, ...]
    conflicts: tuple[str, ...]
    reasons: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class FedeoMatch:
    product_id: str
    lookup_status: str
    confidence: str
    selected: bool
    collection: FedeoCollection | None
    candidates: tuple[FedeoCandidate, ...] = ()
    reasons: tuple[str, ...] = ()


@dataclass(slots=True)
class FedeoBatch:
    """Bounded batch result used by the optional Streamlit integration."""

    enrichments: dict[str, FedeoMatch]
    diagnostics: list[FedeoMatch]
    queried: int
    unprocessed: int
    service_error: str | None = None

    def match_for(self, product_id: str) -> FedeoMatch | None:
        if product_id in self.enrichments:
            return self.enrichments[product_id]
        return next((item for item in self.diagnostics if item.product_id == product_id), None)

    @property
    def matches(self) -> dict[str, FedeoMatch]:
        """Compatibility alias; selected enrichments remain authoritative."""

        return self.enrichments

    @property
    def processed_count(self) -> int:
        return self.queried

    @property
    def lookup_status(self) -> str:
        if self.queried == 0 and self.service_error:
            return "unavailable"
        if self.service_error or self.unprocessed:
            return "partial"
        return "complete"


def _unique(values: Iterable[str | None]) -> tuple[str, ...]:
    result: list[str] = []
    for value in values:
        if not value:
            continue
        text = str(value).strip()
        if text and text.casefold() not in {existing.casefold() for existing in result}:
            result.append(text)
    return tuple(result)


def _doi_from_url(url: str) -> str | None:
    parsed = urlparse(url)
    if parsed.hostname and parsed.hostname.casefold() in {"doi.org", "dx.doi.org"}:
        return unquote(parsed.path.lstrip("/")) or None
    return None


def _fedeo_id_from_url(url: str) -> str | None:
    parsed = urlparse(url)
    if not parsed.hostname or parsed.hostname.casefold() not in {"fedeo.ceos.org", "fedeo-client.ceos.org"}:
        return None
    parts = [unquote(item) for item in parsed.path.split("/") if item]
    for marker in ("collections", "items"):
        if marker in parts and parts.index(marker) + 1 < len(parts):
            candidate = parts[parts.index(marker) + 1]
            if marker == "collections" and candidate in {"series", "datasets", "services"} and "items" in parts:
                continue
            return candidate
    uid = parse_qs(parsed.query).get("uid", [])
    return uid[0].strip() if uid and uid[0].strip() else None


def identity_from_product(product: Product) -> FedeoProductIdentity:
    """Copy only matching identity from a Product; the Product is never changed."""

    urls = _unique(
        (
            product.access_url, product.information_url, product.source_url,
            product.ceos_ard_record_url, product.sample_product_url,
        )
    )
    missions = _unique((*product.missions, product.mission_name))
    missions = tuple(value for value in missions if "not reported" not in value.casefold())
    instruments = _unique((*product.instruments, product.sensor_or_instrument_type))
    providers = _unique((product.agency, product.provider))
    processing = _unique((product.pfs_type, product.ceos_ard_pfs))
    return FedeoProductIdentity(
        product_id=product.id,
        product_name=product.official_product_name or product.product_name,
        missions=missions,
        instruments=instruments,
        providers=providers,
        product_family=product.product_family,
        processing_terms=processing,
        dois=_unique(_doi_from_url(url) for url in urls),
        fedeo_collection_ids=_unique(_fedeo_id_from_url(url) for url in urls),
        external_urls=urls,
    )


def _canonical(value: str) -> str:
    text = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii").casefold()
    replacements = {
        "radiometric terrain corrected": " rtc ",
        "cloud optimized geotiff": " cog ",
        "cloud-optimized geotiff": " cog ",
        "surface reflectance": " surface_reflectance ",
        "surface temperature": " surface_temperature ",
        "level-2a": " l2a ", "level 2a": " l2a ", "level2a": " l2a ",
        "level-2": " l2 ", "level 2": " l2 ", "level2": " l2 ",
        "level-1": " l1 ", "level 1": " l1 ", "level1": " l1 ",
        "synthetic aperture radar": " sar ",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    return " ".join(re.findall(r"[a-z0-9_]+", text))


_GENERIC_TITLE_TOKENS = {"the", "and", "data", "dataset", "product", "products", "collection", "archive"}


def _tokens(value: str) -> set[str]:
    return {token for token in _canonical(value).split() if token not in _GENERIC_TITLE_TOKENS}


def _term_matches(left: str, right: str) -> bool:
    a, b = _canonical(left).replace(" ", ""), _canonical(right).replace(" ", "")
    if not a or not b:
        return False
    if a == b:
        return True
    # Mission collections often use Sentinel-2 while curated products enumerate
    # Sentinel-2A/B; this narrow suffix rule does not equate unrelated names.
    if min(len(a), len(b)) >= 7 and (a.startswith(b) or b.startswith(a)):
        suffix = a[len(b):] if a.startswith(b) else b[len(a):]
        return suffix in {"", "a", "b", "c", "d"}
    return False


def _sets_overlap(left: Iterable[str], right: Iterable[str]) -> bool:
    return any(_term_matches(a, b) for a in left for b in right)


def _provider_overlap(left: Iterable[str], right: Iterable[str]) -> bool:
    for a in left:
        a_tokens = _tokens(a)
        for b in right:
            b_tokens = _tokens(b)
            if a_tokens and b_tokens and (a_tokens == b_tokens or a_tokens <= b_tokens or b_tokens <= a_tokens):
                return True
    return False


def _collection_strings(collection: FedeoCollection, name: str) -> tuple[str, ...]:
    value = collection.value(name, [])
    if isinstance(value, list):
        return _unique(str(item) for item in value if isinstance(item, (str, int, float)))
    return _unique((str(value),)) if value not in (None, "") else ()


def _family_tags(values: Iterable[str]) -> set[str]:
    text = " ".join(_canonical(value) for value in values)
    tags: set[str] = set()
    if "surface_reflectance" in text:
        tags.add("surface_reflectance")
    if "surface_temperature" in text:
        tags.add("surface_temperature")
    if re.search(r"\b(sar|nrb|rtc|backscatter)\b", text):
        tags.add("sar_backscatter")
    if re.search(r"\b(insar|displacement|interferometric)\b", text):
        tags.add("sar_displacement")
    if re.search(r"\b(pol|polarimetric|polarimetry)\b", text):
        tags.add("sar_polarimetry")
    return tags


def _level_tags(values: Iterable[str]) -> set[str]:
    text = " ".join(_canonical(value) for value in values)
    return set(re.findall(r"\bl(?:evel)?[0-9][a-z]?\b", text))


def _variant_tags(values: Iterable[str]) -> set[str]:
    """Return product-changing qualifiers that must not be ignored as extras."""

    text = " ".join(_canonical(value) for value in values)
    tags: set[str] = set()
    for tag, pattern in {
        "static": r"\b(static|static_layers?)\b",
        "mosaic": r"\b(mosaic|mosaics)\b",
    }.items():
        if re.search(pattern, text):
            tags.add(tag)
    return tags


def _title_score(product_name: str, collection_title: str | None) -> tuple[int, bool, str]:
    if not collection_title:
        return 0, False, "Collection title is not reported."
    product = _canonical(product_name)
    candidate = _canonical(collection_title)
    if product == candidate:
        return 45, True, "Normalised titles are exact."
    product_tokens, candidate_tokens = _tokens(product_name), _tokens(collection_title)
    overlap = product_tokens & candidate_tokens
    coverage = len(overlap) / len(product_tokens) if product_tokens else 0
    ratio = SequenceMatcher(None, product, candidate).ratio()
    if len(overlap) >= 2 and (coverage >= 0.75 or ratio >= 0.86):
        return 35, True, f"Titles strongly agree (coverage {coverage:.2f}, similarity {ratio:.2f})."
    if len(overlap) >= 2 and (coverage >= 0.55 or ratio >= 0.72):
        return 25, False, f"Titles partly agree (coverage {coverage:.2f}, similarity {ratio:.2f})."
    return 0, False, "Titles do not agree strongly enough."


def _score(identity: FedeoProductIdentity, collection: FedeoCollection) -> FedeoCandidate:
    score, strong_title, title_reason = _title_score(identity.product_name, collection.title)
    reasons = [title_reason]
    corroborators: list[str] = []
    conflicts: list[str] = []

    platforms = _collection_strings(collection, "platforms") + _collection_strings(collection, "constellation")
    instruments = _collection_strings(collection, "instruments")
    agencies = _collection_strings(collection, "agency")
    if identity.missions and platforms:
        if _sets_overlap(identity.missions, platforms):
            score += 15
            corroborators.append("mission/platform")
        else:
            conflicts.append("mission/platform")
    if identity.instruments and instruments:
        if _sets_overlap(identity.instruments, instruments):
            score += 15
            corroborators.append("instrument")
        else:
            conflicts.append("instrument")
    if identity.providers and agencies:
        if _provider_overlap(identity.providers, agencies):
            score += 15
            corroborators.append("provider")
        else:
            conflicts.append("provider")

    candidate_doi = str(collection.value("doi", "")).casefold().removeprefix("https://doi.org/")
    if candidate_doi and any(candidate_doi == doi.casefold().removeprefix("https://doi.org/") for doi in identity.dois):
        score += 25
        corroborators.append("doi")

    identity_family = _family_tags((identity.product_name, identity.product_family or "", *identity.processing_terms))
    candidate_family = _family_tags(
        (collection.title or "", *_collection_strings(collection, "product_type"), *_collection_strings(collection, "processing_levels"))
    )
    if identity_family and candidate_family:
        if identity_family & candidate_family:
            score += 10
            corroborators.append("product family")
        else:
            conflicts.append("product family")

    identity_levels = _level_tags((identity.product_name, *identity.processing_terms))
    candidate_levels = _level_tags((collection.title or "", *_collection_strings(collection, "processing_levels")))
    if identity_levels and candidate_levels and identity_levels.isdisjoint(candidate_levels):
        conflicts.append("processing level")

    identity_variants = _variant_tags((identity.product_name, *identity.processing_terms))
    candidate_variants = _variant_tags((collection.title or "", *_collection_strings(collection, "product_type")))
    if candidate_variants - identity_variants:
        conflicts.append("product variant")

    if conflicts:
        score = max(0, score - 30 * len(set(conflicts)))
        reasons.append("Explicit metadata conflicts reduce the candidate score.")

    reasons.extend(f"Corroborated by {name}." for name in corroborators)
    reasons.extend(f"Conflicting {name} metadata." for name in conflicts)
    if not strong_title:
        reasons.append("A strong title match is required for metadata-only selection.")
    return FedeoCandidate(collection.collection_id, collection.title, score, tuple(corroborators), tuple(conflicts), tuple(reasons))


def score_collection(identity: FedeoProductIdentity, collection: FedeoCollection) -> FedeoCandidate:
    """Score one already-normalised collection without selecting or attaching it.

    FedEO discovery uses this read-only view of the established matching rules
    to avoid advertising a known or possibly overlapping collection as an
    additional candidate.  Selection thresholds remain owned by the callers.
    """

    return _score(identity, collection)


def _rank(identity: FedeoProductIdentity, collections: Iterable[FedeoCollection]) -> list[FedeoCandidate]:
    return sorted(
        (_score(identity, collection) for collection in collections if collection.collection_id),
        key=lambda item: (-item.score, (item.title or "").casefold(), item.collection_id.casefold()),
    )


def _diagnostic(
    identity: FedeoProductIdentity,
    *,
    lookup_status: str,
    confidence: str = NO_MATCH,
    candidates: Iterable[FedeoCandidate] = (),
    reasons: Iterable[str] = (),
) -> FedeoMatch:
    return FedeoMatch(identity.product_id, lookup_status, confidence, False, None, tuple(candidates), tuple(reasons))


def enrich_product(
    identity: FedeoProductIdentity,
    searcher: Callable[..., list[dict[str, Any]]] = search_collections,
    fetcher: Callable[..., dict[str, Any] | None] = get_collection,
) -> FedeoMatch:
    """Select at most one FedEO collection for one immutable identity."""

    reasons: list[str] = []
    exact_collections: list[FedeoCollection] = []
    for collection_id in identity.fedeo_collection_ids:
        try:
            raw = fetcher(collection_id)
        except FedeoServiceError:
            raise
        except (FedeoApiError, TypeError, ValueError) as exc:
            reasons.append(f"Explicit identifier {collection_id!r} could not be normalised: {exc}")
            continue
        if raw is None:
            reasons.append(f"Explicit identifier {collection_id!r} returned no collection; falling back to discovery.")
            continue
        try:
            exact_collections.append(normalise_collection(raw))
        except (TypeError, ValueError) as exc:
            reasons.append(f"Explicit identifier {collection_id!r} returned malformed metadata: {exc}")

    if len(exact_collections) == 1:
        collection = exact_collections[0]
        candidate = FedeoCandidate(collection.collection_id, collection.title, 100, ("explicit identifier",), (), ("Explicit FedEO identifier matched.",))
        return FedeoMatch(identity.product_id, LOOKUP_OK, EXACT_IDENTIFIER, True, collection, (candidate,), tuple(reasons + ["Selected an explicit FedEO identifier."]))
    if len(exact_collections) > 1:
        candidates = tuple(
            FedeoCandidate(item.collection_id, item.title, 100, ("explicit identifier",), (), ("Multiple explicit identifiers resolved.",))
            for item in exact_collections
        )
        return _diagnostic(
            identity, lookup_status=LOOKUP_OK, confidence=POSSIBLE_MATCH, candidates=candidates,
            reasons=(*reasons, "Multiple explicit FedEO identifiers resolved; none was selected."),
        )

    try:
        raw_candidates = searcher(identity.product_name, limit=8, max_pages=1)
    except FedeoServiceError:
        raise
    except (FedeoApiError, TypeError, ValueError) as exc:
        return _diagnostic(
            identity, lookup_status=LOOKUP_MALFORMED,
            reasons=(*reasons, f"FedEO candidate discovery failed for this product: {exc}"),
        )

    collections: list[FedeoCollection] = []
    for raw in raw_candidates:
        try:
            collection = normalise_collection(raw)
        except (TypeError, ValueError) as exc:
            reasons.append(f"Skipped malformed candidate metadata: {exc}")
            continue
        if collection.collection_id:
            collections.append(collection)
    ranked = _rank(identity, collections)
    if not ranked:
        return _diagnostic(
            identity, lookup_status=LOOKUP_OK,
            reasons=(*reasons, "No FedEO collection candidates were returned."),
        )

    best = ranked[0]
    lead = best.score - ranked[1].score if len(ranked) > 1 else best.score
    eligible = best.score >= HIGH_SCORE and lead >= HIGH_MARGIN and len(best.corroborators) >= 2 and not best.conflicts
    strong_title = any("titles are exact" in reason.casefold() or "titles strongly agree" in reason.casefold() for reason in best.reasons)
    if eligible and strong_title:
        try:
            detail = fetcher(best.collection_id)
        except FedeoServiceError:
            raise
        except (FedeoApiError, TypeError, ValueError) as exc:
            return _diagnostic(
                identity, lookup_status=LOOKUP_OK, confidence=POSSIBLE_MATCH, candidates=ranked,
                reasons=(*reasons, f"The leading candidate detail could not be accepted: {exc}"),
            )
        if detail is None:
            return _diagnostic(
                identity, lookup_status=LOOKUP_OK, confidence=POSSIBLE_MATCH, candidates=ranked,
                reasons=(*reasons, "The leading candidate returned 404 on detail retrieval; none was selected."),
            )
        try:
            collection = normalise_collection(detail)
        except (TypeError, ValueError) as exc:
            return _diagnostic(
                identity, lookup_status=LOOKUP_OK, confidence=POSSIBLE_MATCH, candidates=ranked,
                reasons=(*reasons, f"The leading candidate detail was malformed: {exc}"),
            )
        detail_rank = _score(identity, collection)
        detail_eligible = detail_rank.score >= HIGH_SCORE and len(detail_rank.corroborators) >= 2 and not detail_rank.conflicts
        detail_strong_title = any("titles are exact" in reason.casefold() or "titles strongly agree" in reason.casefold() for reason in detail_rank.reasons)
        if detail_eligible and detail_strong_title:
            return FedeoMatch(
                identity.product_id, LOOKUP_OK, HIGH_CONFIDENCE, True, collection,
                tuple([detail_rank, *[item for item in ranked if item.collection_id != detail_rank.collection_id]]),
                tuple((*reasons, f"Unique high-confidence match scored {detail_rank.score} with a {lead}-point discovery lead.")),
            )
        reasons.append("The full collection detail did not retain a high-confidence match; none was selected.")

    possible = best.score >= 35 and not best.conflicts
    confidence = POSSIBLE_MATCH if possible or best.score >= HIGH_SCORE else NO_MATCH
    reasons.append(
        f"Best candidate scored {best.score}; automatic selection requires score {HIGH_SCORE}, "
        f"a {HIGH_MARGIN}-point lead, a strong title, at least two corroborators, and no conflicts."
    )
    return _diagnostic(identity, lookup_status=LOOKUP_OK, confidence=confidence, candidates=ranked, reasons=reasons)


def enrich_products(
    identities: Iterable[FedeoProductIdentity],
    enabled: bool,
    matcher: Callable[[FedeoProductIdentity], FedeoMatch] = enrich_product,
    max_products: int = 12,
) -> FedeoBatch:
    """Enrich a bounded batch, preserving partial results across local failures."""

    items = list(identities)
    if not enabled:
        diagnostics = [
            _diagnostic(item, lookup_status=LOOKUP_NOT_QUERIED, reasons=("FedEO enrichment is disabled.",))
            for item in items
        ]
        return FedeoBatch({}, diagnostics, 0, len(items))
    if max_products < 0:
        raise ValueError("max_products cannot be negative.")

    enrichments: dict[str, FedeoMatch] = {}
    diagnostics: list[FedeoMatch] = []
    queried = 0
    service_error: str | None = None
    limit = min(len(items), max_products)
    for identity in items[:limit]:
        queried += 1
        try:
            match = matcher(identity)
        except FedeoServiceError as exc:
            service_error = str(exc)
            diagnostics.append(
                _diagnostic(identity, lookup_status=LOOKUP_UNAVAILABLE, reasons=("FedEO service became unavailable.",))
            )
            break
        except (FedeoApiError, TypeError, ValueError) as exc:
            match = _diagnostic(
                identity, lookup_status=LOOKUP_MALFORMED,
                reasons=(f"This product lookup failed without stopping the batch: {exc}",),
            )
        diagnostics.append(match)
        if match.selected and match.collection is not None:
            enrichments[identity.product_id] = match

    attempted_before_break = queried
    for identity in items[attempted_before_break:]:
        diagnostics.append(
            _diagnostic(
                identity, lookup_status=LOOKUP_NOT_QUERIED,
                reasons=("Not queried because the batch limit was reached or the FedEO service became unavailable.",),
            )
        )
    return FedeoBatch(enrichments, diagnostics, queried, len(items) - queried, service_error)


def resolve_product_field(
    product: Product,
    collection: FedeoCollection | None,
    product_field: str,
    fedeo_field: str | None = None,
) -> FedeoField | None:
    """Apply explicit field precedence for display without mutating Product.

    Curated CEOS-ARD assessment fields can never be supplied by FedEO. Existing
    curated catalogue values outrank FedEO; FedEO values outrank MIM values for
    non-protected display fields, matching the documented governance order.
    """

    existing = getattr(product, product_field, None)
    existing_present = existing not in (None, "", [], {}, "Unknown")
    source_type = product.source_type.casefold()
    is_curated = source_type == "curated_ceos_ard"
    is_mim = source_type.startswith("mim api")
    if product_field in PROTECTED_PRODUCT_FIELDS:
        if not existing_present:
            return None
        return FedeoField(
            existing, source="curated_ceos_ard", api_path=f"Product.{product_field}",
            basis="curated_product_record", confidence="high",
        )
    if is_curated and existing_present:
        return FedeoField(
            existing, source="existing_catalogue", api_path=f"Product.{product_field}",
            basis="curated_product_record", confidence="high",
        )
    enrichment = collection.field(fedeo_field or product_field) if collection else None
    if enrichment is not None:
        return enrichment
    if existing_present:
        return FedeoField(
            existing, source="mim" if is_mim else "existing_catalogue",
            api_path=f"Product.{product_field}", basis="existing_product_record", confidence="high",
        )
    return None
