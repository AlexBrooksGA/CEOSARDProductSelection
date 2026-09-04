"""Streamlit regression coverage for the optional FedEO sidecar."""

from __future__ import annotations

from dataclasses import replace
import os
import re
import unittest
from unittest.mock import patch

from streamlit.testing.v1 import AppTest

from fedeo_discovery import FedeoDiscoverySearch
from fedeo_matching import FedeoBatch, FedeoMatch
from fedeo_normalisation import FedeoCollection, FedeoField


TOGGLE_LABEL = "Enable FedEO collection metadata (experimental)"
DISCOVERY_LABEL = "Show additional FedEO collections"
VISIBLE_PRODUCT_ID = "earthdaily-constellation"


def rendered_product_titles(app: AppTest) -> list[str]:
    return sorted(
        match.group(1)
        for item in app.markdown
        if (match := re.search(r'<div class="product-title">([^<]+)</div>', item.value))
    )


def selected_match() -> FedeoMatch:
    collection = FedeoCollection(
        collection_id="TEST.EARTHDAILY.L2A",
        title="EarthDaily test collection",
        fields={
            "description": FedeoField("Collection-level metadata used only by this test.", api_path="description"),
            "processing_levels": FedeoField(["L2A"], api_path="summaries.processing:level"),
            "temporal_extent": FedeoField([["2024-01-01T00:00:00Z", None]], api_path="extent.temporal.interval"),
            "data_formats": FedeoField(["Cloud Optimized GeoTIFF"], api_path="assets.data.type"),
            "raster_data_types": FedeoField(["uint16"], api_path="summaries.raster:bands"),
            "output_storage_bit_depth": FedeoField(
                [16], api_path="summaries.raster:bands", basis="derived_from_raster_data_type"
            ),
            "licence": FedeoField("CC-BY-4.0", api_path="license"),
            "record_url": FedeoField("https://fedeo.example.test/collections/TEST.EARTHDAILY.L2A", api_path="links[0].href"),
        },
        raw_response={"id": "TEST.EARTHDAILY.L2A"},
    )
    return FedeoMatch(
        product_id=VISIBLE_PRODUCT_ID,
        lookup_status="ok",
        confidence="high_confidence_metadata",
        selected=True,
        collection=collection,
        reasons=("Test-only high-confidence match.",),
    )


class FedeoAppTests(unittest.TestCase):
    def test_toggle_is_available_default_off_and_makes_no_lookup(self) -> None:
        with patch("fedeo_matching.enrich_products") as enrich_products, patch(
            "fedeo_discovery.search_and_normalise"
        ) as discover:
            app = AppTest.from_file("app.py", default_timeout=30).run()

        self.assertFalse(app.exception)
        toggle = next(item for item in app.sidebar.checkbox if item.label == TOGGLE_LABEL)
        self.assertFalse(toggle.value)
        enrich_products.assert_not_called()
        discover.assert_not_called()
        self.assertFalse(any(item.label == DISCOVERY_LABEL for item in app.sidebar.checkbox))
        self.assertFalse(any(item.label == "FedEO collection metadata" for item in app.expander))

    def test_config_gate_hides_toggle_and_makes_no_lookup(self) -> None:
        with patch.dict(os.environ, {"ENABLE_FEDEO_INTEGRATION": "false"}), patch(
            "fedeo_matching.enrich_products"
        ) as enrich_products, patch("fedeo_discovery.search_and_normalise") as discover:
            app = AppTest.from_file("app.py", default_timeout=30).run()

        self.assertFalse(app.exception)
        self.assertFalse(any(item.label == TOGGLE_LABEL for item in app.sidebar.checkbox))
        enrich_products.assert_not_called()
        discover.assert_not_called()

    def test_enabled_empty_sidecar_does_not_change_filtered_product_cards(self) -> None:
        with patch("fedeo_matching.enrich_products") as disabled_lookup:
            disabled = AppTest.from_file("app.py", default_timeout=30).run()
        disabled_lookup.assert_not_called()

        empty_batch = FedeoBatch(enrichments={}, diagnostics=[], queried=0, unprocessed=0)
        with patch("fedeo_matching.enrich_products", return_value=empty_batch):
            enabled = AppTest.from_file("app.py", default_timeout=30)
            enabled.session_state["enable_fedeo"] = True
            enabled.session_state["discover_fedeo"] = False
            enabled.run()

        self.assertFalse(disabled.exception)
        self.assertFalse(enabled.exception)
        self.assertEqual(rendered_product_titles(disabled), rendered_product_titles(enabled))

    def test_enabled_selected_match_renders_separate_collection_metadata(self) -> None:
        match = selected_match()
        batch = FedeoBatch(
            enrichments={VISIBLE_PRODUCT_ID: match},
            diagnostics=[match],
            queried=8,
            unprocessed=0,
        )
        with patch("fedeo_matching.enrich_products", return_value=batch) as enrich_products:
            app = AppTest.from_file("app.py", default_timeout=30)
            app.session_state["enable_fedeo"] = True
            app.session_state["discover_fedeo"] = False
            app.run()

        self.assertFalse(app.exception)
        enrich_products.assert_called_once()
        self.assertTrue(any(item.label == "FedEO collection metadata" for item in app.expander))
        markdown = "\n".join(item.value for item in app.markdown)
        self.assertIn("TEST.EARTHDAILY.L2A", markdown)
        self.assertIn("Collection-level metadata used only by this test", markdown)
        self.assertIn("16-bit output storage", markdown)
        self.assertIn("Curated CEOS-ARD record", markdown)
        self.assertTrue(any("1 metadata match" in item.value for item in app.sidebar.caption))

    def test_enabled_runtime_failure_is_isolated(self) -> None:
        with patch("fedeo_matching.enrich_products", side_effect=RuntimeError("test outage")):
            app = AppTest.from_file("app.py", default_timeout=30)
            app.session_state["enable_fedeo"] = True
            app.run()

        self.assertFalse(app.exception)
        self.assertFalse(any(item.label == "FedEO collection metadata" for item in app.expander))
        self.assertTrue(any("service unavailable" in item.value for item in app.sidebar.caption))
        self.assertTrue(any("Curated CEOS-ARD record" in item.value for item in app.markdown))

    def test_possible_match_is_diagnostic_only(self) -> None:
        possible = replace(selected_match(), confidence="possible_match", selected=False)
        batch = FedeoBatch(enrichments={}, diagnostics=[possible], queried=1, unprocessed=0)
        with patch("fedeo_matching.enrich_products", return_value=batch):
            app = AppTest.from_file("app.py", default_timeout=30)
            app.session_state["enable_fedeo"] = True
            app.session_state["discover_fedeo"] = False
            app.run()

        self.assertFalse(app.exception)
        self.assertFalse(any(item.label == "FedEO collection metadata" for item in app.expander))
        self.assertTrue(any("1 possible (not attached)" in item.value for item in app.sidebar.caption))

    def test_unprocessed_records_are_not_double_counted_as_no_match(self) -> None:
        possible = replace(selected_match(), confidence="possible_match", selected=False)
        unprocessed = replace(
            selected_match(),
            product_id="not-queried",
            lookup_status="not_queried",
            confidence="no_match",
            selected=False,
            collection=None,
        )
        batch = FedeoBatch(
            enrichments={},
            diagnostics=[possible, unprocessed, replace(unprocessed, product_id="also-not-queried")],
            queried=1,
            unprocessed=2,
        )
        with patch("fedeo_matching.enrich_products", return_value=batch):
            app = AppTest.from_file("app.py", default_timeout=30)
            app.session_state["enable_fedeo"] = True
            app.session_state["discover_fedeo"] = False
            app.run()

        self.assertFalse(app.exception)
        status = "\n".join(item.value for item in app.sidebar.caption)
        self.assertIn("0 metadata match · 1 possible (not attached) · 0 no metadata match · 2 unprocessed", status)

    def test_discovery_renders_separately_without_changing_product_cards(self) -> None:
        disabled = AppTest.from_file("app.py", default_timeout=30)
        disabled.session_state["advanced_search"] = "novel-fedeo-test"
        disabled.run()
        baseline_titles = rendered_product_titles(disabled)
        collection = FedeoCollection(
            collection_id="TEST.NOVEL.COLLECTION",
            title="Novel FedEO Test Collection",
            fields={
                "description": FedeoField("A returned discovery candidate.", api_path="description"),
                "record_url": FedeoField(
                    "https://fedeo.example.test/collections/TEST.NOVEL.COLLECTION",
                    api_path="links[0].href",
                ),
            },
            raw_response={"id": "TEST.NOVEL.COLLECTION"},
        )
        search = FedeoDiscoverySearch("novel-fedeo-test", (collection,))
        empty_batch = FedeoBatch(enrichments={}, diagnostics=[], queried=0, unprocessed=0)
        with patch("fedeo_matching.enrich_products", return_value=empty_batch), patch(
            "fedeo_discovery.search_and_normalise", return_value=search
        ) as discover:
            app = AppTest.from_file("app.py", default_timeout=30)
            app.session_state["enable_fedeo"] = True
            app.session_state["advanced_search"] = "novel-fedeo-test"
            app.run()

        self.assertFalse(app.exception)
        discover.assert_called_once()
        self.assertTrue(any(item.label == DISCOVERY_LABEL and item.value for item in app.sidebar.checkbox))
        self.assertTrue(any(item.label == "Additional FedEO collections · 1" for item in app.expander))
        markdown = "\n".join(item.value for item in app.markdown)
        self.assertIn("Novel FedEO Test Collection", markdown)
        self.assertTrue(any("not added to the CEOS-ARD product catalogue" in item.value for item in app.caption))
        self.assertEqual(rendered_product_titles(app), baseline_titles)

    def test_discovery_opt_out_makes_no_collection_search(self) -> None:
        empty_batch = FedeoBatch(enrichments={}, diagnostics=[], queried=0, unprocessed=0)
        with patch("fedeo_matching.enrich_products", return_value=empty_batch), patch(
            "fedeo_discovery.search_and_normalise"
        ) as discover:
            app = AppTest.from_file("app.py", default_timeout=30)
            app.session_state["enable_fedeo"] = True
            app.session_state["discover_fedeo"] = False
            app.run()

        self.assertFalse(app.exception)
        discover.assert_not_called()
        self.assertFalse(any(item.label.startswith("Additional FedEO collections") for item in app.expander))

    def test_discovery_failure_is_isolated_from_existing_cards(self) -> None:
        empty_batch = FedeoBatch(enrichments={}, diagnostics=[], queried=0, unprocessed=0)
        with patch("fedeo_matching.enrich_products", return_value=empty_batch), patch(
            "fedeo_discovery.search_and_normalise", side_effect=RuntimeError("discovery outage")
        ):
            app = AppTest.from_file("app.py", default_timeout=30)
            app.session_state["enable_fedeo"] = True
            app.run()

        self.assertFalse(app.exception)
        self.assertTrue(any("discovery unavailable" in item.value for item in app.sidebar.caption))
        self.assertTrue(any("Curated CEOS-ARD record" in item.value for item in app.markdown))
        self.assertFalse(any(item.label.startswith("Additional FedEO collections") for item in app.expander))


if __name__ == "__main__":
    unittest.main()
