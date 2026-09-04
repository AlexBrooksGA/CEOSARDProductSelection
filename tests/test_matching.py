"""Lightweight tests for deterministic core matching behaviour."""

from __future__ import annotations

import unittest

from matching import GROUP_ELIGIBLE, GROUP_NEAR, GROUP_STRONG, add_comparison, evaluate_product, group_and_sort
from models import Product, Profile


def profile(*, spatial_mode: str = "required", spatial: float = 30, bit_mode: str = "preferred") -> Profile:
    return Profile(
        id="test", name="Test", description="Test", use_case_category="Test", product_families=["Surface Reflectance"],
        criteria={
            "spatial_resolution_m": {"mode": spatial_mode, "value": spatial},
            "radiometric_bit_depth": {"mode": bit_mode, "value": 12},
        },
    )


def product(identifier: str, name: str, spatial: float | None, bits: int | None = 12) -> Product:
    return Product(id=identifier, product_name=name, spatial_resolution_m=spatial, radiometric_bit_depth=bits)


class MatchingTests(unittest.TestCase):
    def test_required_criterion_passes(self) -> None:
        groups = group_and_sort([product("a", "Alpha", 20)], profile())
        self.assertEqual([item.product.id for item in groups[GROUP_STRONG]], ["a"])

    def test_required_criterion_fails(self) -> None:
        result = evaluate_product(product("a", "Alpha", 60), profile())
        self.assertEqual(result.group, GROUP_NEAR)

    def test_preferred_criteria_determine_strong_group(self) -> None:
        complete = product("a", "Alpha", 20, 12)
        outside_preference = product("b", "Beta", 20, 8)
        groups = group_and_sort([outside_preference, complete], profile())
        self.assertEqual([item.product.id for item in groups[GROUP_STRONG]], ["a"])
        self.assertEqual([item.product.id for item in groups[GROUP_ELIGIBLE]], ["b"])

    def test_alphabetical_tie_break(self) -> None:
        groups = group_and_sort([product("z", "Zulu", 20), product("a", "Alpha", 20)], profile())
        self.assertEqual([item.product.product_name for item in groups[GROUP_STRONG]], ["Alpha", "Zulu"])

    def test_required_unknown_is_near_match(self) -> None:
        result = evaluate_product(product("a", "Alpha", None), profile())
        self.assertEqual(result.group, GROUP_NEAR)
        self.assertEqual(result.states["spatial_resolution_m"], "unknown")

    def test_optional_unknown_sorts_below_reported(self) -> None:
        groups = group_and_sort([product("u", "Unknown", 20, None), product("r", "Reported", 20, 8)], profile())
        self.assertEqual(groups[GROUP_ELIGIBLE][-1].product.id, "u")

    def test_comparison_maximum_does_not_displace(self) -> None:
        original = ["a", "b", "c"]
        updated, accepted = add_comparison(original, "d")
        self.assertFalse(accepted)
        self.assertEqual(updated, original)


if __name__ == "__main__":
    unittest.main()
