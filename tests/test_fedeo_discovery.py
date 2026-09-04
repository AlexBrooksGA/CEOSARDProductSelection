"""Tests for conservative, non-Product FedEO collection discovery."""

from __future__ import annotations

import unittest
from unittest.mock import Mock

from fedeo_discovery import (
    FedeoDiscoverySearch,
    classify_discoveries,
    derive_discovery_query,
    search_and_normalise,
)
from fedeo_matching import FedeoProductIdentity
from fedeo_normalisation import normalise_collection


def raw_collection(
    collection_id: str,
    title: str,
    *,
    platform: str | None = None,
    instrument: str | None = None,
    provider: str | None = None,
    processing_level: str | None = None,
) -> dict:
    summaries: dict[str, list[str]] = {}
    if platform:
        summaries["platform"] = [platform]
    if instrument:
        summaries["instruments"] = [instrument]
    if processing_level:
        summaries["processing:level"] = [processing_level]
    raw = {
        "type": "Collection",
        "id": collection_id,
        "title": title,
        "description": f"Metadata for {title}",
        "links": [{"rel": "self", "href": f"https://fedeo.ceos.org/collections/{collection_id}"}],
    }
    if summaries:
        raw["summaries"] = summaries
    if provider:
        raw["providers"] = [{"name": provider, "roles": ["producer"]}]
    return raw


def identity(**overrides) -> FedeoProductIdentity:
    values = {
        "product_id": "known-s2-l2a",
        "product_name": "Sentinel-2 Level-2A Surface Reflectance",
        "missions": ("Sentinel-2",),
        "instruments": ("MSI",),
        "providers": ("ESA",),
        "product_family": "Surface Reflectance",
        "processing_terms": ("Level-2A",),
    }
    values.update(overrides)
    return FedeoProductIdentity(**values)


class FedeoDiscoveryTests(unittest.TestCase):
    def test_query_uses_specific_family(self) -> None:
        self.assertEqual(
            derive_discovery_query("Synthetic Aperture Radar", ["Surface Reflectance"], "Sentinel-1"),
            "SAR backscatter",
        )

    def test_all_families_prefers_search_then_profile_fallback(self) -> None:
        self.assertEqual(
            derive_discovery_query("All product families", ["Surface Reflectance"], "  Landsat   Collection 2 "),
            "Landsat Collection 2",
        )
        self.assertEqual(
            derive_discovery_query("All product families", ["Surface Temperature", "Surface Reflectance"]),
            "land surface temperature",
        )
        self.assertIsNone(derive_discovery_query("All product families", []))

    def test_empty_query_makes_no_api_call(self) -> None:
        searcher = Mock()
        result = search_and_normalise("  ", searcher=searcher)
        searcher.assert_not_called()
        self.assertEqual(result.collections, ())

    def test_search_is_one_page_bounded_and_preserves_raw(self) -> None:
        raw = raw_collection("new-collection", "New Surface Reflectance")
        searcher = Mock(return_value=[raw, {"title": "missing id"}, "malformed"])
        result = search_and_normalise("surface reflectance", searcher=searcher)
        searcher.assert_called_once_with("surface reflectance", limit=20, max_pages=1)
        self.assertEqual(len(result.collections), 1)
        self.assertEqual(result.malformed_count, 2)
        self.assertEqual(result.collections[0].raw_response, raw)

    def test_exact_accepted_or_explicit_identifiers_are_withheld(self) -> None:
        collection = normalise_collection(raw_collection("known-fed-id", "A collection"))
        result = FedeoDiscoverySearch("surface reflectance", (collection,))
        accepted = classify_discoveries(result, (), accepted_collection_ids=("KNOWN-FED-ID",))
        explicit = classify_discoveries(
            result,
            (identity(fedeo_collection_ids=("known-fed-id",)),),
        )
        self.assertEqual(accepted.additional_count, 0)
        self.assertEqual(explicit.additional_count, 0)
        self.assertEqual(accepted.overlaps_removed, 1)

    def test_high_confidence_metadata_overlap_is_withheld(self) -> None:
        collection = normalise_collection(
            raw_collection(
                "s2-l2a-fed",
                "Sentinel-2 Level-2A Surface Reflectance",
                platform="Sentinel-2",
                instrument="MSI",
                provider="ESA",
                processing_level="L2A",
            )
        )
        batch = classify_discoveries(FedeoDiscoverySearch("surface reflectance", (collection,)), (identity(),))
        self.assertEqual(batch.additional_count, 0)
        self.assertEqual(batch.overlaps_removed, 1)

    def test_exact_title_sparse_metadata_is_possible_overlap_and_withheld(self) -> None:
        collection = normalise_collection(
            raw_collection("sparse-s2", "Sentinel-2 Level-2A Surface Reflectance")
        )
        batch = classify_discoveries(FedeoDiscoverySearch("surface reflectance", (collection,)), (identity(),))
        self.assertEqual(batch.additional_count, 0)
        self.assertEqual(batch.overlaps_removed, 1)

    def test_material_variant_conflict_remains_a_separate_candidate(self) -> None:
        known = identity(
            product_id="opera-rtc",
            product_name="OPERA Sentinel-1 Radiometric Terrain Corrected",
            missions=("Sentinel-1",),
            instruments=("C-SAR",),
            providers=("NASA",),
            product_family="Synthetic Aperture Radar",
            processing_terms=("RTC",),
        )
        collection = normalise_collection(
            raw_collection(
                "opera-static",
                "OPERA Sentinel-1 Radiometric Terrain Corrected Static Layers",
                platform="Sentinel-1",
                instrument="C-SAR",
                provider="NASA",
            )
        )
        batch = classify_discoveries(FedeoDiscoverySearch("SAR backscatter", (collection,)), (known,))
        self.assertEqual(batch.additional_count, 1)
        self.assertIn("product variant", batch.records[0].closest_known.conflicts)

    def test_deduplicates_only_identical_ids_and_limits_visible_records(self) -> None:
        collections = tuple(
            normalise_collection(raw_collection(f"new-{index}", f"Novel Collection {index}"))
            for index in range(10)
        )
        result = FedeoDiscoverySearch("surface reflectance", (*collections, collections[0]))
        batch = classify_discoveries(result, (), visible_limit=8)
        self.assertEqual(batch.additional_count, 10)
        self.assertEqual(len(batch.records), 8)
        self.assertEqual(batch.hidden_count, 2)
        self.assertEqual(batch.duplicate_ids_removed, 1)

    def test_specific_family_search_context_is_applied_locally(self) -> None:
        landsat = normalise_collection(raw_collection("landsat-new", "Landsat Surface Reflectance"))
        sentinel = normalise_collection(raw_collection("sentinel-new", "Sentinel Surface Reflectance"))
        batch = classify_discoveries(
            FedeoDiscoverySearch("surface reflectance", (landsat, sentinel)),
            (),
            context_text="Landsat",
        )
        self.assertEqual([item.collection.collection_id for item in batch.records], ["landsat-new"])
        self.assertEqual(batch.context_removed, 1)


if __name__ == "__main__":
    unittest.main()
