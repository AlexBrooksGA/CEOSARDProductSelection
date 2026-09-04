"""Focused regression coverage for the public CEOS-ARD terminology."""

from __future__ import annotations

import json
from pathlib import Path
import unittest

from streamlit.testing.v1 import AppTest

from matching import GROUP_ELIGIBLE, GROUP_NEAR, GROUP_STRONG


class TerminologyTests(unittest.TestCase):
    def test_profile_names_and_application_boundary(self) -> None:
        profiles = json.loads(Path("data/default_profiles.json").read_text(encoding="utf-8"))
        self.assertEqual(
            [profile["name"] for profile in profiles],
            ["Explore CEOS-ARD Products", "Map Land and Features", "Monitor Change Over Time"],
        )
        self.assertTrue(all("CEOS-ARD assessed" in profile["description"] for profile in profiles))
        self.assertTrue(all("suitable" not in profile["description"].casefold() for profile in profiles))

    def test_result_groups_do_not_imply_quality_or_application_eligibility(self) -> None:
        self.assertEqual(GROUP_STRONG, "Closer profile matches")
        self.assertEqual(GROUP_ELIGIBLE, "Other products meeting required profile criteria")
        self.assertEqual(GROUP_NEAR, "Manual task check")

    def test_default_interface_states_assessment_boundary_and_revisit_term(self) -> None:
        app = AppTest.from_file("app.py", default_timeout=30).run()
        self.assertFalse(app.exception)
        self.assertEqual([tab.label for tab in app.tabs], ["Discover", "Profile Builder", "Compare"])
        markdown = "\n".join(item.value for item in app.markdown)
        self.assertIn("How do you want to use CEOS-ARD products?", markdown)
        self.assertIn("A CEOS-ARD assessment does not certify application suitability", markdown)
        self.assertIn("Nominal revisit", markdown)
        self.assertNotIn("Revisit / update", markdown)


if __name__ == "__main__":
    unittest.main()
