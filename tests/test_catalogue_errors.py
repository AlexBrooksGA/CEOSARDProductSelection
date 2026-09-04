"""Failure-mode tests for malformed bundled catalogue files."""

from __future__ import annotations

import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from catalogue import CatalogueError, load_products, load_profiles


class CatalogueErrorTests(unittest.TestCase):
    def test_invalid_product_record_is_reported_as_catalogue_error(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "ceos_ard_products.json").write_text(json.dumps([{"id": "broken"}]), encoding="utf-8")
            with patch("catalogue.DATA_DIR", root):
                with self.assertRaises(CatalogueError):
                    load_products()

    def test_invalid_profile_record_is_reported_as_catalogue_error(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "default_profiles.json").write_text(json.dumps([{"id": "broken"}]), encoding="utf-8")
            with patch("catalogue.DATA_DIR", root):
                with self.assertRaises(CatalogueError):
                    load_profiles()


if __name__ == "__main__":
    unittest.main()
