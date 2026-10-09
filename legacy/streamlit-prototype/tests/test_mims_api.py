"""Network-free tests for verified MIM mission and product normalisation."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from mims_api import ProductApiInspection, load_product_candidates, normalise_mission, normalise_product


class MimsNormalisationTests(unittest.TestCase):
    def test_verified_mission_schema_fields_are_mapped(self) -> None:
        item = {
            "mission_id": 1518,
            "mission_acronym": "3Cat Constellation",
            "full_name": "3Cat (Cube-cat)",
            "launch_date": "2018-11-29",
            "status": "Operational (nominal)",
            "lead_agency": "UPC",
            "repeat_cycle_days": 7,
            "instrument_types": "Multispectral optical imager",
            "mission_url": "https://example.test/mission",
        }
        product = normalise_mission(item, requested_family="All product families", source_url="https://example.test/api/missions")
        self.assertIsNotNone(product)
        assert product is not None
        self.assertEqual(product.id, "mim:1518")
        self.assertEqual(product.mission_name, "3Cat Constellation")
        self.assertEqual(product.provider, "UPC")
        self.assertEqual(product.launch_or_start_year, 2018)
        self.assertEqual(product.revisit_days, 7)
        self.assertEqual(product.operational_status, "Operational (nominal)")
        self.assertEqual(product.sensor_or_instrument_type, "Multispectral optical imager")
        self.assertEqual(product.source_url, "https://example.test/mission")

    def test_explicit_product_name_resolution_remains_product_level(self) -> None:
        item = {
            "product_id": 158,
            "product_name": "Catalyst SPOT 5 HRG 2.5m",
            "category": "Optical",
            "type": "Surface Reflectance",
            "instruments": [{"instrument_id": 183, "instrument_name": "HRG", "product_status": "CEOS-ARD"}],
            "certifications": [{"scheme": "CEOS-ARD", "spec_version": "v5.0.1", "approval_date": "2024-12-04"}],
        }
        instruments = {183: {"instrument_id": 183, "name_short": "HRG", "operator": "Catalyst", "spatial_resolution_best": 5}}

        product = normalise_product(item, instruments, source_url="https://example.test/api/products")

        self.assertIsNotNone(product)
        assert product is not None
        self.assertEqual(product.spatial_resolution_m, 2.5)
        self.assertEqual(product.instrument_spatial_resolution_best_m, 5)
        self.assertIn("API product name", product.spatial_resolution_basis)
        self.assertTrue(product.ceos_ard_verified)

    def test_instrument_resolution_is_display_only_fallback(self) -> None:
        item = {
            "product_id": 106,
            "product_name": "DESIS L2A",
            "category": "Optical",
            "type": "Surface Reflectance",
            "instruments": [{"instrument_id": 1734, "instrument_name": "DESIS", "product_status": "CEOS-ARD"}],
            "certifications": [{"scheme": "CEOS-ARD", "approval_date": "2025-02-12"}],
        }
        instruments = {
            1734: {
                "instrument_id": 1734,
                "name_short": "DESIS",
                "operator": "DLR",
                "spatial_resolution_best": 79,
                "spatial_resolution_description": "79 m instrument value",
            }
        }

        product = normalise_product(item, instruments, source_url="https://example.test/api/products")

        self.assertIsNotNone(product)
        assert product is not None
        self.assertIsNone(product.spatial_resolution_m)
        self.assertIsNone(product.spatial_resolution_display)
        self.assertEqual(product.instrument_spatial_resolution_best_m, 79)
        self.assertIn("79 m", product.instrument_spatial_resolution_display or "")
        self.assertIn("not used for product matching", product.notes or "")

    @patch("mims_api._request_json")
    @patch("mims_api._session")
    @patch("mims_api.inspect_product_api")
    def test_product_loader_uses_one_bulk_instrument_request(self, inspect_api, session, request_json) -> None:
        inspect_api.return_value = (
            {},
            ProductApiInspection(
                schema_url="https://example.test/api/openapi.json",
                product_path="/products",
                instrument_path="/instruments",
            ),
        )
        request_json.side_effect = [
            {
                "products": [
                    {
                        "product_id": 1,
                        "product_name": "Example product",
                        "type": "Surface Reflectance",
                        "instruments": [{"instrument_id": 9, "instrument_name": "EX", "product_status": "Under Development"}],
                    }
                ]
            },
            {"instruments": [{"instrument_id": 9, "name_short": "EX", "spatial_resolution_best": 20}]},
        ]

        products, inspection = load_product_candidates()

        self.assertEqual(len(products), 1)
        self.assertEqual(inspection.instrument_path, "/instruments")
        self.assertEqual(request_json.call_count, 2)
        requested_urls = [call.args[1] for call in request_json.call_args_list]
        self.assertEqual(requested_urls, ["https://eo-explorer-demo.diamondsky.au/api/products", "https://eo-explorer-demo.diamondsky.au/api/instruments"])


if __name__ == "__main__":
    unittest.main()
