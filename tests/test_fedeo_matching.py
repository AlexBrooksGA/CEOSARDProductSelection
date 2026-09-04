"""Conservative, network-free FedEO product matching and precedence tests."""

from __future__ import annotations

from copy import deepcopy
import unittest
from unittest.mock import Mock

from fedeo_api import FedeoServiceError
from fedeo_matching import (
    EXACT_IDENTIFIER,
    HIGH_CONFIDENCE,
    LOOKUP_NOT_QUERIED,
    LOOKUP_OK,
    LOOKUP_UNAVAILABLE,
    NO_MATCH,
    POSSIBLE_MATCH,
    FedeoMatch,
    FedeoProductIdentity,
    enrich_product,
    enrich_products,
    identity_from_product,
    resolve_product_field,
)
from fedeo_normalisation import normalise_collection
from models import Product


def sentinel_collection(identifier: str = "S2_L2A-1", *, provider: str = "ESA/ESRIN") -> dict:
    return {
        "id": identifier,
        "title": "Sentinel-2 - Level-2A - Cloud Optimized GeoTIFF",
        "providers": [
            {"name": provider, "roles": ["producer"]},
            {"name": "FedEO", "roles": ["host"]},
        ],
        "summaries": {
            "platform": ["Sentinel-2"],
            "instruments": ["MSI"],
            "product:type": ["Surface Reflectance"],
        },
        "links": [{"rel": "self", "href": f"https://fedeo.ceos.org/collections/{identifier}"}],
    }


def sentinel_identity(**changes) -> FedeoProductIdentity:
    values = {
        "product_id": "sentinel2-level2a",
        "product_name": "Sentinel-2 Level-2A",
        "missions": ("Sentinel-2A", "Sentinel-2B"),
        "instruments": ("MSI",),
        "providers": ("ESA",),
        "product_family": "Surface Reflectance",
    }
    values.update(changes)
    return FedeoProductIdentity(**values)


class FedeoMatchingTests(unittest.TestCase):
    def test_explicit_fedeo_url_is_the_only_exact_identifier_path(self) -> None:
        product = Product(
            id="s2", product_name="Sentinel-2 Level-2A",
            source_url="https://fedeo.ceos.org/collections/S2_L2A-1",
        )
        identity = identity_from_product(product)
        searcher = Mock(side_effect=AssertionError("exact match must not search"))
        fetcher = Mock(return_value=sentinel_collection())

        match = enrich_product(identity, searcher=searcher, fetcher=fetcher)

        self.assertTrue(match.selected)
        self.assertEqual(match.confidence, EXACT_IDENTIFIER)
        self.assertEqual(match.collection.collection_id, "S2_L2A-1")  # type: ignore[union-attr]
        searcher.assert_not_called()
        fetcher.assert_called_once_with("S2_L2A-1")

    def test_unique_strong_title_with_three_corroborators_is_selected(self) -> None:
        identity = sentinel_identity()
        searcher = Mock(return_value=[sentinel_collection()])
        fetcher = Mock(return_value=sentinel_collection())

        match = enrich_product(identity, searcher=searcher, fetcher=fetcher)

        self.assertTrue(match.selected)
        self.assertEqual(match.lookup_status, LOOKUP_OK)
        self.assertEqual(match.confidence, HIGH_CONFIDENCE)
        self.assertGreaterEqual(match.candidates[0].score, 80)
        self.assertGreaterEqual(len(match.candidates[0].corroborators), 2)

    def test_no_matching_collection_is_controlled(self) -> None:
        other = {
            "id": "unrelated",
            "title": "Ocean altimetry archive",
            "providers": [{"name": "Other", "roles": ["producer"]}],
            "summaries": {"platform": ["Jason-3"], "instruments": ["Poseidon-3B"]},
        }
        match = enrich_product(sentinel_identity(), searcher=Mock(return_value=[other]), fetcher=Mock())

        self.assertFalse(match.selected)
        self.assertEqual(match.confidence, NO_MATCH)

    def test_multiple_equally_strong_candidates_remain_possible(self) -> None:
        candidates = [sentinel_collection("s2-a"), sentinel_collection("s2-b")]
        fetcher = Mock(side_effect=AssertionError("ambiguous candidates must not be fetched"))

        match = enrich_product(sentinel_identity(), searcher=Mock(return_value=candidates), fetcher=fetcher)

        self.assertFalse(match.selected)
        self.assertEqual(match.confidence, POSSIBLE_MATCH)
        self.assertEqual(len(match.candidates), 2)
        fetcher.assert_not_called()

    def test_explicit_provider_conflict_vetoes_automatic_selection(self) -> None:
        conflict = sentinel_collection(provider="Unrelated Provider")

        match = enrich_product(sentinel_identity(), searcher=Mock(return_value=[conflict]), fetcher=Mock())

        self.assertFalse(match.selected)
        self.assertIn("provider", match.candidates[0].conflicts)

    def test_conflicting_static_variant_does_not_block_unique_main_product(self) -> None:
        identity = FedeoProductIdentity(
            product_id="opera", product_name="OPERA RTC Sentinel-1",
            missions=("Sentinel-1A", "Sentinel-1B"), instruments=("C-SAR",),
            providers=("NASA/JPL",), product_family="Synthetic Aperture Radar",
        )
        common = {
            "providers": [{"name": "NASA/JPL", "roles": ["producer"]}],
            "summaries": {
                "platform": ["Sentinel-1"], "instruments": ["C-SAR"],
                "product:type": ["SAR backscatter RTC"],
            },
        }
        main = {"id": "main", "title": "OPERA RTC Sentinel-1", **common}
        static = {"id": "static", "title": "OPERA RTC Sentinel-1 Static Layers", **common}
        fetcher = Mock(return_value=main)

        match = enrich_product(identity, searcher=Mock(return_value=[static, main]), fetcher=fetcher)

        self.assertTrue(match.selected)
        self.assertEqual(match.collection.collection_id, "main")  # type: ignore[union-attr]
        static_diagnostic = next(item for item in match.candidates if item.collection_id == "static")
        self.assertIn("product variant", static_diagnostic.conflicts)
        self.assertGreaterEqual(match.candidates[0].score - static_diagnostic.score, 15)

    def test_doi_is_strong_evidence_but_not_an_exact_match(self) -> None:
        candidate = {
            "id": "shared-doi",
            "title": "Different Landsat product",
            "sci:doi": "10.5066/P960F8OC",
        }
        identity = sentinel_identity(dois=("10.5066/P960F8OC",))

        match = enrich_product(identity, searcher=Mock(return_value=[candidate]), fetcher=Mock())

        self.assertFalse(match.selected)
        self.assertNotEqual(match.confidence, EXACT_IDENTIFIER)

    def test_404_detail_downgrades_high_candidate_without_merging(self) -> None:
        match = enrich_product(
            sentinel_identity(), searcher=Mock(return_value=[sentinel_collection()]), fetcher=Mock(return_value=None)
        )

        self.assertFalse(match.selected)
        self.assertEqual(match.confidence, POSSIBLE_MATCH)
        self.assertIsNone(match.collection)

    def test_disabled_batch_calls_nothing(self) -> None:
        matcher = Mock(side_effect=AssertionError("disabled batch must not query"))
        identities = [sentinel_identity(), sentinel_identity(product_id="second")]

        batch = enrich_products(identities, False, matcher=matcher)

        self.assertEqual(batch.queried, 0)
        self.assertEqual(batch.unprocessed, 2)
        self.assertEqual(batch.enrichments, {})
        self.assertTrue(all(item.lookup_status == LOOKUP_NOT_QUERIED for item in batch.diagnostics))
        matcher.assert_not_called()

    def test_service_timeout_breaks_batch_and_preserves_partial_result(self) -> None:
        collection = normalise_collection(sentinel_collection())
        selected = FedeoMatch("first", LOOKUP_OK, HIGH_CONFIDENCE, True, collection)
        matcher = Mock(side_effect=[selected, FedeoServiceError("timeout")])
        identities = [
            sentinel_identity(product_id="first"),
            sentinel_identity(product_id="second"),
            sentinel_identity(product_id="third"),
        ]

        batch = enrich_products(identities, True, matcher=matcher, max_products=12)

        self.assertEqual(set(batch.enrichments), {"first"})
        self.assertEqual(batch.queried, 2)
        self.assertEqual(batch.unprocessed, 1)
        self.assertEqual(batch.service_error, "timeout")
        self.assertEqual(batch.match_for("second").lookup_status, LOOKUP_UNAVAILABLE)  # type: ignore[union-attr]
        self.assertEqual(batch.match_for("third").lookup_status, LOOKUP_NOT_QUERIED)  # type: ignore[union-attr]

    def test_batch_limit_marks_remaining_products_not_queried(self) -> None:
        matcher = Mock(
            side_effect=lambda item: FedeoMatch(item.product_id, LOOKUP_OK, NO_MATCH, False, None)
        )
        identities = [sentinel_identity(product_id=str(index)) for index in range(3)]

        batch = enrich_products(identities, True, matcher=matcher, max_products=1)

        self.assertEqual(batch.queried, 1)
        self.assertEqual(batch.unprocessed, 2)
        self.assertEqual(matcher.call_count, 1)

    def test_sidecar_does_not_mutate_product_and_protected_fields_never_fall_back(self) -> None:
        product = Product(
            id="curated", product_name="Curated", source_type="curated_ceos_ard",
            ceos_ard_status="CEOS-ARD assessed", ceos_ard_verified=True,
            data_format="GeoTIFF", radiometric_bit_depth=None,
        )
        before = deepcopy(product)
        collection = normalise_collection(
            {
                "id": "candidate", "title": "Curated",
                "ceos_ard_status": "Untrusted replacement",
                "item_assets": {"data": {"roles": ["data"], "type": "image/tiff; application=geotiff; profile=cloud-optimized", "raster:bands": [{"data_type": "uint16"}]}},
            }
        )

        status = resolve_product_field(product, collection, "ceos_ard_status")
        data_format = resolve_product_field(product, collection, "data_format", "data_formats")
        bit_depth = resolve_product_field(product, collection, "radiometric_bit_depth", "output_storage_bit_depth")

        self.assertEqual(product, before)
        self.assertEqual(status.value, "CEOS-ARD assessed")  # type: ignore[union-attr]
        self.assertEqual(status.source, "curated_ceos_ard")  # type: ignore[union-attr]
        self.assertEqual(data_format.value, "GeoTIFF")  # type: ignore[union-attr]
        self.assertIsNone(bit_depth)

    def test_fedeo_precedes_mim_for_non_protected_display_field(self) -> None:
        product = Product(
            id="mim", product_name="MIM", source_type="MIM API product", data_format="MIM format"
        )
        collection = normalise_collection(
            {"id": "fedeo", "title": "MIM", "format": "FedEO format"}
        )

        resolved = resolve_product_field(product, collection, "data_format", "data_formats")

        self.assertEqual(resolved.value, ["FedEO format"])  # type: ignore[union-attr]
        self.assertEqual(resolved.source, "fedeo")  # type: ignore[union-attr]


if __name__ == "__main__":
    unittest.main()
