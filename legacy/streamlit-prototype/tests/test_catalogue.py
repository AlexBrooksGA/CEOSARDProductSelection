"""Integrity tests for the researched offline CEOS-ARD catalogue."""

from __future__ import annotations

import csv
import json
import unittest

from catalogue import DATA_DIR, load_products


class CatalogueTests(unittest.TestCase):
    def test_all_scoped_assessments_load_once(self) -> None:
        products = load_products()
        self.assertEqual(len(products), 26)
        self.assertEqual(len({product.id for product in products}), 26)
        self.assertTrue(all(product.ceos_ard_verified for product in products))

    def test_every_researched_field_has_a_log_row(self) -> None:
        raw = json.loads((DATA_DIR / "ceos_ard_products.json").read_text(encoding="utf-8"))
        with (DATA_DIR / "ceos_ard_research_log.csv").open(encoding="utf-8-sig") as handle:
            rows = list(csv.DictReader(handle))
        pairs = {(row["product_id"], row["field_name"]) for row in rows}
        fields = {row["field_name"] for row in rows}
        for product in raw:
            for field in fields:
                self.assertIn((product["id"], field), pairs)

    def test_dates_and_urls_are_normalised(self) -> None:
        raw = json.loads((DATA_DIR / "ceos_ard_products.json").read_text(encoding="utf-8"))
        url_fields = ("access_url", "information_url", "self_assessment_url", "peer_review_url", "sample_product_url")
        for product in raw:
            self.assertRegex(product["approval_date"], r"^\d{4}-\d{2}-\d{2}$")
            for field in url_fields:
                value = product[field]
                self.assertTrue(value is None or value.startswith(("http://", "https://")))


if __name__ == "__main__":
    unittest.main()
