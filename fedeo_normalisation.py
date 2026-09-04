"""Tolerant, provenance-preserving normalisation of FedEO collections.

The normalised representation is intentionally separate from :class:`Product`.
FedEO is optional display enrichment and must not silently become authoritative
catalogue or CEOS-ARD assessment data.
"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
import re
from typing import Any, Iterable
from urllib.parse import urlparse


@dataclass(frozen=True, slots=True)
class FedeoField:
    """One normalised value and the exact FedEO evidence used for it."""

    value: Any
    source: str = "fedeo"
    api_path: str = ""
    basis: str = "collection_metadata"
    confidence: str = "high"


@dataclass(frozen=True, slots=True)
class FedeoCollection:
    """A stable view over a provider-dependent FedEO collection response."""

    collection_id: str
    title: str | None
    fields: dict[str, FedeoField]
    raw_response: dict[str, Any]

    def field(self, name: str) -> FedeoField | None:
        return self.fields.get(name)

    def value(self, name: str, default: Any = None) -> Any:
        item = self.field(name)
        return item.value if item is not None else default


@dataclass(frozen=True, slots=True)
class _Found:
    value: Any
    path: str


Path = tuple[str, ...]


def _key(mapping: dict[str, Any], wanted: str) -> str | None:
    if wanted in mapping:
        return wanted
    folded = wanted.casefold()
    return next((key for key in mapping if isinstance(key, str) and key.casefold() == folded), None)


def _find(mapping: dict[str, Any], paths: Iterable[Path]) -> _Found | None:
    """Return the first non-empty ordered alias, matching each key by case."""

    for path in paths:
        current: Any = mapping
        actual: list[str] = []
        for part in path:
            if not isinstance(current, dict) or (matched := _key(current, part)) is None:
                break
            current = current[matched]
            actual.append(matched)
        else:
            if current not in (None, "", [], {}):
                return _Found(current, ".".join(actual))
    return None


def _as_list(value: Any) -> list[Any]:
    if value in (None, ""):
        return []
    if isinstance(value, (list, tuple, set)):
        return [item for item in value if item not in (None, "")]
    return [value]


def _strings(value: Any) -> list[str]:
    result: list[str] = []
    for item in _as_list(value):
        if isinstance(item, (str, int, float)) and not isinstance(item, bool):
            text = str(item).strip()
            if text and text.casefold() not in {existing.casefold() for existing in result}:
                result.append(text)
    return result


def _numbers(value: Any) -> list[float]:
    result: list[float] = []
    candidates: list[Any] = []
    for item in _as_list(value):
        if isinstance(item, dict):
            for alias in ("minimum", "min", "maximum", "max"):
                if (matched := _key(item, alias)) is not None:
                    candidates.extend(_as_list(item[matched]))
        else:
            candidates.append(item)
    for item in candidates:
        if isinstance(item, (int, float)) and not isinstance(item, bool):
            number = float(item)
        elif isinstance(item, str) and re.fullmatch(r"\s*\d+(?:\.\d+)?\s*", item):
            number = float(item)
        else:
            continue
        if number >= 0 and number not in result:
            result.append(number)
    return sorted(result)


def _safe_url(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    value = value.strip()
    parsed = urlparse(value)
    return value if parsed.scheme in {"http", "https"} and parsed.netloc else None


def _add(
    fields: dict[str, FedeoField],
    name: str,
    value: Any,
    path: str,
    *,
    basis: str = "collection_metadata",
    confidence: str = "high",
) -> None:
    if value not in (None, "", [], {}):
        fields[name] = FedeoField(value, api_path=path, basis=basis, confidence=confidence)


def _copy_dicts(value: Any) -> list[dict[str, Any]]:
    return [deepcopy(item) for item in _as_list(value) if isinstance(item, dict)]


def _providers(found: _Found | None) -> tuple[list[dict[str, Any]], list[str]]:
    if found is None:
        return [], []
    providers: list[dict[str, Any]] = []
    agencies: list[str] = []
    for item in _as_list(found.value):
        if isinstance(item, str):
            name, roles, url = item.strip(), [], None
        elif isinstance(item, dict):
            name_found = _find(item, (("name",), ("organisationName",), ("organizationName",), ("title",)))
            if name_found is None:
                continue
            name = str(name_found.value).strip()
            roles_found = _find(item, (("roles",), ("role",)))
            roles = [role.casefold() for role in _strings(roles_found.value if roles_found else None)]
            url_found = _find(item, (("url",), ("href",)))
            url = _safe_url(url_found.value) if url_found else None
        else:
            continue
        if not name:
            continue
        provider: dict[str, Any] = {"name": name, "roles": roles}
        if url:
            provider["url"] = url
        providers.append(provider)
        is_host_only = bool(roles) and set(roles) <= {"host"}
        is_fedeo = name.casefold() in {"fedeo", "fedeo clearinghouse"}
        useful_role = not roles or bool(set(roles) & {"producer", "processor", "licensor", "provider"})
        if not is_host_only and not is_fedeo and useful_role and name.casefold() not in {x.casefold() for x in agencies}:
            agencies.append(name)
    return providers, agencies


def _spatial_extent(value: Any) -> list[list[float]]:
    boxes = value if isinstance(value, list) else []
    if boxes and all(isinstance(item, (int, float)) and not isinstance(item, bool) for item in boxes):
        boxes = [boxes]
    result: list[list[float]] = []
    for box in boxes:
        if not isinstance(box, list) or len(box) not in {4, 6}:
            continue
        if not all(isinstance(item, (int, float)) and not isinstance(item, bool) for item in box):
            continue
        result.append([float(item) for item in box])
    return result


def _temporal_extent(value: Any) -> list[list[str | None]]:
    intervals: Any = value
    if not isinstance(intervals, list):
        return []
    if len(intervals) == 2 and not any(isinstance(item, list) for item in intervals):
        intervals = [intervals]
    result: list[list[str | None]] = []
    for interval in intervals:
        if not isinstance(interval, list) or len(interval) != 2:
            continue
        start = str(interval[0]).strip() if interval[0] not in (None, "") else None
        end = str(interval[1]).strip() if interval[1] not in (None, "") else None
        if start is not None or end is not None:
            result.append([start, end])
    return result


def _friendly_format(media_type: str) -> str:
    lowered = media_type.casefold()
    if "tiff" in lowered and ("cloud-optimized" in lowered or "cloud optimized" in lowered or "cog" in lowered):
        return "Cloud Optimized GeoTIFF"
    if "tiff" in lowered and "geotiff" in lowered:
        return "GeoTIFF"
    return media_type


def _asset_fields(raw: dict[str, Any]) -> dict[str, tuple[list[Any], list[str]]]:
    """Extract only explicitly described asset facts, retaining exact paths."""

    collected: dict[str, tuple[list[Any], list[str]]] = {
        name: ([], [])
        for name in (
            "data_formats", "raster_data_types", "coordinate_reference_systems", "bands",
            "data_urls", "search_urls", "documentation_urls", "metadata_urls",
            "thumbnail_urls", "quicklook_urls",
        )
    }

    def append(name: str, value: Any, path: str) -> None:
        values, paths = collected[name]
        comparable = repr(value).casefold()
        if comparable not in {repr(existing).casefold() for existing in values}:
            values.append(deepcopy(value))
            paths.append(path)

    for container_name in ("assets", "item_assets"):
        found = _find(raw, ((container_name,), ("properties", container_name)))
        if found is None or not isinstance(found.value, dict):
            continue
        for asset_key, asset in found.value.items():
            if not isinstance(asset, dict):
                continue
            prefix = f"{found.path}.{asset_key}"
            roles_found = _find(asset, (("roles",), ("role",)))
            roles = {role.casefold() for role in _strings(roles_found.value if roles_found else None)}
            title_found = _find(asset, (("title",),))
            descriptor = f"{asset_key} {title_found.value if title_found else ''}".casefold()
            type_found = _find(asset, (("type",), ("media_type",), ("mediaType",)))
            is_metadata = "metadata" in roles or "metadata" in descriptor
            is_visual = bool(roles & {"thumbnail", "overview", "quicklook"}) or any(
                token in descriptor for token in ("thumbnail", "quicklook", "overview")
            )
            is_data = not is_visual and ("data" in roles or container_name == "item_assets" or any(
                token in descriptor for token in ("data", "download", "enclosure", "cog", "geotiff")
            ))
            if type_found and isinstance(type_found.value, str) and is_data and not is_metadata:
                append("data_formats", _friendly_format(type_found.value.strip()), f"{prefix}.{type_found.path}")

            href_found = _find(asset, (("href",), ("url",)))
            url = _safe_url(href_found.value) if href_found else None
            if url:
                url_path = f"{prefix}.{href_found.path}"
                if "thumbnail" in roles or "thumbnail" in descriptor or "overview" in roles:
                    append("thumbnail_urls", url, url_path)
                if "quicklook" in roles or "quicklook" in descriptor:
                    append("quicklook_urls", url, url_path)
                if "search" in roles or "search" in descriptor:
                    append("search_urls", url, url_path)
                if is_metadata:
                    append("metadata_urls", url, url_path)
                if "documentation" in roles or any(token in descriptor for token in ("documentation", "manual", "guide")):
                    append("documentation_urls", url, url_path)
                if is_data and not is_metadata:
                    append("data_urls", url, url_path)

            raster_found = _find(asset, (("raster:bands",), ("raster_bands",), ("bands",)))
            if raster_found:
                for index, band in enumerate(_as_list(raster_found.value)):
                    if not isinstance(band, dict):
                        continue
                    dtype = _find(band, (("data_type",), ("dataType",), ("dtype",)))
                    if dtype and isinstance(dtype.value, str):
                        append("raster_data_types", dtype.value.strip(), f"{prefix}.{raster_found.path}[{index}].{dtype.path}")
            epsg = _find(asset, (("proj:code",), ("proj:epsg",), ("epsg",), ("crs",)))
            if epsg:
                for value in _as_list(epsg.value):
                    if isinstance(value, int) and not isinstance(value, bool):
                        value = f"EPSG:{value}"
                    if isinstance(value, str) and value.strip():
                        append("coordinate_reference_systems", value.strip(), f"{prefix}.{epsg.path}")
            eo_bands = _find(asset, (("eo:bands",), ("bands",)))
            if eo_bands:
                for band in _copy_dicts(eo_bands.value):
                    append("bands", band, f"{prefix}.{eo_bands.path}")

    links_found = _find(raw, (("links",), ("properties", "links")))
    if links_found:
        for index, link in enumerate(_as_list(links_found.value)):
            if not isinstance(link, dict):
                continue
            href = _find(link, (("href",), ("url",)))
            url = _safe_url(href.value) if href else None
            if not url:
                continue
            rel_found = _find(link, (("rel",), ("relation",)))
            rel = str(rel_found.value).casefold() if rel_found else ""
            title_found = _find(link, (("title",),))
            title = str(title_found.value).casefold() if title_found else ""
            path = f"{links_found.path}[{index}].{href.path}"
            if rel == "self" and not collected.get("record_url", ([], []))[0]:
                collected["record_url"] = ([url], [path])
            if rel in {"search", "items"}:
                append("search_urls", url, path)
            if rel in {"describedby", "described-by", "documentation"}:
                append("documentation_urls", url, path)
            if rel in {"cite-as", "license"}:
                append("documentation_urls", url, path)
            if "thumbnail" in rel or "thumbnail" in title or "overview" in rel:
                append("thumbnail_urls", url, path)
            if "quicklook" in rel or "quicklook" in title:
                append("quicklook_urls", url, path)
            if rel == "alternate" and "metadata" in title:
                append("metadata_urls", url, path)
    return collected


def normalise_collection(raw: dict[str, Any]) -> FedeoCollection:
    """Normalise a FedEO collection without assuming a uniform provider schema."""

    if not isinstance(raw, dict):
        raise TypeError("FedEO collection metadata must be a JSON object.")
    fields: dict[str, FedeoField] = {}

    identifier = _find(raw, (("id",), ("identifier",), ("collection_id",), ("properties", "identifier")))
    collection_id = str(identifier.value).strip() if identifier else ""
    title_found = _find(raw, (("title",), ("properties", "title"), ("name",), ("properties", "name")))
    title = str(title_found.value).strip() if title_found else None

    scalar_aliases: dict[str, tuple[Path, ...]] = {
        "description": (("description",), ("properties", "description"), ("abstract",), ("properties", "abstract")),
        "product_version": (("version",), ("summaries", "version"), ("properties", "version"), ("product_version",), ("productVersion",)),
        "doi": (("sci:doi",), ("doi",), ("properties", "sci:doi"), ("properties", "doi")),
        "citation": (("sci:citation",), ("citation",), ("properties", "sci:citation"), ("properties", "citation")),
        "licence": (("license",), ("licence",), ("properties", "license"), ("properties", "licence")),
        "metadata_created": (("created",), ("properties", "created"), ("creationDate",), ("properties", "creationDate")),
        "metadata_updated": (("updated",), ("properties", "updated"), ("modificationDate",), ("properties", "modificationDate")),
    }
    for name, aliases in scalar_aliases.items():
        if found := _find(raw, aliases):
            if isinstance(found.value, (str, int, float)) and not isinstance(found.value, bool):
                _add(fields, name, str(found.value).strip(), found.path)

    list_aliases: dict[str, tuple[Path, ...]] = {
        "product_type": (("summaries", "product:type"), ("summaries", "product_type"), ("properties", "product:type"), ("properties", "product_type"), ("productType",)),
        "platforms": (("summaries", "platform"), ("summaries", "platforms"), ("properties", "platform"), ("properties", "platforms"), ("platform",), ("platforms",)),
        "instruments": (("summaries", "instruments"), ("summaries", "instrument"), ("properties", "instruments"), ("properties", "instrument"), ("instruments",), ("instrument",)),
        "constellation": (("summaries", "constellation"), ("properties", "constellation"), ("constellation",)),
        "processing_levels": (("summaries", "processing:level"), ("summaries", "processing_level"), ("properties", "processing:level"), ("properties", "processing_level"), ("processingLevel",), ("processing_level",)),
        "use_limitations": (("useLimitation",), ("use_limitations",), ("properties", "useLimitation"), ("properties", "use_limitations"), ("otherConstraint",), ("properties", "otherConstraint")),
        "sar_frequency_bands": (("summaries", "sar:frequency_band"), ("summaries", "sar_frequency_band"), ("properties", "sar:frequency_band"), ("sar:frequency_band",), ("sar_frequency_band",), ("frequency_band",)),
        "sar_polarisations": (("summaries", "sar:polarizations"), ("summaries", "sar:polarisations"), ("summaries", "sar:polarisation"), ("properties", "sar:polarizations"), ("properties", "sar:polarisations"), ("sar:polarizations",), ("sar:polarisations",), ("sar_polarisations",), ("polarizations",), ("polarisations",)),
        "instrument_modes": (("summaries", "sar:instrument_mode"), ("summaries", "instrument_mode"), ("properties", "sar:instrument_mode"), ("sar:instrument_mode",), ("instrument_mode",), ("instrumentMode",)),
    }
    for name, aliases in list_aliases.items():
        if found := _find(raw, aliases):
            _add(fields, name, _strings(found.value), found.path)

    provider_found = _find(raw, (("providers",), ("properties", "providers"), ("provider",), ("properties", "provider")))
    providers, agencies = _providers(provider_found)
    if provider_found:
        _add(fields, "providers", providers, provider_found.path)
        _add(
            fields, "agency", agencies, provider_found.path,
            basis="derived_from_collection_metadata", confidence="medium",
        )

    spatial = _find(raw, (("extent", "spatial", "bbox"), ("properties", "extent", "spatial", "bbox"), ("bbox",)))
    if spatial:
        _add(fields, "spatial_extent", _spatial_extent(spatial.value), spatial.path)
    temporal = _find(raw, (("extent", "temporal", "interval"), ("properties", "extent", "temporal", "interval"), ("temporal", "interval")))
    intervals = _temporal_extent(temporal.value) if temporal else []
    if not intervals:
        start = _find(raw, (("start_datetime",), ("properties", "start_datetime"), ("startDate",), ("properties", "startDate")))
        end = _find(raw, (("end_datetime",), ("properties", "end_datetime"), ("endDate",), ("properties", "endDate")))
        if start or end:
            intervals = [[str(start.value) if start else None, str(end.value) if end else None]]
            temporal = _Found(intervals, "/".join(filter(None, [start.path if start else "", end.path if end else ""])))
    if temporal:
        _add(fields, "temporal_extent", intervals, temporal.path)

    gsd = _find(raw, (("summaries", "gsd"), ("properties", "gsd"), ("gsd",), ("ground_sample_distance",), ("spatial_resolution",)))
    if gsd:
        _add(fields, "ground_sample_distance_m", _numbers(gsd.value), gsd.path)

    explicit_formats = _find(raw, (("summaries", "file:format"), ("properties", "file:format"), ("data_formats",), ("format",)))
    if explicit_formats:
        _add(fields, "data_formats", _strings(explicit_formats.value), explicit_formats.path)

    explicit_crs = _find(raw, (("summaries", "proj:code"), ("summaries", "proj:epsg"), ("properties", "proj:code"), ("properties", "proj:epsg"), ("coordinate_reference_system",)))
    if explicit_crs:
        crs_values = [
            f"EPSG:{value}" if isinstance(value, int) and not isinstance(value, bool) else str(value)
            for value in _as_list(explicit_crs.value)
            if not isinstance(value, bool)
        ]
        _add(fields, "coordinate_reference_systems", crs_values, explicit_crs.path)

    explicit_bands = _find(raw, (("summaries", "eo:bands"), ("summaries", "bands"), ("properties", "eo:bands"), ("eo:bands",), ("bands",)))
    if explicit_bands:
        band_values = [deepcopy(item) for item in _as_list(explicit_bands.value) if isinstance(item, (dict, str))]
        _add(fields, "bands", band_values, explicit_bands.path)

    explicit_raster = _find(raw, (("summaries", "raster:bands"), ("properties", "raster:bands"), ("raster:bands",)))
    if explicit_raster:
        raster_types: list[str] = []
        for band in _as_list(explicit_raster.value):
            if not isinstance(band, dict):
                continue
            dtype = _find(band, (("data_type",), ("dataType",), ("dtype",)))
            if dtype and isinstance(dtype.value, str) and dtype.value.strip() not in raster_types:
                raster_types.append(dtype.value.strip())
        _add(fields, "raster_data_types", raster_types, explicit_raster.path)

    assets = _asset_fields(raw)
    for name, (values, paths) in assets.items():
        if not values:
            continue
        if name == "record_url":
            _add(fields, name, values[0], paths[0])
            continue
        combined = list(fields[name].value) if name in fields and isinstance(fields[name].value, list) else []
        for value in values:
            if repr(value).casefold() not in {repr(existing).casefold() for existing in combined}:
                combined.append(value)
        _add(fields, name, combined, ", ".join(paths))

    raster_types = [str(value).strip() for value in fields.get("raster_data_types", FedeoField([])).value]
    storage_bits = sorted({int(match.group(2)) for value in raster_types if (match := re.fullmatch(r"(u?int|float)(8|16|32|64)", value.casefold()))})
    if storage_bits:
        source_field = fields["raster_data_types"]
        _add(
            fields, "output_storage_bit_depth", storage_bits, source_field.api_path,
            basis="derived_from_raster_data_type", confidence="high",
        )

    return FedeoCollection(collection_id, title, fields, deepcopy(raw))
