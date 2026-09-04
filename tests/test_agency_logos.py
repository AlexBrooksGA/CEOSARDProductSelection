"""Coverage checks for locally vendored agency identity assets."""

from __future__ import annotations

import unittest

from catalogue import load_products
from components import agency_logo_data_uri, agency_mark_html
from models import Product


class AgencyLogoTests(unittest.TestCase):
    def test_every_bundled_product_agency_has_a_local_identity_asset(self) -> None:
        missing: set[str] = set()
        for product in load_products():
            agency = product.agency or product.provider
            if not agency_logo_data_uri(agency):
                missing.add(agency or "Agency not reported")
        self.assertEqual(missing, set())

    def test_api_products_do_not_show_bundled_agency_marks(self) -> None:
        product = Product(
            id="api-record",
            product_name="API record",
            agency="ESA",
            source_type="MIM API product",
        )
        self.assertEqual(agency_mark_html(product, product.agency), "")


if __name__ == "__main__":
    unittest.main()
