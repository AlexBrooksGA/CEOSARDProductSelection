"""Transparent, non-numeric criterion matching and result grouping."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from models import Product, Profile


CriterionState = Literal["met", "outside", "unknown", "not_used"]
GROUP_STRONG = "Closer profile matches"
GROUP_ELIGIBLE = "Other products meeting required profile criteria"
GROUP_NEAR = "Manual task check"

COVERAGE_SCALE = {
    "Unknown": -1,
    "Local or targeted": 0,
    "Regional": 1,
    "National": 2,
    "Continental or multi-country": 3,
    "Global": 4,
}


@dataclass(slots=True)
class MatchResult:
    product: Product
    group: str
    states: dict[str, CriterionState]
    preferred_met: int
    unknown_count: int
    summary: str


def _criterion_value(product: Product, name: str) -> Any:
    return {
        "spatial_resolution_m": product.spatial_resolution_m,
        "revisit_days": product.revisit_days,
        "radiometric_bit_depth": product.radiometric_bit_depth,
        "geographic_coverage": product.geographic_coverage,
    }.get(name)


def evaluate_criterion(product: Product, name: str, target: Any) -> CriterionState:
    """Evaluate one criterion without treating unavailable values as zero or pass."""
    actual = _criterion_value(product, name)
    if actual is None or actual == "Unknown":
        return "unknown"
    if name in {"spatial_resolution_m", "revisit_days"}:
        return "met" if float(actual) <= float(target) else "outside"
    if name == "radiometric_bit_depth":
        return "met" if int(actual) >= int(target) else "outside"
    if name == "geographic_coverage":
        required = COVERAGE_SCALE.get(str(target), -1)
        reported = COVERAGE_SCALE.get(str(actual), -1)
        return "met" if required < 0 or reported >= required else "outside"
    return "unknown"


def evaluate_product(product: Product, profile: Profile) -> MatchResult:
    """Evaluate required/preferred criteria and produce an auditable text summary.

    Required unknowns cannot be assumed to pass. Optional unknowns do not reject a
    record, but fully described records sort ahead of otherwise equivalent records.
    """
    states: dict[str, CriterionState] = {}
    required_outside = False
    required_unknown = False
    preferred_met = 0
    unknown_count = 0
    met_labels: list[str] = []
    outside_labels: list[str] = []
    unknown_labels: list[str] = []
    labels = {
        "spatial_resolution_m": "spatial resolution",
        "revisit_days": "nominal revisit",
        "radiometric_bit_depth": "radiometric bit depth",
        "geographic_coverage": "geographic coverage",
    }

    for name, setting in profile.criteria.items():
        mode = setting.get("mode", "not_used")
        if mode == "not_used":
            states[name] = "not_used"
            continue
        state = evaluate_criterion(product, name, setting.get("value"))
        states[name] = state
        label = labels.get(name, name.replace("_", " "))
        if state == "met":
            met_labels.append(label)
            if mode == "preferred":
                preferred_met += 1
        elif state == "unknown":
            unknown_count += 1
            unknown_labels.append(label)
            if mode == "required":
                required_unknown = True
        else:
            outside_labels.append(label)
            if mode == "required":
                required_outside = True

    if required_outside or required_unknown:
        group = GROUP_NEAR
    else:
        group = GROUP_ELIGIBLE

    parts: list[str] = []
    if met_labels:
        parts.append("Reported characteristics match the selected " + " and ".join(met_labels) + " criteria.")
    if outside_labels:
        parts.append("Reported characteristics are outside the selected " + " and ".join(outside_labels) + " criteria.")
    if unknown_labels:
        parts.append("Manual task check — not reported: " + ", ".join(unknown_labels) + ".")
    if not parts:
        parts.append("No application-screening criteria are active.")
    return MatchResult(product, group, states, preferred_met, unknown_count, " ".join(parts))


def group_and_sort(products: list[Product], profile: Profile) -> dict[str, list[MatchResult]]:
    """Group records and sort by preferred criteria, completeness, then name."""
    results = [evaluate_product(product, profile) for product in products]
    eligible = [item for item in results if item.group == GROUP_ELIGIBLE]
    max_preferred = max((item.preferred_met for item in eligible), default=-1)
    for item in eligible:
        if item.preferred_met == max_preferred and item.unknown_count == 0:
            item.group = GROUP_STRONG

    grouped = {GROUP_STRONG: [], GROUP_ELIGIBLE: [], GROUP_NEAR: []}
    for item in results:
        grouped[item.group].append(item)
    for items in grouped.values():
        items.sort(key=lambda item: (-item.preferred_met, item.unknown_count, item.product.product_name.casefold()))
    return grouped


def add_comparison(selection: list[str], product_id: str, maximum: int = 3) -> tuple[list[str], bool]:
    """Add a unique comparison identifier without displacing existing choices."""
    if product_id in selection:
        return list(selection), True
    if len(selection) >= maximum:
        return list(selection), False
    return [*selection, product_id], True
