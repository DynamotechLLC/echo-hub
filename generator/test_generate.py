"""Run: python3 -m unittest discover -s generator -v"""
import copy
import json
import subprocess
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import generate as g  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
LAYOUT = {
    "favorites": ["lock.front_door", {"entity": "light.kitchen_ceiling", "name": "Kitchen", "template": "echo-light-tall"}],
    "rooms": [{"area": "kitchen", "title": "Kitchen", "icon": "mdi:stove"}, {"area": "lock", "title": "Bedroom"}],
    "cameras": ["camera.front_door", {"entity": "camera.backyard", "name": "Back", "ptz": "back"}],
    "doors": ["binary_sensor.front_door"], "lock": "lock.front_door", "climate": "climate.thermostat",
    "weather": "weather.home", "forecast_sensor": "sensor.forecast", "kiosk_users": ["Panel"],
}


class GenerateTest(unittest.TestCase):
    def setUp(self):
        self.templates = g.load_templates()
        self.config = g.build(self.templates, LAYOUT)

    def test_real_templates_validate(self):
        self.assertEqual(g.validate(self.config), [])

    def test_kiosk_only_when_users_given(self):
        self.assertEqual(self.config["kiosk_mode"], {"user_settings": [{"users": ["Panel"], "kiosk": True}]})
        self.assertNotIn("kiosk_mode", g.build(self.templates, {**LAYOUT, "kiosk_users": []}))

    def test_room_ids_prefixed_and_unique(self):
        self.assertEqual(g.room_panel_ids(self.config), ["fav", "a_kitchen", "a_lock", "cameras"])
        bad = {**LAYOUT, "rooms": [{"area": "kitchen", "title": "A"}, {"area": "kitchen", "title": "B"}]}
        with self.assertRaises(ValueError):
            g.build(self.templates, bad)

    def test_room_body_filters(self):
        body = g.find_panel(self.config, "a_kitchen")["custom_fields"]["body"]["card"]
        self.assertEqual(body["type"], "custom:auto-entities")
        self.assertEqual(body["card_param"], "cards")
        self.assertEqual([f["domain"] for f in body["filter"]["include"]], ["light", "fan", "switch", "media_player"])
        excl = body["filter"]["exclude"]
        # auto-entities rejects entity_category rules and then renders nothing
        self.assertFalse(any("entity_category" in rule for rule in excl))
        self.assertIn({"entity_id": "media_player.everywhere"}, excl)
        self.assertIn({"entity_id": "*_segment_*"}, excl)

    def test_rows_use_max_content_columns(self):
        # auto columns stretch when the row is short, so the first pill grew to hundreds of px
        for key in ("dock", "rail"):
            row = g.shell(self.config)["custom_fields"][key]["card"]
            n = len(row["custom_fields"])
            self.assertIn({"grid-template-columns": "repeat(%d, max-content) 0px" % n}, row["styles"]["grid"])

    def test_media_pill_gets_exclude(self):
        pill = g.dock_card(self.config, "media")
        self.assertEqual(pill["variables"]["exclude"], g.DEFAULT_MEDIA_EXCLUDE)

    def test_weather_and_forecast_wired(self):
        top, side = g.shell(self.config)["custom_fields"]["top"]["card"], g.shell(self.config)["custom_fields"]["side"]["card"]
        self.assertEqual(top["entity"], "weather.home")
        self.assertEqual(side["variables"]["forecast_sensor"], "sensor.forecast")

    def test_no_weather_has_no_entity(self):
        cfg = g.build(self.templates, {**LAYOUT, "weather": None, "forecast_sensor": None})
        self.assertNotIn("entity", g.shell(cfg)["custom_fields"]["top"]["card"])
        self.assertNotIn("variables", g.shell(cfg)["custom_fields"]["side"]["card"])

    def test_optional_pills_omitted(self):
        cfg = g.build(self.templates, {"rooms": []})
        keys = list(g.shell(cfg)["custom_fields"]["dock"]["card"]["custom_fields"])
        self.assertEqual(keys, ["home", "overview", "media", "lights"])
        self.assertEqual(len(cfg["views"]), 1)

    def test_empty_home_renders(self):
        cfg = g.build(self.templates, {})
        self.assertEqual(g.validate(cfg), [])
        self.assertEqual(g.room_panel_ids(cfg), ["fav"])

    def test_cameras_view_advanced_and_picture(self):
        cams = self.config["views"][1]["cards"][0]["custom_fields"]["cams"]["card"]
        self.assertEqual(cams["type"], "custom:advanced-camera-card")
        self.assertEqual(cams["cameras"][1]["ptz"]["actions_left"]["target"]["entity_id"], "button.back_move_left")
        pic = g.build(self.templates, {**LAYOUT, "camera_card": "picture"})
        grid = pic["views"][1]["cards"][0]["custom_fields"]["cams"]["card"]
        self.assertEqual([c["type"] for c in grid["cards"]], ["picture-entity", "picture-entity"])
        tile = g.find_panel(pic, "cameras")["custom_fields"]["body"]["card"]["cards"][0]
        self.assertEqual(tile["tap_action"], {"action": "more-info"})

    def test_view_navigation_is_relative(self):
        pill = g.dock_card(self.config, "nav_cameras")
        self.assertEqual((pill["template"], pill["variables"]["view"]), ("echo-pill-view", "cameras"))
        home = self.config["views"][1]["cards"][0]["custom_fields"]["home"]["card"]
        self.assertEqual((home["template"], home["variables"]["view"]), ("echo-round-view", "home"))

    def test_unsupported_domain_falls_back(self):
        cfg = g.build(self.templates, {"favorites": ["sensor.temp", "cover.garage"]})
        cards = g.find_panel(cfg, "fav")["custom_fields"]["body"]["card"]["cards"]
        self.assertEqual([(c["template"], c["tap_action"]) for c in cards], [("echo-base", {"action": "more-info"})] * 2)
        self.assertEqual(g.validate(cfg), [])

    def test_validate_flags_js_under_views(self):
        bad = copy.deepcopy(self.config)
        bad["views"][0]["cards"][0]["name"] = "[[[ return 1 ]]]"
        self.assertTrue(any(e.startswith("JS template under views") for e in g.validate(bad)))

    def test_unknown_key_rejected(self):
        with self.assertRaises(ValueError):
            g.normalize({"favourites": []})

    def test_cli_json_from_stdin(self):
        out = subprocess.run([sys.executable, str(ROOT / "generator" / "generate.py"), "-", "--json"],
                             input=json.dumps(LAYOUT), capture_output=True, text=True, check=True).stdout
        self.assertEqual(json.loads(out)["views"][0]["path"], "home")


if __name__ == "__main__":
    unittest.main()
