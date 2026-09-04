"""Streamlit regression coverage for loaded MIM product visibility."""

from __future__ import annotations

import unittest

from streamlit.testing.v1 import AppTest

from models import Product


class MimsTileTests(unittest.TestCase):
    def test_loaded_products_render_with_limited_instrument_fallback_tiles(self) -> None:
        products = [
            Product(
                id=f"mim-product:qa-{index}",
                product_name=f"QA MIM Product {index:02d}",
                mission_name="Not reported by MIM product endpoint",
                family="Optical",
                product_family="Surface Reflectance",
                provider="QA Agency",
                source_type="MIM API product",
                ceos_ard_status="Status unknown",
                ceos_ard_verified=False,
                instrument_spatial_resolution_best_m=10,
                instrument_spatial_resolution_display="10 m (QA instrument)",
                instrument_resolution_note="Instrument-level value; display fallback only.",
            )
            for index in range(30)
        ]
        app = AppTest.from_file("app.py", default_timeout=30).run()
        app.session_state["include_mim"] = True
        app.session_state["api_loaded"] = True
        app.session_state["api_status"] = "MIM API loaded"
        app.session_state["api_products"] = products
        app.session_state["ceos_filter"] = "All statuses"
        app.session_state["show_unknown"] = True
        app.session_state["show_near_matches"] = True
        app.session_state["mim_display_limit"] = "24"

        app.run()

        self.assertFalse(app.exception)
        rendered_titles = [item.value for item in app.markdown if "QA MIM Product" in item.value]
        self.assertEqual(len(rendered_titles), 24)
        self.assertTrue(any(item.label == "MIM data product tile limit" for item in app.selectbox))
        self.assertTrue(any("24 data product tile(s) displayed from 30" in item.value for item in app.caption))
        self.assertTrue(any("Finest reported instrument spatial resolution" in item.value for item in app.markdown))
        self.assertTrue(any("not used for product matching" in item.value for item in app.markdown))

        mim_add = next(item for item in app.button if item.key == "compare_add_mim-product:qa-0")
        mim_add.click().run()
        self.assertFalse(app.exception)
        self.assertIn("mim-product:qa-0", app.session_state["comparison_ids"])


if __name__ == "__main__":
    unittest.main()
