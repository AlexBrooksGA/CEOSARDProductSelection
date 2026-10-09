"""Schema-driven adapter for the authenticated CEOS MIM service.

The service exposes separate mission, instrument, and product collections.
Product records are joined to instruments by stable IDs. Instrument resolution
can be shown as a labelled display fallback, but is never silently treated as
product-level resolution for matching.
"""

from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import urljoin

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from models import Product


LOGGER = logging.getLogger(__name__)
DEFAULT_BASE_URL = "https://eo-explorer-demo.diamondsky.au/api"

FAMILY_KEYWORDS = {
    "Surface Reflectance": ("surface reflectance", "optical", "multispectral", "land imaging"),
    "Surface Temperature": ("surface temperature", "thermal", "infrared"),
    "Synthetic Aperture Radar": ("synthetic aperture radar", "sar", "radar"),
    "Aquatic Reflectance": ("aquatic", "ocean colour", "ocean color", "water reflectance"),
    "Night-time Lights": ("night-time light", "nighttime light", "low light imaging"),
}


class MimsApiError(RuntimeError):
    """A safe user-facing MIM service error with no credentials or raw payloads."""


@dataclass(slots=True)
class OpenApiInspection:
    schema_url: str
    mission_path: str
    mission_parameters: list[str]


@dataclass(slots=True)
class ProductApiInspection:
    schema_url: str
    product_path: str
    instrument_path: str


def credentials_configured() -> bool:
    return bool(os.getenv("MIMS_API_USERNAME") and os.getenv("MIMS_API_PASSWORD"))


def _session() -> requests.Session:
    username = os.getenv("MIMS_API_USERNAME")
    password = os.getenv("MIMS_API_PASSWORD")
    if not username or not password:
        raise MimsApiError("MIM API credentials are not configured.")
    session = requests.Session()
    session.auth = (username, password)
    retry = Retry(total=2, connect=2, read=2, backoff_factor=0.4, status_forcelist=(429, 502, 503, 504))
    session.mount("https://", HTTPAdapter(max_retries=retry))
    return session


def _request_json(session: requests.Session, url: str, *, params: dict[str, Any] | None = None) -> Any:
    try:
        response = session.get(url, params=params, timeout=(5, 25))
    except requests.Timeout as exc:
        raise MimsApiError("The MIM service timed out.") from exc
    except requests.RequestException as exc:
        raise MimsApiError("The MIM service is currently unavailable.") from exc
    if response.status_code in {401, 403}:
        raise MimsApiError("MIM API authentication failed.")
    if not response.ok:
        raise MimsApiError(f"The MIM service returned HTTP {response.status_code}.")
    try:
        return response.json()
    except ValueError as exc:
        raise MimsApiError("The MIM service returned an unexpected response.") from exc


def inspect_openapi() -> tuple[dict[str, Any], OpenApiInspection]:
    """Authenticate to Swagger UI, read its declared OpenAPI URL, and locate missions.

    Endpoint names are selected from the authenticated schema's path, tags,
    operationId, and summary. No mission endpoint is hard-coded.
    """
    base_url = os.getenv("MIMS_API_BASE_URL", DEFAULT_BASE_URL).rstrip("/") + "/"
    docs_url = urljoin(base_url, "docs/")
    session = _session()
    try:
        response = session.get(docs_url, timeout=(5, 25))
    except requests.RequestException as exc:
        raise MimsApiError("The MIM API documentation is currently unavailable.") from exc
    if response.status_code in {401, 403}:
        raise MimsApiError("MIM API authentication failed.")
    if not response.ok:
        raise MimsApiError(f"The MIM API documentation returned HTTP {response.status_code}.")

    match = re.search(r"(?:url|spec-url)\s*[:=]\s*['\"]([^'\"]+)", response.text, re.IGNORECASE)
    if not match:
        raise MimsApiError("The authenticated documentation did not declare an OpenAPI schema URL.")
    schema_url = urljoin(docs_url, match.group(1))
    schema = _request_json(session, schema_url)
    if not isinstance(schema, dict) or not isinstance(schema.get("paths"), dict):
        raise MimsApiError("The MIM OpenAPI schema has an unexpected structure.")

    candidates: list[tuple[int, str, dict[str, Any]]] = []
    for path, methods in schema["paths"].items():
        if not isinstance(methods, dict) or not isinstance(methods.get("get"), dict):
            continue
        operation = methods["get"]
        text = " ".join([path, str(operation.get("operationId", "")), str(operation.get("summary", "")), " ".join(operation.get("tags", []))]).casefold()
        score = 3 if re.search(r"\bmissions?\b", text) else 0
        if re.search(r"\b(instruments?|measurements?)\b", text):
            score -= 2
        if score > 0:
            candidates.append((score, path, operation))
    if not candidates:
        raise MimsApiError("No mission collection endpoint was identified in the authenticated schema.")
    candidates.sort(key=lambda item: (-item[0], len(item[1]), item[1]))
    _, mission_path, operation = candidates[0]
    parameter_names = [str(item.get("name")) for item in operation.get("parameters", []) if isinstance(item, dict) and item.get("name")]
    return schema, OpenApiInspection(schema_url, mission_path, parameter_names)


def _extract_items(payload: Any) -> tuple[list[dict[str, Any]], str | None]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)], None
    if not isinstance(payload, dict):
        raise MimsApiError("The MIM mission response has an unexpected structure.")
    for key in ("items", "results", "data", "missions"):
        value = payload.get(key)
        if isinstance(value, list):
            next_url = payload.get("next")
            if isinstance(payload.get("links"), dict):
                next_url = payload["links"].get("next", next_url)
            return [item for item in value if isinstance(item, dict)], next_url if isinstance(next_url, str) else None
    raise MimsApiError("The MIM mission response did not contain a recognised collection.")


def _first(item: dict[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        if key in item and item[key] not in (None, ""):
            return item[key]
    return None


def _number(value: Any) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    return None


def _year(value: Any) -> int | None:
    """Extract a plausible year from an API number or ISO-like date string."""
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        year = int(value)
    elif isinstance(value, str) and re.match(r"^\d{4}", value):
        year = int(value[:4])
    else:
        return None
    return year if 1900 <= year <= 2200 else None


def _collection_path(schema: dict[str, Any], collection: str) -> str:
    """Locate a top-level collection GET endpoint from the authenticated schema."""
    candidates: list[tuple[int, str]] = []
    singular = collection.removesuffix("s")
    for path, methods in schema.get("paths", {}).items():
        if "{" in path or not isinstance(methods, dict) or not isinstance(methods.get("get"), dict):
            continue
        operation = methods["get"]
        text = " ".join(
            [path, str(operation.get("operationId", "")), str(operation.get("summary", "")), " ".join(operation.get("tags", []))]
        ).casefold()
        score = 4 if path.casefold().rstrip("/").endswith(f"/{collection}") else 0
        if re.search(rf"\b{re.escape(singular)}s?\b", text):
            score += 2
        if score:
            candidates.append((score, path))
    if not candidates:
        raise MimsApiError(f"No {collection} collection endpoint was identified in the authenticated schema.")
    candidates.sort(key=lambda item: (-item[0], len(item[1]), item[1]))
    return candidates[0][1]


def inspect_product_api() -> tuple[dict[str, Any], ProductApiInspection]:
    """Locate the product and instrument collections in the live OpenAPI schema."""
    schema, mission_inspection = inspect_openapi()
    return schema, ProductApiInspection(
        schema_url=mission_inspection.schema_url,
        product_path=_collection_path(schema, "products"),
        instrument_path=_collection_path(schema, "instruments"),
    )


def _server_root(schema: dict[str, Any], schema_url: str) -> str:
    base_url = os.getenv("MIMS_API_BASE_URL", DEFAULT_BASE_URL).rstrip("/") + "/"
    servers = schema.get("servers")
    if isinstance(servers, list) and servers and isinstance(servers[0], dict) and isinstance(servers[0].get("url"), str):
        return urljoin(schema_url, servers[0]["url"]).rstrip("/") + "/"
    return base_url


def _named_collection(payload: Any, key: str) -> list[dict[str, Any]]:
    if not isinstance(payload, dict) or not isinstance(payload.get(key), list):
        raise MimsApiError(f"The MIM {key} response has an unexpected structure.")
    return [item for item in payload[key] if isinstance(item, dict)]


def _product_family(item: dict[str, Any]) -> str:
    raw_type = str(item.get("type") or "")
    category = str(item.get("category") or "")
    text = f"{raw_type} {category} {item.get('product_name') or ''}".casefold()
    if "surface reflectance" in text or "ard/sr" in text:
        return "Surface Reflectance"
    if "aquatic reflectance" in text or "ard/ar" in text:
        return "Aquatic Reflectance"
    if "surface temperature" in text or "thermal" in text:
        return "Surface Temperature"
    if "synthetic aperture radar" in text or "sar" in text or "radar" in text:
        return "Synthetic Aperture Radar"
    if "night-time" in text or "nighttime" in text or "night lights" in text:
        return "Night-time Lights"
    return raw_type or category or "MIM product family unavailable"


def _explicit_product_resolution(item: dict[str, Any]) -> tuple[float | None, str | None, str]:
    """Use only explicit product fields or an explicit metre value in the API name."""
    direct = _number(_first(item, ("product_spatial_resolution_m", "spatial_resolution_m")))
    if direct is not None:
        return direct, f"{direct:g} m", "Explicit product-resolution field from the MIM API"
    name = str(item.get("product_name") or "")
    match = re.search(r"(?<![\d.])(\d+(?:\.\d+)?)\s*m\b", name, re.IGNORECASE)
    if match:
        value = float(match.group(1))
        return value, f"{value:g} m (reported in API product name)", "Explicit metre value reported in the MIM API product name"
    return None, None, "Product-level resolution not reported by the MIM API"


def normalise_product(item: dict[str, Any], instruments_by_id: dict[int, dict[str, Any]], *, source_url: str) -> Product | None:
    """Join one MIM product to its instruments without conflating resolution levels."""
    product_id = _first(item, ("product_id", "id"))
    product_name = _first(item, ("product_name", "name", "title"))
    if product_id is None or product_name is None:
        LOGGER.warning("Skipped MIM product with no stable ID or name")
        return None

    links = [value for value in item.get("instruments", []) if isinstance(value, dict)]
    linked_instruments: list[dict[str, Any]] = []
    instrument_names: list[str] = []
    for link in links:
        instrument_id = link.get("instrument_id")
        detail = instruments_by_id.get(int(instrument_id)) if isinstance(instrument_id, (int, float)) else None
        if detail:
            linked_instruments.append(detail)
        name = link.get("instrument_name") or (detail or {}).get("name_short")
        if name and str(name) not in instrument_names:
            instrument_names.append(str(name))

    operators = sorted({str(value.get("operator")) for value in linked_instruments if value.get("operator")})
    instrument_types = sorted({str(value.get("instrument_types")) for value in linked_instruments if value.get("instrument_types")})
    resolution_details: list[tuple[str, float, str]] = []
    for instrument in linked_instruments:
        value = _number(instrument.get("spatial_resolution_best"))
        if value is None:
            continue
        name = str(instrument.get("name_short") or instrument.get("name_full") or "Linked instrument")
        description = str(instrument.get("spatial_resolution_description") or f"{value:g} m")
        resolution_details.append((name, value, description))
    instrument_best = min((value for _, value, _ in resolution_details), default=None)
    if instrument_best is None:
        instrument_display = None
        instrument_note = "No linked instrument resolution is reported by the MIM API."
    elif len(resolution_details) == 1:
        instrument_display = f"{instrument_best:g} m ({resolution_details[0][0]})"
        instrument_note = f"Instrument-level value: {resolution_details[0][0]} — {resolution_details[0][2]}."
    else:
        instrument_display = f"{instrument_best:g} m best across {len(resolution_details)} linked instruments"
        instrument_note = "Instrument-level values: " + "; ".join(f"{name} — {description}" for name, _, description in resolution_details) + "."

    product_resolution, product_resolution_display, product_resolution_basis = _explicit_product_resolution(item)
    statuses = {str(link.get("product_status")) for link in links if link.get("product_status")}
    certifications = [value for value in item.get("certifications", []) if isinstance(value, dict)]
    ceos_certifications = [value for value in certifications if str(value.get("scheme") or "").casefold() == "ceos-ard"]
    completed = any(value.get("approval_date") or value.get("review_url") for value in ceos_certifications) and "CEOS-ARD" in statuses
    in_progress = any("development" in value.casefold() or "progress" in value.casefold() for value in statuses)
    ceos_status = "CEOS-ARD assessed" if completed else "Assessment in progress" if in_progress else "Status unknown"
    certification = ceos_certifications[0] if ceos_certifications else {}
    access_url = next((str(link["access_url"]) for link in links if link.get("access_url")), None)
    documentation_url = str(item.get("documentation_url") or "") or next(
        (str(link["documentation_url"]) for link in links if link.get("documentation_url")), None
    )
    fallback_note = ""
    if product_resolution is None and instrument_best is not None:
        fallback_note = (
            "Display fallback: the card shows the linked instrument's finest reported spatial resolution because the MIM data "
            "product record does not report product-level resolution. This instrument value is not used for product matching."
        )

    return Product(
        id=f"mim-product:{product_id}",
        product_name=str(product_name),
        official_product_name=str(product_name),
        mission_name="Not reported by MIM product endpoint",
        family=str(item.get("category") or "MIM API products"),
        provider=", ".join(operators) or None,
        agency=", ".join(operators) or None,
        product_family=_product_family(item),
        spatial_resolution_m=product_resolution,
        spatial_resolution_display=product_resolution_display,
        spatial_resolution_basis=product_resolution_basis,
        instrument_spatial_resolution_best_m=instrument_best,
        instrument_spatial_resolution_display=instrument_display,
        instrument_resolution_note=instrument_note,
        sensor_or_instrument_type=", ".join(instrument_types) or None,
        instruments=instrument_names,
        operational_status=", ".join(sorted(statuses)) or None,
        data_format=str(item.get("format") or "") or None,
        ceos_ard_status=ceos_status,
        ceos_ard_verified=completed,
        ceos_ard_pfs=str(item.get("type") or "") or None,
        ceos_ard_assessment_level=", ".join(sorted(statuses)) or None,
        pfs_type=str(item.get("type") or "") or None,
        pfs_version=str(certification.get("spec_version") or "") or None,
        approval_date=str(certification.get("approval_date") or "") or None,
        peer_review_url=str(certification.get("review_url") or "") or None,
        information_url=documentation_url,
        access_url=access_url,
        ceos_ard_record_url=documentation_url,
        source_type="MIM API product",
        source_url=documentation_url or re.sub(r"/products/?$", f"/product/{product_id}", source_url),
        notes=fallback_note or "MIM API product joined to linked instruments by stable instrument ID.",
        raw_source=item,
    )


def load_product_candidates() -> tuple[list[Product], ProductApiInspection]:
    """Load all API products and one bulk instrument collection, then join locally."""
    schema, inspection = inspect_product_api()
    server_root = _server_root(schema, inspection.schema_url)
    product_url = urljoin(server_root, inspection.product_path.lstrip("/"))
    instrument_url = urljoin(server_root, inspection.instrument_path.lstrip("/"))
    session = _session()
    products = _named_collection(_request_json(session, product_url), "products")
    instruments = _named_collection(_request_json(session, instrument_url), "instruments")
    instruments_by_id = {
        int(item["instrument_id"]): item
        for item in instruments
        if isinstance(item.get("instrument_id"), (int, float))
    }
    records = [
        record
        for item in products
        if (record := normalise_product(item, instruments_by_id, source_url=product_url)) is not None
    ]
    return records, inspection


def normalise_coverage(value: Any) -> tuple[str, str | None]:
    """Conservatively map only explicit textual coverage descriptions.

    Swath width is deliberately not used. Unrecognised or structured values are
    retained for display but normalised to Unknown.
    """
    if value is None:
        return "Unknown", None
    display = str(value)
    lowered = display.casefold()
    if "global" in lowered or "worldwide" in lowered:
        return "Global", display
    if "continent" in lowered or "multi-country" in lowered or "multicountry" in lowered:
        return "Continental or multi-country", display
    if "national" in lowered or "country-wide" in lowered:
        return "National", display
    if "regional" in lowered:
        return "Regional", display
    if "local" in lowered or "target" in lowered:
        return "Local or targeted", display
    return "Unknown", display


def _family_from_record(item: dict[str, Any], requested_family: str) -> str | None:
    if requested_family == "All product families":
        return None
    searchable = " ".join(str(value) for value in item.values() if isinstance(value, (str, int, float))).casefold()
    return requested_family if any(keyword in searchable for keyword in FAMILY_KEYWORDS.get(requested_family, ())) else None


def normalise_mission(item: dict[str, Any], *, requested_family: str, source_url: str) -> Product | None:
    """Map only fields present in a MIM mission response into the shared model."""
    stable_id = _first(item, ("mission_id", "id", "missionId", "uuid", "identifier"))
    name = _first(item, ("mission_acronym", "full_name", "name", "mission_name", "missionName", "title"))
    if name is None:
        LOGGER.warning("Skipped MIM mission candidate with no reported name")
        return None
    family = _family_from_record(item, requested_family)
    if requested_family != "All product families" and family is None:
        return None
    provider = _first(item, ("lead_agency", "provider", "organisation", "organization", "agency", "operator"))
    if isinstance(provider, dict):
        provider = _first(provider, ("name", "title", "short_name"))
    year = _year(_first(item, ("launch_date", "launch_year", "launchYear", "start_year", "startYear")))
    coverage, coverage_display = normalise_coverage(_first(item, ("geographic_coverage", "geographicCoverage", "coverage")))
    spatial = _number(_first(item, ("spatial_resolution_m", "spatialResolutionM")))
    revisit = _number(_first(item, ("repeat_cycle_days", "revisit_days", "revisitDays")))
    bit_depth = _first(item, ("radiometric_bit_depth", "radiometricBitDepth"))
    bit_depth = int(bit_depth) if isinstance(bit_depth, (int, float)) else None
    identifier = str(stable_id) if stable_id is not None else re.sub(r"[^a-z0-9]+", "-", str(name).casefold()).strip("-")
    return Product(
        id=f"mim:{identifier}", product_name=f"{name} — MIM candidate", mission_name=str(name),
        family="MIM mission/instrument candidates", provider=str(provider) if provider else None,
        product_family=family or "MIM measurement mapping unavailable", spatial_resolution_m=spatial,
        spatial_resolution_display=f"{spatial:g} m" if spatial is not None else None, revisit_days=revisit,
        revisit_display=f"{revisit:g} days" if revisit is not None else None, radiometric_bit_depth=bit_depth,
        geographic_coverage=coverage, geographic_coverage_display=coverage_display,
        operational_status=str(_first(item, ("status", "operational_status", "operationalStatus")) or "") or None,
        launch_or_start_year=year, sensor_or_instrument_type=str(_first(item, ("instrument_types", "instrument_type", "instrumentType", "sensor_type", "sensorType")) or "") or None,
        ceos_ard_status="Status unknown", ceos_ard_verified=False, source_type="MIM API candidate",
        source_url=str(_first(item, ("mission_url", "eoportal_url", "data_site_url")) or source_url),
        notes="Mission/instrument candidate; not automatically a CEOS-ARD product.", raw_source=item,
    )


def load_mission_candidates(*, requested_family: str = "All product families", start_year: int = 2015, max_pages: int = 20) -> tuple[list[Product], OpenApiInspection]:
    """Load paginated mission candidates after schema discovery, then filter locally."""
    schema, inspection = inspect_openapi()
    base_url = os.getenv("MIMS_API_BASE_URL", DEFAULT_BASE_URL).rstrip("/") + "/"
    server_root = base_url
    servers = schema.get("servers")
    if isinstance(servers, list) and servers and isinstance(servers[0], dict) and isinstance(servers[0].get("url"), str):
        server_root = urljoin(inspection.schema_url, servers[0]["url"]).rstrip("/") + "/"
    url = urljoin(server_root, inspection.mission_path.lstrip("/"))
    session = _session()
    records: list[Product] = []
    pages = 0
    next_url: str | None = url
    offset = 0
    request_params: dict[str, Any] | None = None
    if {"limit", "offset"}.issubset(inspection.mission_parameters):
        request_params = {"limit": 100, "offset": offset}
        if "include_non_eo" in inspection.mission_parameters:
            request_params["include_non_eo"] = False
    while next_url and pages < max_pages:
        payload = _request_json(session, next_url, params=request_params)
        items, discovered_next = _extract_items(payload)
        for item in items:
            candidate = normalise_mission(item, requested_family=requested_family, source_url=url)
            if candidate and (candidate.launch_or_start_year is None or candidate.launch_or_start_year >= start_year):
                records.append(candidate)
        pagination = payload.get("pagination") if isinstance(payload, dict) else None
        if discovered_next:
            next_url = urljoin(next_url, discovered_next)
            request_params = None
        elif isinstance(pagination, dict) and pagination.get("has_more"):
            returned = int(pagination.get("returned") or len(items))
            offset = int(pagination.get("offset") or offset) + returned
            next_url = url
            request_params = {"limit": 100, "offset": offset}
            if "include_non_eo" in inspection.mission_parameters:
                request_params["include_non_eo"] = False
        else:
            next_url = None
        pages += 1
    unique = {record.id: record for record in records}
    return list(unique.values()), inspection
