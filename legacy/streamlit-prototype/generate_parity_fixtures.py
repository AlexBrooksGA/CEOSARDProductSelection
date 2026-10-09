"""Generate semantic-parity fixtures from the legacy Python implementation.

The TypeScript rebuild is tested against these files (tests/fixtures/parity/*.json).
Run from the repository root:

    python legacy/streamlit-prototype/generate_parity_fixtures.py

The functions under test are the *original* implementations. Functions that live
inside the Streamlit script (``app.py``) are extracted from its source with ``ast``
and executed against a minimal session-state stub, so no Streamlit runtime or
network access is needed. Credentials are never read.
"""

from __future__ import annotations

import ast
import json
import sys
import tempfile
from copy import deepcopy
from dataclasses import asdict
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OUT = ROOT / "tests" / "fixtures" / "parity"
sys.path.insert(0, str(HERE))

import catalogue  # noqa: E402
import matching  # noqa: E402
import mims_api  # noqa: E402
from models import Product, Profile  # noqa: E402


class AttrDict(dict):
    def __getattr__(self, key):
        try:
            return self[key]
        except KeyError as exc:  # pragma: no cover - mirrors Streamlit's AttributeError
            raise AttributeError(key) from exc

    def __setattr__(self, key, value):
        self[key] = value


def app_functions(*names: str) -> SimpleNamespace:
    """Extract top-level functions and constants from app.py without running Streamlit."""
    source = (HERE / "app.py").read_text(encoding="utf-8")
    tree = ast.parse(source)
    session = AttrDict()
    namespace: dict = {
        "st": SimpleNamespace(session_state=session),
        "deepcopy": deepcopy,
        "Product": Product,
        "Profile": Profile,
        "re": __import__("re"),
    }
    wanted_constants = {"PRODUCT_FAMILIES", "SPATIAL_SLIDER_OPTIONS", "REVISIT_SLIDER_OPTIONS", "BIT_DEPTH_SLIDER_OPTIONS", "MIM_SOURCE_TYPE", "COVERAGE_OPTIONS"}
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id in wanted_constants for t in node.targets):
            exec(compile(ast.Module([node], []), "app.py", "exec"), namespace)
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name in names:
            exec(compile(ast.Module([node], []), "app.py", "exec"), namespace)
    # Matching group constants for limit_mim_results
    namespace.update(GROUP_STRONG=matching.GROUP_STRONG, GROUP_ELIGIBLE=matching.GROUP_ELIGIBLE, GROUP_NEAR=matching.GROUP_NEAR)
    return SimpleNamespace(session=session, ns=namespace)


def product_dict(product: Product) -> dict:
    value = asdict(product)
    value.pop("raw_source", None)
    return value


def write(name: str, payload: object) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(json.dumps(payload, indent=1, ensure_ascii=False, sort_keys=False) + "\n", encoding="utf-8")


# ---------------------------------------------------------------- catalogue

def catalogue_fixtures() -> None:
    products = catalogue.load_products()
    profiles = catalogue.load_profiles()
    write("catalogue_normalised.json", [product_dict(p) for p in products])
    write("profiles_normalised.json", [p.to_dict() for p in profiles])

    # Fallback path: researched file absent → demo + status overlay.
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        for name in ("demo_products.json", "ceos_ard_status.json", "default_profiles.json"):
            (root / name).write_text((ROOT / "data" / name).read_text(encoding="utf-8"), encoding="utf-8")
        with patch("catalogue.DATA_DIR", root):
            fallback = catalogue.load_products()
    write("catalogue_fallback_normalised.json", [product_dict(p) for p in fallback])

    # from_dict edge cases
    cases = [
        {"id": "a", "display_name": "Display only"},
        {"id": "b", "official_product_name": "  Official  "},
        {"id": "c", "product_name": "  Padded name  ", "missions": ["M1", "M2"], "nominal_revisit_days": 4, "nominal_revisit_display": "4 d"},
        {"id": "d", "product_name": "Explicit", "mission_name": None, "missions": [], "revisit_days": 2, "nominal_revisit_days": 9},
        {"id": "e", "product_name": "PFS", "pfs_type": "SR", "pfs_version": "v5", "ard_tier": "Threshold", "information_url": "https://example.test/i"},
        {"id": "f", "product_name": "PFS display", "pfs_type": None, "pfs_version": "v1", "ard_tier_display": "Goal", "ard_tier": "Threshold", "future_field": 1},
        {"id": "g", "product_name": "Explicit None", "ceos_ard_pfs": None, "ceos_ard_assessment_level": None, "source_url": None, "ceos_ard_record_url": None, "information_url": "https://x.test"},
    ]
    results = []
    for case in cases:
        results.append({"input": case, "output": product_dict(Product.from_dict(case))})
    errors = []
    for case in [{"id": "x"}, {"id": "y", "product_name": "   "}, {"id": "z", "product_name": 5}]:
        try:
            Product.from_dict(case)
            errors.append({"input": case, "error": None})
        except (TypeError, ValueError) as exc:
            errors.append({"input": case, "error": type(exc).__name__})
    write("product_from_dict.json", {"cases": results, "errors": errors})


# ---------------------------------------------------------------- matching

def synthetic_products() -> list[Product]:
    return [
        Product(id="eq-boundary", product_name="Boundary equal", spatial_resolution_m=30, revisit_days=16, radiometric_bit_depth=12, geographic_coverage="Regional"),
        Product(id="just-over", product_name="Just over", spatial_resolution_m=30.0001, revisit_days=16.0001, radiometric_bit_depth=11, geographic_coverage="Local or targeted"),
        Product(id="fine", product_name="fine detail", spatial_resolution_m=0.5, revisit_days=1, radiometric_bit_depth=16, geographic_coverage="Global"),
        Product(id="Fine-upper", product_name="Fine Detail", spatial_resolution_m=0.5, revisit_days=1, radiometric_bit_depth=16, geographic_coverage="Global"),
        Product(id="eszett", product_name="Straße product", spatial_resolution_m=10, revisit_days=5, radiometric_bit_depth=12, geographic_coverage="National"),
        Product(id="ss", product_name="Strasse product", spatial_resolution_m=10, revisit_days=5, radiometric_bit_depth=12, geographic_coverage="National"),
        Product(id="accent", product_name="Élan product", spatial_resolution_m=20, revisit_days=None, radiometric_bit_depth=None, geographic_coverage="Unknown"),
        Product(id="odd-coverage", product_name="Odd coverage", spatial_resolution_m=None, revisit_days=3, radiometric_bit_depth=10, geographic_coverage="Somewhere specific"),
        Product(id="zero", product_name="Zero values", spatial_resolution_m=0, revisit_days=0, radiometric_bit_depth=0, geographic_coverage="Continental or multi-country"),
        Product(id="bits-float", product_name="Bits float", spatial_resolution_m=60, revisit_days=30, radiometric_bit_depth=12, geographic_coverage="National"),
        Product(id="all-unknown", product_name="All unknown"),
        Product(id="astral", product_name="\U0001d4d0stral name", spatial_resolution_m=5, revisit_days=2, radiometric_bit_depth=14, geographic_coverage="Global"),
        Product(id="bmp-high", product_name="Ａ fullwidth", spatial_resolution_m=5, revisit_days=2, radiometric_bit_depth=14, geographic_coverage="Global"),
    ]


def profile_variants(built_in: list[Profile]) -> list[Profile]:
    variants = [*built_in]
    template = built_in[0]

    def variant(identifier: str, criteria: dict) -> Profile:
        value = template.to_dict()
        value.update(id=identifier, name=identifier, criteria=criteria)
        return Profile.from_dict(value)

    variants += [
        variant("none-active", {k: {"mode": "not_used", "value": v["value"]} for k, v in template.criteria.items()}),
        variant("all-required", {
            "spatial_resolution_m": {"mode": "required", "value": 30},
            "revisit_days": {"mode": "required", "value": 16},
            "radiometric_bit_depth": {"mode": "required", "value": 12},
            "geographic_coverage": {"mode": "required", "value": "Regional"},
        }),
        variant("all-preferred", {
            "spatial_resolution_m": {"mode": "preferred", "value": 10},
            "revisit_days": {"mode": "preferred", "value": 5},
            "radiometric_bit_depth": {"mode": "preferred", "value": 12},
            "geographic_coverage": {"mode": "preferred", "value": "National"},
        }),
        variant("mixed-order", {
            "geographic_coverage": {"mode": "preferred", "value": "Global"},
            "radiometric_bit_depth": {"mode": "required", "value": 12.9},
            "revisit_days": {"mode": "preferred", "value": 16},
            "spatial_resolution_m": {"mode": "required", "value": 30},
        }),
        variant("coverage-unknown-target", {
            "geographic_coverage": {"mode": "required", "value": "No requirement"},
        }),
        variant("unknown-criterion", {
            "spatial_resolution_m": {"mode": "preferred", "value": 100},
            "swath_width_km": {"mode": "preferred", "value": 100},
        }),
        variant("missing-mode", {
            "spatial_resolution_m": {"value": 30},
            "revisit_days": {"mode": "required", "value": 30},
        }),
    ]
    return variants


def match_payload(result) -> dict:
    return {
        "id": result.product.id,
        "group": result.group,
        "states": result.states,
        "preferred_met": result.preferred_met,
        "unknown_count": result.unknown_count,
        "summary": result.summary,
    }


def matching_fixtures() -> None:
    built_in = catalogue.load_profiles()
    products = [*catalogue.load_products(), *synthetic_products()]
    cases = []
    for profile in profile_variants(built_in):
        evaluated = [match_payload(matching.evaluate_product(p, profile)) for p in products]
        grouped = matching.group_and_sort(products, profile)
        cases.append({
            "profile": profile.to_dict(),
            "evaluated": evaluated,
            "groups": {name: [match_payload(item) for item in items] for name, items in grouped.items()},
        })
    criteria_cases = []
    for product in synthetic_products():
        for name, targets in {
            "spatial_resolution_m": [0, 0.5, 30, 30.0001],
            "revisit_days": [0, 1, 16],
            "radiometric_bit_depth": [0, 11, 12, 12.9, 16],
            "geographic_coverage": ["Global", "Regional", "Local or targeted", "No requirement", "nonsense"],
            "unknown_name": [1],
        }.items():
            for target in targets:
                criteria_cases.append({"id": product.id, "name": name, "target": target, "state": matching.evaluate_criterion(product, name, target)})

    comparison_cases = []
    for selection, candidate in [([], "a"), (["a"], "a"), (["a", "b"], "c"), (["a", "b", "c"], "d"), (["a", "b", "c"], "b")]:
        updated, accepted = matching.add_comparison(selection, candidate)
        comparison_cases.append({"selection": selection, "candidate": candidate, "updated": updated, "accepted": accepted})

    write("matching_cases.json", {
        "synthetic_products": [product_dict(p) for p in synthetic_products()],
        "groups": [matching.GROUP_STRONG, matching.GROUP_ELIGIBLE, matching.GROUP_NEAR],
        "coverage_scale": matching.COVERAGE_SCALE,
        "profiles": cases,
        "criteria": criteria_cases,
        "add_comparison": comparison_cases,
    })


# ---------------------------------------------------------------- filters / app helpers

def app_fixtures() -> None:
    app = app_functions(
        "metadata_filter", "build_active_profile", "normalise_profile_name", "custom_profile_name_error",
        "filters_changed", "profile_default_family", "nearest_slider_value", "limit_mim_results",
    )
    ns, session = app.ns, app.session
    products = [*catalogue.load_products(), *synthetic_products()]
    for index, product in enumerate(synthetic_products()):
        pass
    # Give synthetic records varied metadata for filter coverage.
    extra = [
        Product(id="mim-like", product_name="MIM thing", mission_name="Not reported by MIM product endpoint", product_family="Surface Reflectance", provider="QA Agency", source_type="MIM API product", ceos_ard_status="Assessment in progress", operational_status="Under Development", sensor_or_instrument_type="Multispectral imager", launch_or_start_year=None),
        Product(id="old-mission", product_name="Old mission", mission_name="Heritage-1", product_family="Synthetic Aperture Radar", provider="Old Agency", source_type="Curated demo record", ceos_ard_verified=True, ceos_ard_status="CEOS-ARD assessed", launch_or_start_year=2010, spatial_resolution_m=20),
        Product(id="new-mission", product_name="New mission", mission_name="Modern-2", product_family="Surface Temperature", provider="New Agency", source_type="Curated demo record", ceos_ard_status="Status unknown", launch_or_start_year=2020, spatial_resolution_m=None, sensor_or_instrument_type="Thermal infrared"),
    ]
    products += extra

    base = {
        "advanced_search": "", "sensor_filter": "", "provider_filter": [], "operational_filter": [], "source_filter": [],
        "ceos_filter": "CEOS-ARD assessed only", "launch_year_filter": 2015, "show_unknown": True,
        "use_spatial": False, "use_revisit": False, "use_bit_depth": False, "coverage_filter": "No requirement",
    }
    scenarios = [
        ("default", {}, "All product families"),
        ("family-sr", {}, "Surface Reflectance"),
        ("all-statuses", {"ceos_filter": "All statuses"}, "All product families"),
        ("in-progress", {"ceos_filter": "Assessment in progress"}, "All product families"),
        ("not-assessed", {"ceos_filter": "Not assessed or status unknown"}, "All product families"),
        ("search-landsat", {"advanced_search": "  LANDSAT "}, "All product families"),
        ("search-mission", {"advanced_search": "sentinel-1", "ceos_filter": "All statuses"}, "All product families"),
        ("search-strasse", {"advanced_search": "STRASSE", "ceos_filter": "All statuses"}, "All product families"),
        ("search-endpoint-quirk", {"advanced_search": "endpoint", "ceos_filter": "All statuses"}, "All product families"),
        ("provider", {"provider_filter": ["USGS", "ESA"]}, "All product families"),
        ("sensor", {"sensor_filter": "THERMAL", "ceos_filter": "All statuses"}, "All product families"),
        ("operational", {"operational_filter": ["Operational"]}, "All product families"),
        ("source", {"source_filter": ["MIM API product"], "ceos_filter": "All statuses"}, "All product families"),
        ("launch-2015", {"ceos_filter": "All statuses"}, "All product families"),
        ("launch-none", {"ceos_filter": "All statuses", "launch_year_filter": 1900}, "All product families"),
        ("hide-unknown-no-criteria", {"show_unknown": False, "ceos_filter": "All statuses"}, "All product families"),
        ("hide-unknown-spatial", {"show_unknown": False, "use_spatial": True, "ceos_filter": "All statuses", "launch_year_filter": 1900}, "All product families"),
        ("hide-unknown-coverage", {"show_unknown": False, "coverage_filter": "Global", "ceos_filter": "All statuses", "launch_year_filter": 1900}, "All product families"),
    ]
    filter_cases = []
    for name, overrides, family in scenarios:
        session.clear()
        session.update(deepcopy(base))
        session.update(overrides)
        result = ns["metadata_filter"](products, family)
        filter_cases.append({"name": name, "state": dict(session), "family": family, "ids": [p.id for p in result]})

    built_in = catalogue.load_profiles()
    active_cases = []
    for profile in built_in:
        for toggles in [
            {"use_spatial": True, "spatial_limit": 25.5, "use_revisit": False, "revisit_limit": 16.0, "use_bit_depth": True, "min_bit_depth": 10, "coverage_filter": "National"},
            {"use_spatial": False, "spatial_limit": 30.0, "use_revisit": True, "revisit_limit": 2.0, "use_bit_depth": False, "min_bit_depth": 12, "coverage_filter": "No requirement"},
        ]:
            session.clear()
            session.update(toggles)
            active_cases.append({"profile_id": profile.id, "session": toggles, "active": ns["build_active_profile"](profile).to_dict()})

    names = []
    for raw, exclude in [("  Radar   shortlist ", None), ("ab", None), ("Map land and FEATURES", None), ("map land and features", "map-land-features"), ("New\tprofile\nname", None), ("STRASSE", None)]:
        clean = ns["normalise_profile_name"](raw)
        names.append({"raw": raw, "clean": clean, "exclude": exclude, "error": ns["custom_profile_name_error"](clean, [*built_in, Profile(id="custom-1", name="Straße", description="", use_case_category="", product_families=[], criteria={}, built_in=False)], exclude)})

    changed = []
    explore = built_in[0]
    base_state = {"use_spatial": True, "spatial_limit": 30.0, "use_revisit": False, "revisit_limit": 30.0, "use_bit_depth": False, "min_bit_depth": 12,
                  "family_filter": "All product families", "ceos_filter": "CEOS-ARD assessed only", "show_unknown": True,
                  "advanced_search": "", "provider_filter": [], "sensor_filter": "", "operational_filter": [], "source_filter": [], "coverage_filter": "No requirement"}
    for label, overrides in [("unchanged", {}), ("value", {"spatial_limit": 20.0}), ("disabled-value-change", {"revisit_limit": 3.0}),
                             ("coverage-only", {"coverage_filter": "Global"}), ("family", {"family_filter": "Surface Reflectance"}),
                             ("search", {"advanced_search": "x"}), ("scope", {"ceos_filter": "All statuses"})]:
        session.clear()
        session.update(deepcopy(base_state))
        session.update(overrides)
        changed.append({"label": label, "profile_id": explore.id, "state": dict(session), "changed": ns["filters_changed"](explore)})

    sliders = []
    for value, options in [(25.5, "SPATIAL_SLIDER_OPTIONS"), (7, "REVISIT_SLIDER_OPTIONS"), (3000, "SPATIAL_SLIDER_OPTIONS"), (12.4, "BIT_DEPTH_SLIDER_OPTIONS")]:
        sliders.append({"value": value, "options": options, "nearest": ns["nearest_slider_value"](value, ns[options])})

    write("app_cases.json", {
        "extra_products": [product_dict(p) for p in extra],
        "filters": filter_cases,
        "active_profiles": active_cases,
        "profile_names": names,
        "filters_changed": changed,
        "nearest_slider": sliders,
        "constants": {k: ns[k] for k in ("PRODUCT_FAMILIES", "SPATIAL_SLIDER_OPTIONS", "REVISIT_SLIDER_OPTIONS", "BIT_DEPTH_SLIDER_OPTIONS", "COVERAGE_OPTIONS")},
    })


# ---------------------------------------------------------------- MIM

def mim_fixtures() -> None:
    instruments = {
        183: {"instrument_id": 183, "name_short": "HRG", "operator": "Catalyst", "spatial_resolution_best": 5, "instrument_types": "Optical imager"},
        1734: {"instrument_id": 1734, "name_short": "DESIS", "operator": "DLR", "spatial_resolution_best": 79, "spatial_resolution_description": "79 m instrument value"},
        9: {"instrument_id": 9, "name_full": "Example full", "operator": "ESA", "spatial_resolution_best": 20.5, "instrument_types": "SAR"},
        10: {"instrument_id": 10, "name_short": "B", "operator": "ESA", "spatial_resolution_best": 1234567, "instrument_types": "Radar altimeter"},
        11: {"instrument_id": 11, "name_short": "NoRes", "operator": "NASA"},
        12: {"instrument_id": 12, "name_short": "Tiny", "operator": "JAXA", "spatial_resolution_best": 0.00001},
    }
    items = [
        {"product_id": 158, "product_name": "Catalyst SPOT 5 HRG 2.5m", "category": "Optical", "type": "Surface Reflectance",
         "instruments": [{"instrument_id": 183, "instrument_name": "HRG", "product_status": "CEOS-ARD"}],
         "certifications": [{"scheme": "CEOS-ARD", "spec_version": "v5.0.1", "approval_date": "2024-12-04"}]},
        {"product_id": 106, "product_name": "DESIS L2A", "category": "Optical", "type": "Surface Reflectance",
         "instruments": [{"instrument_id": 1734, "instrument_name": "DESIS", "product_status": "CEOS-ARD"}],
         "certifications": [{"scheme": "CEOS-ARD", "approval_date": "2025-02-12"}]},
        {"product_id": 1, "product_name": "Status without evidence", "type": "Normalised Radar Backscatter",
         "instruments": [{"instrument_id": 9, "product_status": "CEOS-ARD"}], "certifications": [{"scheme": "CEOS-ARD", "spec_version": "v1"}]},
        {"product_id": 2, "product_name": "Evidence without status", "category": "SAR",
         "instruments": [{"instrument_id": 9, "product_status": "Under Development"}], "certifications": [{"scheme": "ceos-ard", "review_url": "https://example.test/review"}]},
        {"product_id": 3, "name": "Two instruments 10 m", "type": "ARD/AR", "documentation_url": "https://example.test/doc",
         "instruments": [{"instrument_id": 9, "product_status": "In Progress", "access_url": "https://example.test/access"}, {"instrument_id": 10.0, "product_status": "CEOS-ARD", "documentation_url": "https://example.test/link-doc"}],
         "certifications": [{"scheme": "Other", "approval_date": "2020-01-01"}, {"scheme": "CEOS-ARD", "approval_date": "2023-03-03", "spec_version": "v2"}]},
        {"id": "abc", "title": "Thermal thing", "category": "thermal infrared",
         "instruments": [{"instrument_id": 11, "instrument_name": "NoRes"}, {"instrument_id": 999, "instrument_name": "Missing"}, "not a dict"]},
        {"product_id": 4, "product_name": "Explicit field", "spatial_resolution_m": 15, "product_spatial_resolution_m": 12.5, "type": "Night-time Lights"},
        {"product_id": 5, "product_name": "Decimal .5m and 2000m", "type": "Other kind", "format": "NetCDF",
         "instruments": [{"instrument_id": 12, "product_status": "Operational"}]},
        {"product_id": 6, "product_name": "Name 25 metres approx 30m2", "category": "",
         "instruments": [{"instrument_id": "183", "instrument_name": "string id"}]},
        {"product_id": 7, "product_name": "Night lights radar sar", "type": None, "category": None},
        {"product_name": "No id"},
        {"product_id": 8},
        {"product_id": 0, "product_name": "Zero id", "type": "Surface Temperature"},
    ]
    normalised = []
    for item in items:
        product = mims_api.normalise_product(deepcopy(item), instruments, source_url="https://example.test/api/products/")
        normalised.append({"input": item, "output": product_dict(product) if product else None})

    families = []
    for item in [{"type": "Surface Reflectance"}, {"category": "ARD/SR"}, {"product_name": "Ocean aquatic reflectance"}, {"type": "Land Surface Temperature"},
                 {"product_name": "Thermal"}, {"type": "Synthetic Aperture Radar"}, {"product_name": "Sarcophagus"}, {"product_name": "Radar"},
                 {"product_name": "Nighttime"}, {"product_name": "Night-time lights"}, {"type": "Other", "category": "X"}, {"category": "Only cat"}, {}]:
        families.append({"input": item, "family": mims_api._product_family(item)})

    resolutions = []
    for item in [{"product_name": "A 2.5m product"}, {"product_name": "A 10 m product"}, {"product_name": "Version1.5m"}, {"product_name": "x 25M y"},
                 {"product_name": "25mm"}, {"product_name": "1.2.3m"}, {"product_name": "no number"}, {"product_spatial_resolution_m": 3}, {"spatial_resolution_m": True, "product_name": "7m"},
                 {"product_name": "30 m and 10 m"}, {"product_name": "100m-class"}, {"product_name": "25m_grid"}]:
        value, display, basis = mims_api._explicit_product_resolution(item)
        resolutions.append({"input": item, "value": value, "display": display, "basis": basis})

    schemas = [
        {"paths": {"/products": {"get": {"tags": ["products"]}}, "/instruments": {"get": {"summary": "List instruments"}}, "/missions": {"get": {"operationId": "list_missions", "parameters": [{"name": "limit"}, {"name": "offset"}, {"name": "include_non_eo"}]}},
                   "/product/{id}": {"get": {}}, "/products/search": {"get": {"summary": "Search products"}}}},
        {"paths": {"/v1/eo/products/": {"get": {}}, "/v1/eo/instruments/": {"get": {}}, "/v1/missions": {"get": {}}, "/v1/mission-instruments": {"get": {"summary": "mission instruments"}}}},
        {"paths": {"/catalogue": {"get": {"tags": ["product"]}}, "/devices": {"get": {"summary": "instrument list"}}, "/m": {"get": {"summary": "Mission"}}}},
        {"paths": {"/products": {"post": {}}, "/instruments": {"get": {}}, "/missions": {"get": {}}}},
        {"paths": {"/instruments": {"get": {}}, "/products": {"get": {}}}},
    ]
    schema_cases = []
    for schema in schemas:
        case = {"schema": schema}
        for collection in ("products", "instruments"):
            try:
                case[collection] = mims_api._collection_path(schema, collection)
            except mims_api.MimsApiError as exc:
                case[collection] = {"error": str(exc)}
        schema_cases.append(case)

    # Mission-endpoint selection inside inspect_openapi, exercised with a stubbed session.
    mission_cases = []
    for schema in schemas:
        html = '<script>const ui = SwaggerUIBundle({ url: "/api/openapi.json", dom_id: "#swagger-ui" })</script>'
        class Response:
            def __init__(self, status, text="", payload=None):
                self.status_code, self.text, self._payload = status, text, payload
                self.ok = 200 <= status < 300
            def json(self):
                return self._payload
        class Session:
            def get(self, url, params=None, timeout=None):
                if url.endswith("/docs/"):
                    return Response(200, html)
                return Response(200, payload=schema)
        with patch("mims_api._session", lambda: Session()), patch.dict("os.environ", {"MIMS_API_BASE_URL": "https://mim.example.test/api"}):
            try:
                _, inspection = mims_api.inspect_openapi()
                mission_cases.append({"schema": schema, "schema_url": inspection.schema_url, "mission_path": inspection.mission_path, "parameters": inspection.mission_parameters})
            except mims_api.MimsApiError as exc:
                mission_cases.append({"schema": schema, "error": str(exc)})

    docs_regex = []
    import re
    for html in ['url: "openapi.json"', "spec-url='/api/v2/spec.json'", 'URL = "https://elsewhere.test/x.json"', "no declaration", 'url:"/api/openapi.json?x=1"']:
        match = re.search(r"(?:url|spec-url)\s*[:=]\s*['\"]([^'\"]+)", html, re.IGNORECASE)
        docs_regex.append({"html": html, "match": match.group(1) if match else None})

    server_roots = []
    for schema, schema_url in [({}, "https://mim.example.test/api/openapi.json"), ({"servers": [{"url": "/api"}]}, "https://mim.example.test/api/openapi.json"),
                               ({"servers": [{"url": "https://mim.example.test/api/v1/"}]}, "https://mim.example.test/api/openapi.json"), ({"servers": []}, "https://mim.example.test/api/openapi.json")]:
        with patch.dict("os.environ", {"MIMS_API_BASE_URL": "https://mim.example.test/api/"}):
            server_roots.append({"schema": schema, "schema_url": schema_url, "root": mims_api._server_root(schema, schema_url)})

    write("mim_cases.json", {
        "instruments": {str(k): v for k, v in instruments.items()},
        "normalise_product": normalised,
        "product_family": families,
        "explicit_resolution": resolutions,
        "collection_path": schema_cases,
        "mission_inspection": mission_cases,
        "docs_regex": docs_regex,
        "server_root": server_roots,
    })


if __name__ == "__main__":
    catalogue_fixtures()
    matching_fixtures()
    app_fixtures()
    mim_fixtures()
    print(f"Wrote parity fixtures to {OUT.relative_to(ROOT)}")
