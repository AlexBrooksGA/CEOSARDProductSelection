"""Optional Streamlit rendering for selected FedEO collection matches.

This module deliberately renders a FedEO sidecar.  It never changes the
application's Product model or the values used by filtering and matching.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

import streamlit as st


_HIGH_CONFIDENCE = {
    "exact",
    "exact_id",
    "exact_identifier",
    "exact_identifier_match",
    "high",
    "high_confidence",
    "high_confidence_metadata",
    "high_confidence_metadata_match",
}


def _enum_value(value: object) -> object:
    """Return an enum-like value without coupling the UI to matching types."""
    return getattr(value, "value", value)


def _confidence_key(value: object) -> str:
    return str(_enum_value(value) or "").strip().casefold().replace("-", "_").replace(" ", "_")


def _display(value: object) -> str | None:
    """Compact heterogeneous normalised values for human-readable display."""
    value = _enum_value(value)
    if value is None or value == "" or value == [] or value == {}:
        return None
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, Mapping):
        parts = [f"{key}: {rendered}" for key, item in value.items() if (rendered := _display(item))]
        return "; ".join(parts) or None
    if isinstance(value, Iterable) and not isinstance(value, (str, bytes)):
        parts = [rendered for item in value if (rendered := _display(item))]
        return ", ".join(parts) or None
    return str(value).strip() or None


def _value(collection: object, *names: str) -> object:
    getter = getattr(collection, "value", None)
    if callable(getter):
        for name in names:
            try:
                value = getter(name)
            except (KeyError, TypeError, ValueError):
                continue
            if _display(value):
                return value
    for name in names:
        value = getattr(collection, name, None)
        if _display(value):
            return value
    return None


def _temporal_display(collection: object) -> str | None:
    intervals = _value(collection, "temporal_coverage", "temporal_extent")
    if isinstance(intervals, list) and intervals and isinstance(intervals[0], list):
        rendered_intervals: list[str] = []
        for interval in intervals:
            start = _display(interval[0]) if interval else None
            end = _display(interval[1]) if len(interval) > 1 else None
            if start and end:
                rendered_intervals.append(f"{start} to {end}")
            elif start:
                rendered_intervals.append(f"From {start} (open-ended)")
            elif end:
                rendered_intervals.append(f"Through {end}")
        if rendered_intervals:
            return "; ".join(rendered_intervals)
    direct = _display(intervals)
    if direct:
        return direct
    start = _display(_value(collection, "temporal_start", "start_datetime"))
    end = _display(_value(collection, "temporal_end", "end_datetime"))
    if start and end:
        return f"{start} to {end}"
    if start:
        return f"From {start} (open-ended)"
    if end:
        return f"Through {end}"
    return None


def _output_storage_display(collection: object) -> str | None:
    value = _value(collection, "output_storage_bit_depth")
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return f"{value:g}-bit output storage"
    if isinstance(value, Iterable) and not isinstance(value, (str, bytes, Mapping)):
        bits = [f"{item:g}" for item in value if isinstance(item, (int, float)) and not isinstance(item, bool)]
        if bits:
            return f"{' / '.join(bits)}-bit output storage"
    return _display(value)


def _distance_display(collection: object) -> str | None:
    value = _value(collection, "ground_sample_distance_m", "ground_sample_distance", "gsd")
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return f"{value:g} m"
    if isinstance(value, Iterable) and not isinstance(value, (str, bytes, Mapping)):
        distances = [f"{item:g} m" for item in value if isinstance(item, (int, float)) and not isinstance(item, bool)]
        if distances:
            return ", ".join(distances)
    return _display(value)


def _first_url(value: object) -> str | None:
    value = _enum_value(value)
    if isinstance(value, Mapping):
        for candidate in value.values():
            if url := _first_url(candidate):
                return url
        return None
    if isinstance(value, Iterable) and not isinstance(value, (str, bytes)):
        for candidate in value:
            if url := _first_url(candidate):
                return url
        return None
    rendered = _display(value)
    if rendered and rendered.startswith(("http://", "https://")):
        return rendered
    return None


def _is_selected_high_confidence(match: object | None) -> bool:
    if match is None or getattr(match, "selected", False) is not True:
        return False
    return _confidence_key(getattr(match, "confidence", None)) in _HIGH_CONFIDENCE


def render_fedeo_metadata(match: object | None) -> None:
    """Render one authoritative-looking section only for an accepted match.

    Possible or rejected candidates intentionally produce no UI.  Their details
    remain available to the integration diagnostics rather than being presented
    as metadata about the product.
    """
    if not _is_selected_high_confidence(match):
        return
    collection = getattr(match, "collection", None)
    if collection is None:
        return

    confidence_key = _confidence_key(getattr(match, "confidence", None))
    confidence = {
        "exact_identifier": "Exact identifier",
        "exact_identifier_match": "Exact identifier",
        "high_confidence_metadata": "High-confidence metadata match",
        "high_confidence_metadata_match": "High-confidence metadata match",
    }.get(confidence_key, "High confidence")
    collection_id = _display(_value(collection, "collection_id", "id"))
    rows = [
        ("FedEO collection identifier", collection_id),
        ("Title", _display(_value(collection, "title", "product_title"))),
        ("Description", _display(_value(collection, "description"))),
        ("Provider / agency", _display(_value(collection, "providers", "provider", "agency"))),
        ("Mission / platform", _display(_value(collection, "platforms", "platform", "mission"))),
        ("Instrument", _display(_value(collection, "instruments", "instrument"))),
        ("Constellation", _display(_value(collection, "constellation"))),
        ("Processing level", _display(_value(collection, "processing_levels", "processing_level"))),
        ("Spatial coverage", _display(_value(collection, "spatial_extent"))),
        ("Temporal availability", _temporal_display(collection)),
        ("Ground sample distance", _distance_display(collection)),
        ("Product type", _display(_value(collection, "product_type"))),
        ("Product version", _display(_value(collection, "product_version"))),
        ("Data format", _display(_value(collection, "data_formats", "data_format"))),
        ("Raster data type", _display(_value(collection, "raster_data_types"))),
        ("Output storage bit depth", _output_storage_display(collection)),
        ("Coordinate reference system", _display(_value(collection, "coordinate_reference_systems"))),
        ("Bands", _display(_value(collection, "bands"))),
        ("SAR frequency band", _display(_value(collection, "sar_frequency_bands"))),
        ("SAR polarisation", _display(_value(collection, "sar_polarisations"))),
        ("Instrument mode", _display(_value(collection, "instrument_modes"))),
        ("Licence", _display(_value(collection, "licence", "license"))),
        ("Use limitations", _display(_value(collection, "use_limitations"))),
        ("DOI", _display(_value(collection, "doi"))),
        ("Citation", _display(_value(collection, "citation"))),
        ("Metadata created", _display(_value(collection, "metadata_created", "created"))),
        ("Metadata updated", _display(_value(collection, "metadata_updated", "updated"))),
    ]
    rows = [(label, value) for label, value in rows if value]
    links = [
        ("FedEO collection", _first_url(_value(collection, "record_url", "collection_url"))),
        ("Data access", _first_url(_value(collection, "data_urls", "access_urls", "access_url"))),
        ("Search", _first_url(_value(collection, "search_urls", "search_url"))),
        ("Documentation", _first_url(_value(collection, "documentation_urls", "documentation_url"))),
        ("Metadata", _first_url(_value(collection, "metadata_urls", "metadata_url"))),
        ("Thumbnail", _first_url(_value(collection, "thumbnail_urls", "thumbnail_url"))),
        ("Quicklook", _first_url(_value(collection, "quicklook_urls", "quicklook_url"))),
    ]
    links = [(label, url) for label, url in links if url]
    if not rows and not links:
        return

    with st.expander("FedEO collection metadata", expanded=False):
        st.markdown(f"`FedEO` · Collection metadata · **Metadata match confidence:** {confidence}")
        for label, value in rows:
            st.markdown(f"**{label}:** {value}")
        for label, url in links:
            st.link_button(f"{label} \N{NORTH EAST ARROW}", url, use_container_width=True)
        st.caption("FedEO supplements this record with collection metadata. Curated CEOS-ARD assessment information remains authoritative.")


def render_fedeo_discoveries(batch: object | None) -> None:
    """Render discovery candidates separately from authoritative product cards."""

    records = list(getattr(batch, "records", ()) or ())
    if not records:
        return
    query = _display(getattr(batch, "query", None)) or "the selected context"
    additional_count = int(getattr(batch, "additional_count", len(records)) or len(records))
    hidden_count = int(getattr(batch, "hidden_count", 0) or 0)
    with st.expander(f"Additional FedEO collections · {additional_count}", expanded=False):
        st.warning(
            f'Returned by FedEO for “{query}”. No reliable overlap with the currently known catalogue records '
            "was identified in the returned metadata. This does not establish that a collection is globally new or "
            "a CEOS-ARD assessed product. Application suitability requires a separate review."
        )
        for record in records:
            collection = getattr(record, "collection", None)
            if collection is None:
                continue
            title = _display(_value(collection, "title", "product_title")) or "Untitled FedEO collection"
            collection_id = _display(_value(collection, "collection_id", "id"))
            description = _display(_value(collection, "description"))
            if description and len(description) > 500:
                description = description[:497].rstrip() + "…"
            with st.container(border=True):
                st.markdown(f"#### {title}")
                st.caption("FedEO collection candidate · not added to the CEOS-ARD product catalogue")
                rows = [
                    ("Collection identifier", collection_id),
                    ("Description", description),
                    ("Provider / agency", _display(_value(collection, "providers", "agency"))),
                    ("Mission / platform", _display(_value(collection, "platforms", "constellation"))),
                    ("Instrument", _display(_value(collection, "instruments"))),
                    ("Processing level", _display(_value(collection, "processing_levels"))),
                    ("Temporal availability", _temporal_display(collection)),
                    ("Data format", _display(_value(collection, "data_formats"))),
                    ("Licence", _display(_value(collection, "licence", "license"))),
                    ("DOI", _display(_value(collection, "doi"))),
                ]
                for label, value in rows:
                    if value:
                        st.markdown(f"**{label}:** {value}")
                record_url = _first_url(_value(collection, "record_url", "collection_url"))
                if record_url:
                    st.link_button("Open FedEO collection \N{NORTH EAST ARROW}", record_url)
        if hidden_count:
            st.caption(f"{hidden_count} more returned collection candidate(s) are not displayed in this bounded view.")
