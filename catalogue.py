"""Load and validate the bundled demonstration catalogue."""

from __future__ import annotations

import json
from pathlib import Path

from models import Product, Profile


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"


class CatalogueError(RuntimeError):
    """Raised when a bundled catalogue file cannot be used."""


def _read_json(path: Path) -> object:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise CatalogueError(f"Required data file is missing: {path.name}") from exc
    except json.JSONDecodeError as exc:
        raise CatalogueError(f"Data file is malformed: {path.name}") from exc


def load_products() -> list[Product]:
    """Load the researched offline catalogue, falling back to the original demo."""
    researched_path = DATA_DIR / "ceos_ard_products.json"
    if researched_path.exists():
        raw = _read_json(researched_path)
        status_map: dict[str, object] = {}
    else:
        raw = _read_json(DATA_DIR / "demo_products.json")
        status = _read_json(DATA_DIR / "ceos_ard_status.json")
        status_map = status if isinstance(status, dict) else {}
    if not isinstance(raw, list):
        raise CatalogueError("Catalogue data has an unexpected top-level structure.")

    products: list[Product] = []
    seen: set[str] = set()
    for item in raw:
        if not isinstance(item, dict) or not item.get("id"):
            continue
        product_id = str(item["id"])
        if product_id in seen:
            raise CatalogueError(f"Duplicate product identifier: {product_id}")
        seen.add(product_id)
        merged = dict(item)
        explicit_status = status_map.get(product_id, {})
        if isinstance(explicit_status, dict):
            merged.update(explicit_status)
        try:
            products.append(Product.from_dict(merged))
        except (TypeError, ValueError) as exc:
            raise CatalogueError(f"Product record {product_id} is invalid.") from exc
    return products


def load_profiles() -> list[Profile]:
    """Load bundled illustrative profiles."""
    raw = _read_json(DATA_DIR / "default_profiles.json")
    if not isinstance(raw, list):
        raise CatalogueError("Profile data has an unexpected top-level structure.")
    profiles: list[Profile] = []
    for index, item in enumerate(raw):
        if not isinstance(item, dict):
            continue
        try:
            profiles.append(Profile.from_dict(item))
        except (TypeError, ValueError) as exc:
            raise CatalogueError(f"Profile record at index {index} is invalid.") from exc
    return profiles


def deduplicate_products(products: list[Product]) -> list[Product]:
    """Deduplicate by stable source identifier without fuzzy merging."""
    result: list[Product] = []
    seen: set[str] = set()
    for product in products:
        if product.id not in seen:
            seen.add(product.id)
            result.append(product)
    return result
