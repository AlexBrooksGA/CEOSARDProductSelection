"""CEOS-ARD Product Explorer Streamlit entry point."""

from __future__ import annotations

from copy import deepcopy
import re
from uuid import uuid4

import streamlit as st
from dotenv import load_dotenv

from catalogue import CatalogueError, deduplicate_products, load_products, load_profiles
from components import (
    inject_theme,
    render_builder_panel_marker,
    render_category_cue,
    render_comparison,
    render_education,
    render_empty_state,
    render_filter_summary,
    render_header,
    render_page_header,
    render_panel_marker,
    render_create_profile_card,
    render_profile_card,
    render_product_card,
    render_result_heading,
    render_stage_header,
    render_subsection_header,
)
from matching import GROUP_ELIGIBLE, GROUP_NEAR, GROUP_STRONG, group_and_sort
from mims_api import MimsApiError, credentials_configured, load_product_candidates
from models import Product, Profile


load_dotenv()
st.set_page_config(page_title="CEOS-ARD Product Explorer", page_icon="🛰️", layout="wide", initial_sidebar_state="collapsed")
inject_theme()

PRODUCT_FAMILIES = [
    "All product families", "Surface Reflectance", "Surface Temperature",
    "Synthetic Aperture Radar", "Aquatic Reflectance", "Night-time Lights",
]
PRODUCT_FAMILY_LABELS = {
    "Synthetic Aperture Radar": "Combined CEOS-ARD for Synthetic Aperture Radar",
    "Night-time Lights": "Nighttime Lights Surface Radiance",
}
USE_CASES = [
    "Explore CEOS-ARD Products",
    "Map Land and Features",
    "Monitor Change Over Time",
    "Other task",
]
CRITERION_MODES = ["required", "preferred", "not_used"]
CRITERION_MODE_LABELS = {
    "required": "Required for profile",
    "preferred": "Preferred for profile",
    "not_used": "Not used",
}
COVERAGE_OPTIONS = [
    "No requirement", "Global", "Continental or multi-country", "National",
    "Regional", "Local or targeted",
]
MIM_SOURCE_TYPE = "MIM API product"
MIM_DISPLAY_OPTIONS = ["12", "24", "48", "96", "All"]
SPATIAL_SLIDER_OPTIONS = [
    0.1, 0.2, 0.5, 1.0, 2.5, 5.0, 10.0, 15.0, 20.0, 25.0, 30.0,
    50.0, 60.0, 100.0, 250.0, 500.0, 1_000.0, 2_500.0, 5_000.0,
    10_000.0, 25_000.0, 50_000.0, 100_000.0,
]
REVISIT_SLIDER_OPTIONS = [
    0.1, 0.25, 0.5, 1.0, 2.0, 3.0, 4.0, 5.0, 7.0, 10.0, 12.0,
    16.0, 20.0, 30.0, 45.0, 60.0, 90.0, 120.0, 180.0, 365.0,
]
BIT_DEPTH_SLIDER_OPTIONS = list(range(1, 33))


def display_product_family(value: str) -> str:
    """Show current PFS names without changing internal filter values."""
    return PRODUCT_FAMILY_LABELS.get(value, value)


def display_criterion_mode(value: str) -> str:
    """Use task-profile language without changing stored criterion modes."""
    return CRITERION_MODE_LABELS.get(value, value)


def nearest_slider_value(value: float | int, options: list[float] | list[int]) -> float | int:
    return min(options, key=lambda option: abs(float(option) - float(value)))


def sync_value_from_slider(slider_key: str, value_key: str, use_integer: bool = False) -> None:
    value = st.session_state[slider_key]
    st.session_state[value_key] = int(value) if use_integer else float(value)


def sync_slider_from_value(value_key: str, slider_key: str, options: list[float] | list[int]) -> None:
    st.session_state[slider_key] = nearest_slider_value(st.session_state[value_key], options)


def render_numeric_slider(
    label: str,
    *,
    value_key: str,
    slider_key: str,
    options: list[float] | list[int],
    minimum: float | int,
    maximum: float | int,
    step: float | int,
    unit: str,
    disabled: bool = False,
    use_integer: bool = False,
) -> float | int:
    """Render a common-value slider with an authoritative precise-entry companion."""
    with st.container():
        st.markdown('<div class="precision-slider-marker"></div>', unsafe_allow_html=True)
        st.select_slider(
            label,
            options=options,
            key=slider_key,
            format_func=lambda value: f"{value:g} {unit}",
            disabled=disabled,
            on_change=sync_value_from_slider,
            args=(slider_key, value_key, use_integer),
        )
        value = st.number_input(
            f"Exact value ({unit})",
            min_value=minimum,
            max_value=maximum,
            step=step,
            key=value_key,
            disabled=disabled,
            on_change=sync_slider_from_value,
            args=(value_key, slider_key, options),
            help="Use the slider for common values or enter an exact value. Exact values remain authoritative for matching.",
        )
    return int(value) if use_integer else float(value)


@st.cache_data(ttl=21_600, show_spinner=False)
def cached_mim_products() -> tuple[list[Product], object]:
    """Cache the joined product and bulk-instrument collections for six hours."""
    return load_product_candidates()


def init_state(default_profile: Profile) -> None:
    defaults = {
        "custom_profiles": {}, "comparison_ids": [], "api_products": [],
        "api_loaded": False, "api_status": "Bundled catalogue", "show_near_matches": False,
        "selected_profile_id": default_profile.id, "last_profile_id": None,
        "include_mim": False,
        "ceos_filter": "CEOS-ARD assessed only",
        "advanced_search": "", "provider_filter": [], "sensor_filter": "",
        "coverage_filter": "No requirement", "operational_filter": [], "source_filter": [],
        "show_unknown": True, "launch_year_filter": 2015, "cards_per_row": 3,
        "group_cards_by_family": False,
        "profile_carousel_start": 0,
        "spatial_limit_slider": 30.0, "revisit_limit_slider": 16.0,
        "min_bit_depth_slider": 12,
    }
    for key, value in defaults.items():
        st.session_state.setdefault(key, value)


def all_profiles(built_in: list[Profile]) -> list[Profile]:
    custom = [Profile.from_dict(item) for item in st.session_state.custom_profiles.values()]
    return [*built_in, *custom]


def profile_default_family(profile: Profile) -> str:
    """Return the one editable product-family filter value initialised by a profile."""
    return profile.default_product_family or (profile.product_families[0] if profile.product_families else "All product families")


def set_profile_defaults(profile: Profile) -> None:
    """Apply defaults once for an explicit profile selection or reset action."""
    spatial = profile.criteria.get("spatial_resolution_m", {"mode": "not_used", "value": 30})
    revisit = profile.criteria.get("revisit_days", {"mode": "not_used", "value": 16})
    bit_depth = profile.criteria.get("radiometric_bit_depth", {"mode": "not_used", "value": 12})
    coverage = profile.criteria.get("geographic_coverage", {"mode": "not_used", "value": "Regional"})
    st.session_state.use_spatial = spatial["mode"] != "not_used"
    st.session_state.spatial_limit = float(spatial.get("value", 30))
    st.session_state.spatial_limit_slider = nearest_slider_value(st.session_state.spatial_limit, SPATIAL_SLIDER_OPTIONS)
    st.session_state.use_revisit = revisit["mode"] != "not_used"
    st.session_state.revisit_limit = float(revisit.get("value", 16))
    st.session_state.revisit_limit_slider = nearest_slider_value(st.session_state.revisit_limit, REVISIT_SLIDER_OPTIONS)
    st.session_state.use_bit_depth = bit_depth["mode"] != "not_used"
    st.session_state.min_bit_depth = int(bit_depth.get("value", 12))
    st.session_state.min_bit_depth_slider = nearest_slider_value(st.session_state.min_bit_depth, BIT_DEPTH_SLIDER_OPTIONS)
    st.session_state.coverage_filter = coverage.get("value", "No requirement") if coverage["mode"] != "not_used" else "No requirement"
    st.session_state.family_filter = profile_default_family(profile)
    st.session_state.ceos_filter = profile.filter_defaults.get("ceos_filter", "CEOS-ARD assessed only")
    st.session_state.show_unknown = bool(profile.filter_defaults.get("show_unknown", True))
    st.session_state.last_profile_id = profile.id


def select_profile(profile: Profile) -> None:
    """Select a profile and deliberately reset only its existing filter defaults."""
    st.session_state.selected_profile_id = profile.id
    set_profile_defaults(profile)


def reset_refinements(profile: Profile) -> None:
    for key in ("advanced_search", "provider_filter", "sensor_filter", "operational_filter", "source_filter"):
        st.session_state[key] = [] if key.endswith("_filter") and key not in {"sensor_filter"} else ""
    st.session_state.show_unknown = True
    st.session_state.ceos_filter = "CEOS-ARD assessed only"
    st.session_state.launch_year_filter = 2015
    set_profile_defaults(profile)


def reveal_loaded_mim_candidates() -> list[str]:
    """Open only the filters that would otherwise hide loaded MIM products."""
    changes: list[str] = []
    if st.session_state.ceos_filter not in {"All statuses", "Not assessed or status unknown"}:
        st.session_state.ceos_filter = "All statuses"
        changes.append("CEOS-ARD status set to All statuses")
    if not st.session_state.show_unknown:
        st.session_state.show_unknown = True
        changes.append("unknown values allowed")
    if not st.session_state.show_near_matches:
        st.session_state.show_near_matches = True
        changes.append("products needing a manual task check shown")
    if st.session_state.source_filter and MIM_SOURCE_TYPE not in st.session_state.source_filter:
        st.session_state.source_filter = [*st.session_state.source_filter, MIM_SOURCE_TYPE]
        changes.append("MIM API product source included")
    return changes


def limit_mim_results(grouped: dict[str, list], limit: int | None) -> dict[str, list]:
    """Limit rendered API cards without changing local records or match ordering."""
    if limit is None:
        return grouped
    remaining = limit
    limited: dict[str, list] = {}
    for group_name in (GROUP_STRONG, GROUP_ELIGIBLE, GROUP_NEAR):
        items: list = []
        for result in grouped[group_name]:
            if result.product.source_type != MIM_SOURCE_TYPE:
                items.append(result)
            elif remaining > 0:
                items.append(result)
                remaining -= 1
        limited[group_name] = items
    return limited


def build_active_profile(selected: Profile) -> Profile:
    criteria = deepcopy(selected.criteria)
    for name, enabled_key, value_key, default_mode in (
        ("spatial_resolution_m", "use_spatial", "spatial_limit", "preferred"),
        ("revisit_days", "use_revisit", "revisit_limit", "preferred"),
        ("radiometric_bit_depth", "use_bit_depth", "min_bit_depth", "preferred"),
    ):
        original_mode = criteria.get(name, {}).get("mode", default_mode)
        criteria[name] = {
            "mode": (original_mode if original_mode != "not_used" else default_mode) if st.session_state[enabled_key] else "not_used",
            "value": st.session_state[value_key],
        }
    original_coverage_mode = criteria.get("geographic_coverage", {}).get("mode", "preferred")
    criteria["geographic_coverage"] = {
        "mode": (original_coverage_mode if original_coverage_mode != "not_used" else "preferred") if st.session_state.coverage_filter != "No requirement" else "not_used",
        "value": st.session_state.coverage_filter,
    }
    value = selected.to_dict()
    value["criteria"] = criteria
    return Profile.from_dict(value)


def snapshot_current_filters(profile_id: str, name: str, description: str, selected: Profile) -> Profile:
    """Capture the current profile-managed filters without creating another filter path."""
    active = build_active_profile(selected)
    family = st.session_state.family_filter
    families = PRODUCT_FAMILIES[1:] if family == "All product families" else [family]
    return Profile(
        id=profile_id,
        name=name,
        description=description or "Saved from the current application-screening filters.",
        use_case_category="User-defined profile",
        product_families=families,
        default_product_family=family,
        criteria=deepcopy(active.criteria),
        filter_defaults={
            "ceos_filter": st.session_state.ceos_filter,
            "show_unknown": bool(st.session_state.show_unknown),
        },
        assumptions="User-defined profile saved from the existing application-screening filters.",
        built_in=False,
    )


def normalise_profile_name(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def custom_profile_name_error(name: str, profiles: list[Profile], exclude_id: str | None = None) -> str | None:
    if len(name) < 3:
        return "Enter a profile name with at least three characters."
    if any(profile.id != exclude_id and profile.name.casefold() == name.casefold() for profile in profiles):
        return "A profile with that name already exists."
    return None


def move_profile_carousel(delta: int, item_count: int) -> None:
    """Move the four-card carousel by one position while keeping the window valid."""
    maximum = max(0, item_count - 4)
    current = int(st.session_state.get("profile_carousel_start", 0))
    st.session_state.profile_carousel_start = max(0, min(maximum, current + delta))


def populate_builder(profile: Profile | None, selected: Profile) -> None:
    """Open Profile Builder with an editable custom profile or a new draft."""
    source = profile or snapshot_current_filters("builder-draft", "", "", selected)
    spatial = source.criteria.get("spatial_resolution_m", {"mode": "not_used", "value": 30})
    revisit = source.criteria.get("revisit_days", {"mode": "not_used", "value": 30})
    coverage = source.criteria.get("geographic_coverage", {"mode": "not_used", "value": "Regional"})
    st.session_state.builder_profile_id = profile.id if profile else None
    st.session_state.builder_name = profile.name if profile else ""
    st.session_state.builder_description = profile.description if profile else ""
    st.session_state.builder_family = profile_default_family(source)
    st.session_state.builder_spatial_mode = spatial.get("mode", "not_used")
    st.session_state.builder_spatial_value = float(spatial.get("value", 30))
    st.session_state.builder_revisit_mode = revisit.get("mode", "not_used")
    st.session_state.builder_revisit_value = float(revisit.get("value", 30))
    st.session_state.builder_coverage = (
        coverage.get("value", "No requirement") if coverage.get("mode") != "not_used" else "No requirement"
    )
    st.session_state.builder_ceos_filter = source.filter_defaults.get("ceos_filter", "CEOS-ARD assessed only")
    st.session_state.builder_show_unknown = bool(source.filter_defaults.get("show_unknown", True))
    st.session_state.main_navigation = "Profile Builder"


def profile_from_builder(profile_id: str, existing: Profile | None = None) -> Profile:
    """Build a custom profile from the Profile Builder fields using the shared model."""
    criteria = deepcopy(existing.criteria) if existing else {
        "radiometric_bit_depth": {"mode": "not_used", "value": 12},
    }
    criteria["spatial_resolution_m"] = {
        "mode": st.session_state.builder_spatial_mode,
        "value": float(st.session_state.builder_spatial_value),
    }
    criteria["revisit_days"] = {
        "mode": st.session_state.builder_revisit_mode,
        "value": float(st.session_state.builder_revisit_value),
    }
    criteria["geographic_coverage"] = {
        "mode": "not_used" if st.session_state.builder_coverage == "No requirement" else "preferred",
        "value": st.session_state.builder_coverage,
    }
    family = st.session_state.builder_family
    return Profile(
        id=profile_id,
        name=normalise_profile_name(st.session_state.builder_name),
        description=st.session_state.builder_description.strip() or "Reusable application-screening filter defaults.",
        use_case_category="User-defined profile",
        product_families=PRODUCT_FAMILIES[1:] if family == "All product families" else [family],
        default_product_family=family,
        criteria=criteria,
        filter_defaults={
            "ceos_filter": st.session_state.builder_ceos_filter,
            "show_unknown": bool(st.session_state.builder_show_unknown),
        },
        assumptions="User-defined profile configured with the existing application-screening filter model.",
        built_in=False,
    )


def filters_changed(selected: Profile) -> bool:
    for criterion, use_key, value_key in (
        ("spatial_resolution_m", "use_spatial", "spatial_limit"),
        ("revisit_days", "use_revisit", "revisit_limit"),
        ("radiometric_bit_depth", "use_bit_depth", "min_bit_depth"),
    ):
        setting = selected.criteria.get(criterion, {"mode": "not_used", "value": None})
        if st.session_state[use_key] != (setting["mode"] != "not_used"):
            return True
        if st.session_state[use_key] and float(st.session_state[value_key]) != float(setting["value"]):
            return True
    if st.session_state.family_filter != profile_default_family(selected):
        return True
    expected_ceos = selected.filter_defaults.get("ceos_filter", "CEOS-ARD assessed only")
    expected_unknown = bool(selected.filter_defaults.get("show_unknown", True))
    if st.session_state.ceos_filter != expected_ceos or st.session_state.show_unknown != expected_unknown:
        return True
    return any([
        st.session_state.advanced_search, st.session_state.provider_filter,
        st.session_state.sensor_filter, st.session_state.operational_filter,
        st.session_state.source_filter,
    ])


def metadata_filter(products: list[Product], family: str) -> list[Product]:
    search = st.session_state.advanced_search.casefold().strip()
    sensor = st.session_state.sensor_filter.casefold().strip()
    result: list[Product] = []
    for product in products:
        if family != "All product families" and product.product_family != family:
            continue
        if st.session_state.ceos_filter == "CEOS-ARD assessed only" and not product.ceos_ard_verified:
            continue
        if st.session_state.ceos_filter == "Assessment in progress" and product.ceos_ard_status != "Assessment in progress":
            continue
        if st.session_state.ceos_filter == "Not assessed or status unknown" and product.ceos_ard_verified:
            continue
        if search and search not in f"{product.product_name} {product.mission_name or ''}".casefold():
            continue
        if st.session_state.provider_filter and product.provider not in st.session_state.provider_filter:
            continue
        if sensor and sensor not in (product.sensor_or_instrument_type or "").casefold():
            continue
        if st.session_state.operational_filter and product.operational_status not in st.session_state.operational_filter:
            continue
        if st.session_state.source_filter and product.source_type not in st.session_state.source_filter:
            continue
        if product.launch_or_start_year is not None and product.launch_or_start_year < st.session_state.launch_year_filter:
            continue
        if not st.session_state.show_unknown:
            active_unknown = (
                (st.session_state.use_spatial and product.spatial_resolution_m is None)
                or (st.session_state.use_revisit and product.revisit_days is None)
                or (st.session_state.use_bit_depth and product.radiometric_bit_depth is None)
                or (st.session_state.coverage_filter != "No requirement" and product.geographic_coverage == "Unknown")
                or product.launch_or_start_year is None
            )
            if active_unknown:
                continue
        result.append(product)
    return result


try:
    local_products = load_products()
    built_in_profiles = load_profiles()
except CatalogueError as exc:
    st.error(str(exc))
    st.stop()
if not built_in_profiles:
    st.error("No built-in profiles are available.")
    st.stop()

init_state(built_in_profiles[0])
profiles = all_profiles(built_in_profiles)
profile_by_id = {profile.id: profile for profile in profiles}
pending_builder_choice = st.session_state.pop("pending_builder_manage_choice", None)
if pending_builder_choice in profile_by_id:
    st.session_state.builder_manage_choice = pending_builder_choice
pending_profile_id = st.session_state.pop("pending_profile_id", None)
if pending_profile_id in profile_by_id:
    st.session_state.selected_profile_id = pending_profile_id
if st.session_state.selected_profile_id not in profile_by_id:
    st.session_state.selected_profile_id = built_in_profiles[0].id
selected_profile = profile_by_id[st.session_state.selected_profile_id]
if st.session_state.last_profile_id != selected_profile.id:
    set_profile_defaults(selected_profile)
custom_profiles = [profile for profile in profiles if not profile.built_in]
if st.session_state.pop("reset_builder_draft", False):
    populate_builder(None, selected_profile)
elif "builder_name" not in st.session_state:
    populate_builder(None, selected_profile)
    st.session_state.main_navigation = "Discover"

render_header()
if profile_action_message := st.session_state.pop("profile_action_message", None):
    st.success(profile_action_message)

discover_tab, builder_tab, compare_tab = st.tabs(
    ["Discover", "Profile Builder", "Compare"],
    default="Discover",
    key="main_navigation",
    on_change="rerun",
)

with discover_tab:
    render_page_header(
        "Discover",
        "Shortlist products using a technical profile",
        "Start with a task-oriented profile, refine the reported characteristics, then inspect and compare Earth observation data products for further consideration.",
    )
    with st.container(border=True):
        render_panel_marker("profile")
        render_stage_header(
            1,
            "How do you want to use CEOS-ARD products?",
            "Start with products assessed against a CEOS-ARD Product Family Specification, then choose the spatial and temporal requirements most relevant to your task.",
        )
        with st.expander("What CEOS-ARD assessment and these profiles mean", expanded=False):
            st.write(
                "CEOS-ARD assessment describes product preparation, metadata and measurement-specific requirements. "
                "These profiles add broad application-screening preferences; they do not certify that a product is "
                "suitable for a particular operational or scientific use."
            )
        carousel_items: list[Profile | None] = [*profiles, None]
        maximum_start = max(0, len(carousel_items) - 4)
        st.session_state.profile_carousel_start = min(
            int(st.session_state.profile_carousel_start), maximum_start
        )
        carousel_heading, carousel_position, previous_action, next_action = st.columns([6, 1.4, .55, .55])
        with carousel_heading:
            render_subsection_header(
                "Profiles",
                "Built-in shortcuts and your session profiles use the same editable filters.",
            )
        start = int(st.session_state.profile_carousel_start)
        stop = min(start + 4, len(carousel_items))
        with carousel_position:
            st.markdown(
                f'<div class="profile-carousel-meta">Showing {start + 1}–{stop} of {len(carousel_items)}</div>',
                unsafe_allow_html=True,
            )
        previous_action.button(
            "←",
            key="profile_carousel_previous",
            disabled=start == 0,
            help="Show previous profiles",
            on_click=move_profile_carousel,
            args=(-1, len(carousel_items)),
        )
        next_action.button(
            "→",
            key="profile_carousel_next",
            disabled=start >= maximum_start,
            help="Show more profiles",
            on_click=move_profile_carousel,
            args=(1, len(carousel_items)),
        )
        visible_profiles = carousel_items[start:stop]
        profile_columns = st.columns(4, gap="medium")
        for column, profile in zip(profile_columns, visible_profiles):
            with column:
                with st.container(border=True):
                    if profile is None:
                        render_create_profile_card()
                        st.button(
                            "Create profile",
                            key="create_custom_profile",
                            on_click=populate_builder,
                            args=(None, selected_profile),
                            help="Open Profile Builder to define another reusable profile.",
                        )
                        continue
                    is_selected = selected_profile.id == profile.id
                    render_profile_card(profile, is_selected, filters_changed(profile) if is_selected else False)
                    if profile.built_in:
                        st.button(
                            "Reapply" if is_selected else "Select",
                            key=f"profile_select_{profile.id}",
                            on_click=select_profile,
                            args=(profile,),
                            help="Apply this profile's starting values. All filters remain editable.",
                        )
                    else:
                        apply_action, edit_action = st.columns(2, gap="small")
                        apply_action.button(
                            "Reapply" if is_selected else "Apply",
                            key=f"profile_apply_{profile.id}",
                            on_click=select_profile,
                            args=(profile,),
                            help="Apply this profile's starting values. All filters remain editable.",
                        )
                        edit_action.button(
                            "Edit",
                            key=f"profile_edit_{profile.id}",
                            on_click=populate_builder,
                            args=(profile, selected_profile),
                            help="Open this profile in Profile Builder.",
                        )
        st.caption("Profile defaults can be adjusted using the filters below. An active profile records the last shortcut applied; edited filters remain in effect.")

    with st.container(border=True):
        render_panel_marker("filters")
        render_stage_header(2, "Refine application-screening criteria", "Adjust the profile criteria without changing the saved profile.")
        render_subsection_header("Search and scope", "Search first, then narrow the catalogue by Product Family Specification, product type and reported technical characteristics.")
        top_a, top_b = st.columns([1.35, 1], gap="large")
        with top_a:
            st.text_input(
                "Search data products or missions",
                key="advanced_search",
                placeholder="Enter a data product or mission name",
            )
        with top_b:
            st.selectbox("Product or measurement family", PRODUCT_FAMILIES, key="family_filter", format_func=display_product_family)
            render_category_cue(st.session_state.family_filter)

        st.checkbox(
            "Show additional products from CEOS Missions, Instruments and Measurements (MIM)",
            key="include_mim",
            help="Loads MIM data product records and links their reported instrument identifiers to the instrument collection.",
        )

        if st.session_state.include_mim:
            if credentials_configured():
                st.caption("MIM configuration detected. Data loads only when you press the button below.")
            else:
                st.caption("MIM credentials are not configured in this process. The bundled catalogue remains available.")
            api_a, api_b = st.columns([1.6, 1], gap="large")
            with api_a:
                if st.button("Load MIM product records", type="primary", use_container_width=True):
                    if not credentials_configured():
                        st.session_state.api_status = "MIM API unavailable"
                        st.warning("MIM credentials are not configured. Showing the bundled catalogue.")
                    else:
                        try:
                            with st.spinner("Loading MIM product records and linking the instrument collection…"):
                                records, inspection = cached_mim_products()
                            st.session_state.api_products = records
                            st.session_state.api_loaded = True
                            st.session_state.api_status = "MIM products loaded"
                            adjustments = reveal_loaded_mim_candidates()
                            message = (
                                f"Loaded {len(records)} products from {inspection.product_path} and joined instruments from "
                                f"{inspection.instrument_path} by stable ID. The finest reported instrument resolution is a labelled display fallback only."
                            )
                            if adjustments:
                                message += " Display settings adjusted: " + "; ".join(adjustments) + "."
                            st.success(message)
                        except MimsApiError:
                            st.session_state.api_products = []
                            st.session_state.api_loaded = False
                            st.session_state.api_status = "MIM API unavailable"
                            st.warning("The MIM service is currently unavailable. Showing the bundled catalogue.")
            with api_b:
                st.write("")
                if st.button("Refresh MIM data", use_container_width=True):
                    cached_mim_products.clear()
                    st.session_state.api_products = []
                    st.session_state.api_loaded = False
                    st.session_state.api_status = "Bundled catalogue"
                    st.toast("Only the MIM data cache was cleared.")

        render_subsection_header("Application-screening filters", "The selected profile supplies the starting values. These are not PFS Threshold or Goal requirements.")
        basic_a, basic_b, basic_c = st.columns(3, gap="large")
        with basic_a:
            st.checkbox("Use spatial-resolution criterion", key="use_spatial")
            render_numeric_slider(
                "Maximum spatial resolution (m)",
                value_key="spatial_limit", slider_key="spatial_limit_slider",
                options=SPATIAL_SLIDER_OPTIONS, minimum=0.1, maximum=100_000.0,
                step=0.1, unit="m", disabled=not st.session_state.use_spatial,
            )
        with basic_b:
            st.checkbox(
                "Use nominal-revisit criterion",
                key="use_revisit",
                help="Nominal revisit is an expected observation opportunity, not a guaranteed delivery frequency, latency or cloud-free observation.",
            )
            render_numeric_slider(
                "Maximum nominal revisit (days)",
                value_key="revisit_limit", slider_key="revisit_limit_slider",
                options=REVISIT_SLIDER_OPTIONS, minimum=0.1, maximum=365.0,
                step=0.1, unit="days", disabled=not st.session_state.use_revisit,
            )
        with basic_c:
            st.selectbox("CEOS-ARD assessment status", ["CEOS-ARD assessed only", "All statuses", "Assessment in progress", "Not assessed or status unknown"], key="ceos_filter")

        available_products = [*local_products]
        if st.session_state.include_mim and st.session_state.api_loaded:
            available_products.extend(st.session_state.api_products)
        available_products = deduplicate_products(available_products)

        with st.expander("Advanced technical filters", expanded=False):
            adv_a, adv_b, adv_c = st.columns(3, gap="large")
            providers = sorted({product.provider for product in available_products if product.provider})
            statuses = sorted({product.operational_status for product in available_products if product.operational_status})
            sources = sorted({product.source_type for product in available_products if product.source_type})
            with adv_a:
                st.multiselect("Data provider or producer", providers, key="provider_filter")
                st.text_input("Sensor or instrument type", key="sensor_filter")
            with adv_b:
                st.checkbox("Use minimum reported bit depth", key="use_bit_depth")
                render_numeric_slider(
                    "Minimum reported radiometric bit depth",
                    value_key="min_bit_depth", slider_key="min_bit_depth_slider",
                    options=BIT_DEPTH_SLIDER_OPTIONS, minimum=1, maximum=32,
                    step=1, unit="bit", disabled=not st.session_state.use_bit_depth,
                    use_integer=True,
                )
                st.selectbox("Geographic coverage", COVERAGE_OPTIONS, key="coverage_filter")
                st.multiselect("Operational status", statuses, key="operational_filter")
            with adv_c:
                st.number_input("Mission launch or dataset start year", 1900, 2100, key="launch_year_filter", help="Records with an unreported year remain visible when unreported values are kept.")
                st.multiselect("Record source", sources, key="source_filter")
                st.checkbox("Keep records with unreported values", key="show_unknown")
        clear_spacer, clear_action = st.columns([4, 1])
        with clear_action:
            st.button("Clear filters", on_click=reset_refinements, args=(selected_profile,), use_container_width=True)

    active_profile = build_active_profile(selected_profile)
    st.session_state.active_profile = active_profile.to_dict()
    filtered_products = metadata_filter(available_products, st.session_state.family_filter)
    grouped_all = group_and_sort(filtered_products, active_profile)
    selected_mim_limit = st.session_state.get("mim_display_limit", "24")
    mim_limit = None if selected_mim_limit == "All" else int(selected_mim_limit)
    grouped = limit_mim_results(grouped_all, mim_limit)
    mim_loaded_count = len(st.session_state.api_products) if st.session_state.include_mim and st.session_state.api_loaded else 0
    mim_filtered_count = sum(product.source_type == MIM_SOURCE_TYPE for product in filtered_products)
    visible_groups = [GROUP_STRONG, GROUP_ELIGIBLE] + ([GROUP_NEAR] if st.session_state.show_near_matches else [])
    mim_visible_count = sum(
        result.product.source_type == MIM_SOURCE_TYPE
        for group_name in visible_groups
        for result in grouped[group_name]
    )
    visible_count = len(grouped[GROUP_STRONG]) + len(grouped[GROUP_ELIGIBLE]) + (len(grouped[GROUP_NEAR]) if st.session_state.show_near_matches else 0)
    with st.container(border=True):
        render_panel_marker("results")
        render_stage_header(3, "Review shortlisted products", "Inspect reported characteristics, complete a manual task check, and select up to three data product records to compare.")
        summary_col, density_col = st.columns([4, 1.3], gap="large")
        with summary_col:
            render_filter_summary(active_profile, st.session_state.family_filter, visible_count, st.session_state.api_status, filters_changed(selected_profile))
            if mim_loaded_count:
                if mim_filtered_count:
                    st.caption(
                        f"MIM: {mim_visible_count} data product tile(s) displayed from {mim_filtered_count} passing metadata filters "
                        f"({mim_loaded_count} loaded). The finest reported instrument resolution is shown as a display fallback where data product resolution is absent, "
                        "but it does not influence product matching."
                    )
                else:
                    st.warning(
                        f"All {mim_loaded_count} loaded MIM products are excluded by the current metadata filters. "
                        "Reset the advanced filters or select All statuses."
                    )
        with density_col:
            st.radio("Cards per row", [2, 3, 4], key="cards_per_row", horizontal=True)
            if mim_loaded_count:
                st.selectbox(
                    "MIM data product tile limit",
                    MIM_DISPLAY_OPTIONS,
                    index=1,
                    key="mim_display_limit",
                    help="Limits rendered API cards for browser performance; matching and loaded data are unchanged.",
                )
            st.checkbox(
                "Group by PFS or product type",
                key="group_cards_by_family",
                help="Shows separate expandable sections using the existing PFS or product-type grouping.",
            )

    def render_group(title: str, results: list, *, collapsed: bool = False) -> None:
        if not results:
            return
        render_result_heading(title, len(results))

        def render_result_grid(grid_results: list) -> None:
            cards_per_row = int(st.session_state.cards_per_row)
            for start in range(0, len(grid_results), cards_per_row):
                row = grid_results[start : start + cards_per_row]
                columns = st.columns(cards_per_row, gap="medium")
                for column, result in zip(columns, row):
                    with column:
                        render_product_card(result)

        if not st.session_state.group_cards_by_family:
            render_result_grid(results)
            return

        by_family: dict[str, list] = {}
        for result in results:
            by_family.setdefault(result.product.family, []).append(result)
        for family, family_results in sorted(by_family.items()):
            with st.expander(f"{family} · {len(family_results)} record(s)", expanded=not collapsed):
                render_result_grid(family_results)

    render_group(GROUP_STRONG, grouped[GROUP_STRONG])
    render_group(GROUP_ELIGIBLE, grouped[GROUP_ELIGIBLE])
    if not grouped[GROUP_STRONG] and not grouped[GROUP_ELIGIBLE]:
        render_empty_state(
            "No products meet the current profile criteria",
            "Show products needing a manual task check or clear the filters to broaden the catalogue while keeping the selected profile available.",
        )
    st.checkbox(
        "Show products needing a manual task check",
        key="show_near_matches",
        help="These products have an unreported value or a reported value outside one or more criteria required by the profile. This is not a CEOS-ARD assessment result.",
    )
    if st.session_state.show_near_matches:
        render_group(GROUP_NEAR, grouped[GROUP_NEAR], collapsed=True)
    render_education()

with builder_tab:
    render_page_header(
        "Profile Builder",
        "Create and manage reusable filter shortcuts",
        "Define session-only profiles with the same product, spatial and temporal filter model used on Discover.",
    )
    with st.container(border=True):
        render_panel_marker("profile")
        builder_intro, new_builder_action = st.columns([5, 1])
        with builder_intro:
            render_subsection_header(
                "Your profiles",
                "Profiles are kept for this browser session. Apply them from the carousel on Discover.",
            )
        new_builder_action.button(
            "+ New profile",
            key="builder_new_profile",
            on_click=populate_builder,
            args=(None, selected_profile),
            use_container_width=True,
        )
        if custom_profiles:
            custom_ids = [profile.id for profile in custom_profiles]
            if st.session_state.get("builder_manage_choice") not in custom_ids:
                st.session_state.builder_manage_choice = custom_ids[0]
            saved_choice, saved_edit = st.columns([5, 1])
            with saved_choice:
                builder_managed_id = st.selectbox(
                    "Saved session profile",
                    options=custom_ids,
                    format_func=lambda value: profile_by_id[value].name,
                    key="builder_manage_choice",
                )
            saved_edit.button(
                "Edit",
                key="builder_edit_saved",
                on_click=populate_builder,
                args=(profile_by_id[builder_managed_id], selected_profile),
                use_container_width=True,
            )
        else:
            st.caption("No custom profiles yet. Use the builder below to create the fourth profile tile.")

    builder_profile_id = st.session_state.get("builder_profile_id")
    editing_profile = profile_by_id.get(builder_profile_id)
    if editing_profile is not None and editing_profile.built_in:
        editing_profile = None
    with st.container(border=True):
        render_builder_panel_marker()
        render_subsection_header(
            f"Edit {editing_profile.name}" if editing_profile else "Create a custom profile",
            "These settings become editable starting values when the profile is applied.",
        )
        with st.form("custom_profile_builder_form"):
            identity_a, identity_b = st.columns([1, 1.5], gap="large")
            with identity_a:
                st.text_input("Profile name", key="builder_name")
            with identity_b:
                st.text_input("Short description", key="builder_description")

            family_column, status_column, unknown_column = st.columns([1.3, 1.2, 1], gap="large")
            with family_column:
                st.selectbox(
                    "Default product or measurement family",
                    PRODUCT_FAMILIES,
                    key="builder_family",
                    format_func=display_product_family,
                )
            with status_column:
                st.selectbox(
                    "CEOS-ARD assessment status",
                    ["CEOS-ARD assessed only", "All statuses", "Assessment in progress", "Not assessed or status unknown"],
                    key="builder_ceos_filter",
                )
            with unknown_column:
                st.checkbox("Keep unreported values eligible", key="builder_show_unknown")

            spatial_mode, spatial_value, revisit_mode, revisit_value = st.columns(4, gap="medium")
            with spatial_mode:
                st.selectbox(
                    "Spatial-detail requirement",
                    CRITERION_MODES,
                    key="builder_spatial_mode",
                    format_func=display_criterion_mode,
                )
            with spatial_value:
                st.number_input(
                    "Maximum spatial resolution (m)",
                    min_value=0.1,
                    max_value=100_000.0,
                    step=0.1,
                    key="builder_spatial_value",
                )
            with revisit_mode:
                st.selectbox(
                    "Nominal-revisit requirement",
                    CRITERION_MODES,
                    key="builder_revisit_mode",
                    format_func=display_criterion_mode,
                )
            with revisit_value:
                st.number_input(
                    "Maximum nominal revisit (days)",
                    min_value=0.1,
                    max_value=365.0,
                    step=0.1,
                    key="builder_revisit_value",
                )
            st.selectbox("Geographic coverage", COVERAGE_OPTIONS, key="builder_coverage")
            save_builder = st.form_submit_button(
                "Save changes" if editing_profile else "Create profile",
                type="primary",
                key="builder_save_profile",
            )

        if save_builder:
            clean_name = normalise_profile_name(st.session_state.builder_name)
            if error := custom_profile_name_error(clean_name, profiles, editing_profile.id if editing_profile else None):
                st.error(error)
            else:
                profile_id = editing_profile.id if editing_profile else f"custom-{uuid4().hex[:10]}"
                saved_profile = profile_from_builder(profile_id, editing_profile)
                st.session_state.custom_profiles[profile_id] = saved_profile.to_dict()
                st.session_state.builder_profile_id = profile_id
                st.session_state.pending_builder_manage_choice = profile_id
                st.session_state.profile_carousel_start = max(0, len(built_in_profiles) + len(custom_profiles) - 3)
                st.session_state.profile_action_message = (
                    "Updated the custom profile for this session."
                    if editing_profile
                    else "Created a custom profile for this session."
                )
                st.rerun()

        if editing_profile:
            delete_action, delete_note = st.columns([1, 4])
            if delete_action.button("Delete profile", key=f"builder_delete_{editing_profile.id}"):
                del st.session_state.custom_profiles[editing_profile.id]
                if st.session_state.selected_profile_id == editing_profile.id:
                    st.session_state.pending_profile_id = built_in_profiles[0].id
                    st.session_state.last_profile_id = None
                st.session_state.reset_builder_draft = True
                st.session_state.profile_action_message = "Deleted the custom profile."
                st.rerun()
            with delete_note:
                st.caption("Deleting removes this profile from the current session only.")

with compare_tab:
    render_page_header(
        "Compare",
        "Compare selected product records",
        "Review reported data product characteristics side by side. This comparison supports a manual task check; highlighted differences are not rankings.",
    )
    all_known = {product.id: product for product in [*local_products, *st.session_state.api_products]}
    selected_products = [all_known[item] for item in st.session_state.comparison_ids if item in all_known][:3]
    comparison_profile = Profile.from_dict(st.session_state.get("active_profile", selected_profile.to_dict()))
    with st.container(border=True):
        render_panel_marker("compare-intro")
        render_subsection_header("Side-by-side technical comparison", "Differences support further investigation; they are not treated as errors, quality scores or rankings.")
        st.caption(f"{len(selected_products)} of 3 comparison positions selected")
    render_comparison(selected_products, comparison_profile)
