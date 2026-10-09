import unittest
from pathlib import Path
import yaml

SRC = Path(__file__).resolve().parents[1] / "src" / "templates.yaml"
PRIVATE = ["sensor.echo_hub_clock", "sensor.echo_hub_forecast", "/echo-hub/cameras", "Tablet", "dashboards/"]


class TemplatesTest(unittest.TestCase):
    def setUp(self):
        self.text = SRC.read_text()
        self.t = yaml.safe_load(self.text)

    def test_no_private_references(self):
        for word in PRIVATE:
            self.assertNotIn(word, self.text, word)

    def test_new_view_templates(self):
        for name in ("echo-pill-view", "echo-round-view"):
            self.assertIn("location.pathname", self.t[name]["tap_action"]["navigation_path"])
            self.assertEqual(self.t[name]["variables"]["view"], "home")

    def test_camera_tile_navigates_relative(self):
        path = self.t["echo-camera"]["tap_action"]["navigation_path"]
        self.assertIn("location.pathname", path)
        self.assertIn("/cameras?advanced-camera-card-action.cams.camera_select=", path)

    def test_weather_updates_without_helpers(self):
        self.assertEqual(self.t["echo-weather"]["triggers_update"], "all")
        self.assertIn("forecast_sensor", self.t["echo-weather"]["variables"])
        self.assertIn("variables.forecast_sensor", self.t["echo-side"]["custom_fields"]["wx"])
        self.assertIn("new Date()", self.t["echo-topbar"]["custom_fields"]["now"])

    def test_media_pill_uses_exclude_variable(self):
        pill = self.t["echo-pill-media"]
        self.assertEqual(pill["variables"]["exclude"], [])
        self.assertIn("variables.exclude", pill["label"])


    def test_topbar_overview_uses_variable(self):
        top = self.t["echo-topbar"]
        self.assertEqual(top["variables"]["overview_path"], "/lovelace")
        self.assertIn("variables.overview_path", top["custom_fields"]["overview"]["card"]["tap_action"]["navigation_path"])


class WorkflowsTest(unittest.TestCase):
    def test_release_runs_tests_first(self):
        steps = yaml.safe_load((SRC.parents[1] / ".github/workflows/release.yml").read_text())["jobs"]["release"]["steps"]
        runs = " ".join(s.get("run", "") for s in steps)
        for cmd in ("unittest discover -s tests", "unittest discover -s generator", "npm test", "check-generated.sh"):
            self.assertIn(cmd, runs.split("gh release create")[0])

    def test_hacs_action_pinned(self):
        for wf in ("ci.yml",):
            text = (SRC.parents[1] / ".github/workflows" / wf).read_text()
            self.assertNotIn("hacs/action@main", text)


if __name__ == "__main__":
    unittest.main()
