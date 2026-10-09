"""Typed domain models for catalogue records and selection profiles."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal


CriterionMode = Literal["required", "preferred", "not_used"]


@dataclass(slots=True)
class Product:
    """A normalised curated product or MIM mission/instrument candidate."""

    id: str
    product_name: str
    official_product_name: str | None = None
    display_name: str | None = None
    ceos_ard_assessment_id: str | None = None
    mission_name: str | None = None
    family: str = "Other"
    provider: str | None = None
    product_family: str | None = None
    spatial_resolution_m: float | None = None
    spatial_resolution_options_m: list[float] = field(default_factory=list)
    spatial_resolution_display: str | None = None
    spatial_resolution_basis: str = "unknown"
    instrument_spatial_resolution_best_m: float | None = None
    instrument_spatial_resolution_display: str | None = None
    instrument_resolution_note: str | None = None
    revisit_days: float | None = None
    revisit_display: str | None = None
    revisit_basis: str = "unknown"
    product_update_frequency_days: float | None = None
    product_update_frequency_display: str | None = None
    radiometric_bit_depth: int | None = None
    radiometric_bit_depth_display: str | None = None
    bit_depth_basis: str = "unknown"
    output_storage_bit_depth: int | None = None
    output_storage_display: str | None = None
    output_data_type: str | None = None
    geographic_coverage: str = "Unknown"
    geographic_coverage_display: str | None = None
    coverage_basis: str = "unknown"
    swath_width: str | None = None
    operational_status: str | None = None
    atmospheric_correction: str | None = None
    elevation_model: str | None = None
    coordinate_system: str | None = None
    data_format: str | None = None
    launch_or_start_year: int | None = None
    sensor_or_instrument_type: str | None = None
    ceos_ard_status: str = "Status unknown"
    ceos_ard_verified: bool = False
    ceos_ard_pfs: str | None = None
    ceos_ard_assessment_level: str | None = None
    ceos_ard_record_url: str | None = None
    pfs_type: str | None = None
    pfs_version: str | None = None
    approval_date: str | None = None
    agency: str | None = None
    missions: list[str] = field(default_factory=list)
    instruments: list[str] = field(default_factory=list)
    ard_tier: str | None = None
    ard_tier_display: str | None = None
    ard_tier_notes: str | None = None
    geometric_accuracy_display: str | None = None
    geometric_accuracy_metric: str | None = None
    geometric_accuracy_value: float | None = None
    geometric_accuracy_unit: str | None = None
    radiometric_accuracy_display: str | None = None
    radiometric_accuracy_metric: str | None = None
    radiometric_accuracy_value: float | None = None
    radiometric_accuracy_unit: str | None = None
    access_url: str | None = None
    information_url: str | None = None
    self_assessment_url: str | None = None
    peer_review_url: str | None = None
    sample_product_url: str | None = None
    existing_demo_record_ids: list[str] = field(default_factory=list)
    source_type: str = "Curated demo record"
    source_url: str | None = None
    notes: str | None = None
    raw_source: dict[str, Any] = field(default_factory=dict, repr=False)

    @classmethod
    def from_dict(cls, value: dict[str, Any]) -> "Product":
        """Create a product while ignoring harmless future catalogue fields."""
        value = dict(value)
        product_name = value.get("product_name") or value.get("display_name") or value.get("official_product_name")
        if not isinstance(product_name, str) or not product_name.strip():
            raise ValueError("product_name is required")
        value["product_name"] = product_name.strip()
        value.setdefault("mission_name", ", ".join(value.get("missions", [])) or None)
        value.setdefault("revisit_days", value.get("nominal_revisit_days"))
        value.setdefault("revisit_display", value.get("nominal_revisit_display"))
        value.setdefault("ceos_ard_pfs", " ".join(filter(None, [value.get("pfs_type"), value.get("pfs_version")])) or None)
        value.setdefault("ceos_ard_assessment_level", value.get("ard_tier_display") or value.get("ard_tier"))
        value.setdefault("ceos_ard_record_url", value.get("information_url"))
        value.setdefault("source_url", value.get("information_url"))
        allowed = {item.name for item in cls.__dataclass_fields__.values()}
        return cls(**{key: val for key, val in value.items() if key in allowed})


@dataclass(slots=True)
class Profile:
    """A broad, illustrative technical selection profile."""

    id: str
    name: str
    description: str
    use_case_category: str
    product_families: list[str]
    criteria: dict[str, dict[str, Any]]
    default_product_family: str | None = None
    filter_defaults: dict[str, Any] = field(default_factory=dict)
    radiometric_screening: str = "PFS baseline"
    geometric_screening: str = "Manual task check"
    notes: str | None = None
    assumptions: str | None = None
    built_in: bool = True

    @classmethod
    def from_dict(cls, value: dict[str, Any]) -> "Profile":
        allowed = {item.name for item in cls.__dataclass_fields__.values()}
        return cls(**{key: val for key, val in value.items() if key in allowed})

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "use_case_category": self.use_case_category,
            "product_families": self.product_families,
            "criteria": self.criteria,
            "default_product_family": self.default_product_family,
            "filter_defaults": self.filter_defaults,
            "radiometric_screening": self.radiometric_screening,
            "geometric_screening": self.geometric_screening,
            "notes": self.notes,
            "assumptions": self.assumptions,
            "built_in": self.built_in,
        }
