"""Focused regression coverage for bundled profile defaults and selection state."""

from __future__ import annotations

import re
import unittest

from streamlit.testing.v1 import AppTest

from catalogue import load_profiles
from models import Profile


PROFILE_BUTTON_KEYS = {
    "profile_select_explore-ceos-ard",
    "profile_select_map-land-features",
    "profile_select_monitor-change",
}


def rendered_product_titles(app: AppTest) -> list[str]:
    return sorted(
        match.group(1)
        for item in app.markdown
        if (match := re.search(r'<div class="product-title">([^<]+)</div>', item.value))
    )


class ProfileDefinitionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.profiles = {profile.id: profile for profile in load_profiles()}

    def test_only_three_new_bundled_profiles_are_available(self) -> None:
        self.assertEqual(
            [profile.name for profile in load_profiles()],
            ["Explore CEOS-ARD Products", "Map Land and Features", "Monitor Change Over Time"],
        )

    def test_explore_has_broad_defaults_and_no_revisit_requirement(self) -> None:
        profile = self.profiles["explore-ceos-ard"]
        self.assertEqual(profile.default_product_family, "All product families")
        self.assertEqual(profile.product_families, ["Surface Reflectance", "Surface Temperature", "Synthetic Aperture Radar"])
        self.assertEqual(profile.criteria["spatial_resolution_m"], {"mode": "preferred", "value": 30})
        self.assertEqual(profile.criteria["revisit_days"]["mode"], "not_used")
        self.assertEqual(profile.criteria["radiometric_bit_depth"]["mode"], "not_used")

    def test_map_has_surface_reflectance_and_required_spatial_and_revisit_defaults(self) -> None:
        profile = self.profiles["map-land-features"]
        self.assertEqual(profile.default_product_family, "Surface Reflectance")
        self.assertEqual(profile.criteria["spatial_resolution_m"], {"mode": "required", "value": 10})
        self.assertEqual(profile.criteria["revisit_days"], {"mode": "required", "value": 30})

    def test_monitor_has_surface_reflectance_rapid_revisit_and_preferred_spatial_defaults(self) -> None:
        profile = self.profiles["monitor-change"]
        self.assertEqual(profile.default_product_family, "Surface Reflectance")
        self.assertEqual(profile.criteria["spatial_resolution_m"], {"mode": "preferred", "value": 30})
        self.assertEqual(profile.criteria["revisit_days"], {"mode": "required", "value": 5})


class ProfileInteractionTests(unittest.TestCase):
    def app(self) -> AppTest:
        return AppTest.from_file("app.py", default_timeout=30).run()

    def test_profile_section_exposes_only_the_three_bundled_profile_actions(self) -> None:
        app = self.app()
        self.assertFalse(app.exception)
        keys = {button.key for button in app.button if button.key and button.key.startswith("profile_select_")}
        self.assertEqual(keys, PROFILE_BUTTON_KEYS)
        self.assertFalse(any(item.label == "Use-case profile" for item in app.selectbox))
        markdown = "\n".join(item.value for item in app.markdown)
        self.assertNotIn("Radiometric screening", markdown)
        self.assertNotIn("Geometric screening", markdown)
        self.assertNotIn("PFS baseline", markdown)
        self.assertNotIn("Application-screening profile", markdown)
        self.assertIn("All product types · Prefer ≤30 m · Any revisit", markdown)
        self.assertIn("Create a profile", markdown)
        self.assertFalse(any(item.key == "apply_custom_profile" for item in app.button))
        self.assertFalse(any(item.key == "save_current_profile" for item in app.button))

    def test_explore_initialises_broad_editable_filters(self) -> None:
        app = self.app()
        self.assertEqual(app.session_state["selected_profile_id"], "explore-ceos-ard")
        self.assertEqual(app.session_state["family_filter"], "All product families")
        self.assertTrue(app.session_state["use_spatial"])
        self.assertEqual(app.session_state["spatial_limit"], 30.0)
        self.assertFalse(app.session_state["use_revisit"])
        self.assertEqual(app.session_state["active_profile"]["criteria"]["revisit_days"]["mode"], "not_used")
        self.assertEqual(app.session_state["active_profile"]["criteria"]["spatial_resolution_m"]["mode"], "preferred")
        self.assertEqual(app.session_state["ceos_filter"], "CEOS-ARD assessed only")
        self.assertTrue(app.session_state["show_unknown"])

    def test_map_defaults_remain_editable_until_deliberately_reset(self) -> None:
        app = self.app()
        app.button(key="profile_select_map-land-features").click().run()

        self.assertEqual(app.session_state["selected_profile_id"], "map-land-features")
        self.assertEqual(app.session_state["family_filter"], "Surface Reflectance")
        self.assertTrue(app.session_state["use_spatial"])
        self.assertEqual(app.session_state["spatial_limit"], 10.0)
        self.assertTrue(app.session_state["use_revisit"])
        self.assertEqual(app.session_state["revisit_limit"], 30.0)
        self.assertEqual(app.session_state["active_profile"]["criteria"]["spatial_resolution_m"]["mode"], "required")
        self.assertEqual(app.session_state["active_profile"]["criteria"]["revisit_days"]["mode"], "required")

        baseline_titles = rendered_product_titles(app)
        app.selectbox(key="family_filter").select("Synthetic Aperture Radar").run()
        self.assertEqual(app.session_state["family_filter"], "Synthetic Aperture Radar")
        app.run()
        self.assertEqual(app.session_state["family_filter"], "Synthetic Aperture Radar")

        app.selectbox(key="family_filter").select("Surface Reflectance").run()
        self.assertEqual(rendered_product_titles(app), baseline_titles)

        app.selectbox(key="family_filter").select("Surface Temperature").run()
        app.button(key="profile_select_map-land-features").click().run()
        self.assertEqual(app.session_state["family_filter"], "Surface Reflectance")
        self.assertEqual(app.session_state["spatial_limit"], 10.0)
        self.assertEqual(app.session_state["revisit_limit"], 30.0)

    def test_monitor_defaults_remain_editable_on_unrelated_reruns(self) -> None:
        app = self.app()
        app.button(key="profile_select_monitor-change").click().run()

        self.assertEqual(app.session_state["selected_profile_id"], "monitor-change")
        self.assertEqual(app.session_state["family_filter"], "Surface Reflectance")
        self.assertEqual(app.session_state["spatial_limit"], 30.0)
        self.assertEqual(app.session_state["revisit_limit"], 5.0)
        self.assertTrue(app.session_state["use_spatial"])
        self.assertTrue(app.session_state["use_revisit"])
        self.assertEqual(app.session_state["active_profile"]["criteria"]["spatial_resolution_m"]["mode"], "preferred")
        self.assertEqual(app.session_state["active_profile"]["criteria"]["revisit_days"]["mode"], "required")

        app.selectbox(key="family_filter").select("Synthetic Aperture Radar").run()
        app.run()
        self.assertEqual(app.session_state["family_filter"], "Synthetic Aperture Radar")
        self.assertEqual(app.session_state["revisit_limit"], 5.0)

        app.button(key="profile_select_monitor-change").click().run()
        self.assertEqual(app.session_state["family_filter"], "Surface Reflectance")
        self.assertEqual(app.session_state["revisit_limit"], 5.0)

    def test_custom_profile_can_be_created_applied_renamed_updated_and_deleted(self) -> None:
        app = self.app()
        app.button(key="create_custom_profile").click().run()
        self.assertEqual(app.session_state["main_navigation"], "Profile Builder")
        app.text_input(key="builder_name").set_value("Radar shortlist")
        app.text_input(key="builder_description").set_value("Reusable radar filters")
        app.selectbox(key="builder_family").select("Synthetic Aperture Radar")
        app.selectbox(key="builder_spatial_mode").select("required")
        app.number_input(key="builder_spatial_value").set_value(20.0)
        app.button(key="builder_save_profile").click().run()

        self.assertFalse(app.exception)
        self.assertEqual(len(app.session_state["custom_profiles"]), 1)
        profile_id = next(iter(app.session_state["custom_profiles"]))
        saved = app.session_state["custom_profiles"][profile_id]
        self.assertEqual(saved["default_product_family"], "Synthetic Aperture Radar")
        self.assertEqual(set(saved["criteria"]), set(load_profiles()[0].criteria))
        self.assertEqual(saved["criteria"]["spatial_resolution_m"], {"mode": "required", "value": 20.0})

        app.selectbox(key="family_filter").select("Surface Reflectance").run()
        app.button(key=f"profile_apply_{profile_id}").click().run()
        self.assertEqual(app.session_state["family_filter"], "Synthetic Aperture Radar")
        app.selectbox(key="family_filter").select("Surface Reflectance").run()
        app.run()
        self.assertEqual(app.session_state["family_filter"], "Surface Reflectance")
        app.button(key=f"profile_apply_{profile_id}").click().run()
        self.assertEqual(app.session_state["family_filter"], "Synthetic Aperture Radar")

        app.button(key=f"profile_edit_{profile_id}").click().run()
        self.assertEqual(app.session_state["main_navigation"], "Profile Builder")
        app.text_input(key="builder_name").set_value("Renamed radar shortlist")
        app.selectbox(key="builder_family").select("Surface Temperature")
        app.button(key="builder_save_profile").click().run()
        self.assertEqual(app.session_state["custom_profiles"][profile_id]["name"], "Renamed radar shortlist")
        self.assertEqual(app.session_state["custom_profiles"][profile_id]["default_product_family"], "Surface Temperature")

        app.selectbox(key="family_filter").select("Surface Reflectance").run()
        app.button(key=f"profile_apply_{profile_id}").click().run()
        self.assertEqual(app.session_state["family_filter"], "Surface Temperature")

        app.button(key=f"profile_edit_{profile_id}").click().run()
        app.button(key=f"builder_delete_{profile_id}").click().run()
        self.assertEqual(app.session_state["custom_profiles"], {})
        self.assertEqual(app.session_state["selected_profile_id"], "explore-ceos-ard")

    def test_existing_session_profile_remains_available(self) -> None:
        existing = Profile(
            id="custom-existing",
            name="Existing session profile",
            description="Loaded from the existing session-state format.",
            use_case_category="User-defined profile",
            product_families=["Surface Temperature"],
            default_product_family="Surface Temperature",
            criteria=load_profiles()[0].criteria,
            built_in=False,
        )
        app = AppTest.from_file("app.py", default_timeout=30)
        app.session_state["custom_profiles"] = {existing.id: existing.to_dict()}
        app.run()

        self.assertFalse(app.exception)
        self.assertIsNotNone(app.button(key="profile_apply_custom-existing"))
        app.button(key="profile_apply_custom-existing").click().run()
        self.assertEqual(app.session_state["family_filter"], "Surface Temperature")

    def test_carousel_shows_four_tiles_and_scrolls_to_additional_profiles(self) -> None:
        template = load_profiles()[0]
        saved_profiles = {}
        for index in range(3):
            profile = Profile(
                id=f"custom-{index}",
                name=f"Session profile {index + 1}",
                description="Reusable session profile.",
                use_case_category="User-defined profile",
                product_families=["Surface Reflectance"],
                default_product_family="Surface Reflectance",
                criteria=template.criteria,
                built_in=False,
            )
            saved_profiles[profile.id] = profile.to_dict()
        app = AppTest.from_file("app.py", default_timeout=30)
        app.session_state["custom_profiles"] = saved_profiles
        app.run()

        visible_custom_actions = [
            button.key for button in app.button if button.key and button.key.startswith("profile_apply_custom-")
        ]
        self.assertEqual(visible_custom_actions, ["profile_apply_custom-0"])
        self.assertFalse(app.button(key="profile_carousel_next").disabled)

        app.button(key="profile_carousel_next").click().run()
        self.assertEqual(app.session_state["profile_carousel_start"], 1)
        visible_custom_actions = [
            button.key for button in app.button if button.key and button.key.startswith("profile_apply_custom-")
        ]
        self.assertEqual(visible_custom_actions, ["profile_apply_custom-0", "profile_apply_custom-1"])


if __name__ == "__main__":
    unittest.main()
