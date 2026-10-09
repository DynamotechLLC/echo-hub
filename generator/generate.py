#!/usr/bin/env python3
"""Echo Hub generator: layout.yaml -> Home Assistant dashboard config.

  python3 generator/generate.py layout.yaml          YAML on stdout (paste into the raw configuration editor)
  python3 generator/generate.py layout.yaml --json   JSON on stdout
  python3 generator/generate.py - < layout.yaml      read the layout from stdin

All button-card JavaScript lives in src/templates.yaml; validate() rejects JS under views.
"""
import json
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
TEMPLATES = ROOT / "src" / "templates.yaml"
BUTTON = "custom:button-card"
REQUIRED_TEMPLATES = [
    "echo-shell", "echo-topbar", "echo-round", "echo-side", "echo-rail", "echo-panel", "echo-dock",
    "echo-pill", "echo-nav", "echo-pill-media", "echo-pill-doors", "echo-pill-lock", "echo-pill-climate",
    "echo-pill-lights", "echo-room", "echo-light", "echo-light-tall", "echo-fan", "echo-plug", "echo-media",
    "echo-lock", "echo-camera", "echo-thermostat", "echo-step", "echo-camshell", "echo-pill-view", "echo-round-view",
]
DOMAIN_TEMPLATES = {
    "light": "echo-light", "fan": "echo-fan", "switch": "echo-plug", "media_player": "echo-media",
    "lock": "echo-lock", "camera": "echo-camera", "climate": "echo-thermostat",
}
ROOM_DOMAINS = ["light", "fan", "switch", "media_player"]
RESERVED_IDS = {"aspect-ratio", "card", "container", "img-cell", "icon", "name", "state", "label", "lock", "overlay"}
DEFAULT_MEDIA_EXCLUDE = ["media_player.this_device*", "media_player.everywhere"]
CAMERA_CARD_ID = "cams"
DEFAULTS = {
    "favorites": [], "rooms": [], "cameras": [], "doors": [], "lock": None, "climate": None, "weather": None,
    "forecast_sensor": None, "media_exclude": DEFAULT_MEDIA_EXCLUDE, "kiosk_users": [], "camera_card": "advanced",
    "overview_path": "/lovelace",
}


def load_templates():
    return yaml.safe_load(TEMPLATES.read_text())


def _tile_item(item):
    return {"entity": item} if isinstance(item, str) else dict(item)


def normalize(layout):
    layout = layout or {}
    unknown = sorted(set(layout) - set(DEFAULTS))
    if unknown:
        raise ValueError("unknown layout keys: " + ", ".join(unknown))
    out = {key: layout.get(key, value) for key, value in DEFAULTS.items()}
    for key in ("favorites", "rooms", "cameras", "doors", "media_exclude", "kiosk_users"):
        out[key] = list(out[key] or [])
    out["favorites"] = [_tile_item(i) for i in out["favorites"]]
    out["cameras"] = [_tile_item(i) for i in out["cameras"]]
    rooms, seen = [], set()
    for room in out["rooms"]:
        r = {"id": room.get("id") or "a_" + room["area"], "area": room["area"], "title": room["title"],
             "icon": room.get("icon") or "mdi:home", "extra": list(room.get("extra", []))}
        if r["id"] in seen or r["id"] in RESERVED_IDS or r["id"] in ("fav", "cameras"):
            raise ValueError("duplicate or reserved room id: " + r["id"])
        seen.add(r["id"])
        rooms.append(r)
    out["rooms"] = rooms
    if out["camera_card"] not in ("advanced", "picture"):
        raise ValueError("camera_card must be advanced or picture")
    return out


def template_for(entity_id):
    domain = entity_id.split(".", 1)[0]
    if domain not in DOMAIN_TEMPLATES:
        raise ValueError("no Echo template for domain: " + domain)
    return DOMAIN_TEMPLATES[domain]


def button(template, **extra):
    card = {"type": BUTTON, "template": template}
    card.update(extra)
    return card


def tile(item, layout):
    extra = {"entity": item["entity"]}
    if item.get("name"):
        extra["name"] = item["name"]
    template = item.get("template") or template_for(item["entity"])
    if template == "echo-camera" and layout["camera_card"] == "picture":
        extra["tap_action"] = {"action": "more-info"}
    return button(template, **extra)


def grid(cards):
    return {"type": "grid", "columns": 2, "square": False, "cards": cards}


def panel(title, body):
    return button("echo-panel", name=title, custom_fields={"body": {"card": body}})


def camera_entry(cam):
    entry = {"camera_entity": cam["entity"], "id": cam["entity"],
             "dimensions": {"aspect_ratio": "16:9", "layout": {"fit": "cover"}}}
    if cam.get("name"):
        entry["title"] = cam["name"]
    if cam.get("ptz"):
        entry["ptz"] = {"actions_" + d: {"action": "perform-action", "perform_action": "button.press",
                                          "target": {"entity_id": "button.%s_move_%s" % (cam["ptz"], d)}}
                        for d in ("left", "right", "up", "down")}
    return entry


def cameras_view(layout):
    if layout["camera_card"] == "advanced":
        card = {"type": "custom:advanced-camera-card", "card_id": CAMERA_CARD_ID,
                "cameras": [camera_entry(c) for c in layout["cameras"]],
                "live": {"display": {"mode": "grid", "grid_columns": 4, "grid_selected_width_factor": 1},
                         "lazy_load": False, "controls": {"thumbnails": {"mode": "none"}}},
                "dimensions": {"aspect_ratio_mode": "unconstrained"}}
    else:
        card = {"type": "grid", "columns": 3, "square": False,
                "cards": [{"type": "picture-entity", "entity": c["entity"], "camera_view": "live",
                           **({"name": c["name"]} if c.get("name") else {})} for c in layout["cameras"]]}
    shell = button("echo-camshell", name="Cameras", custom_fields={
        "home": {"card": button("echo-round-view", icon="mdi:home", variables={"view": "home"})},
        "cams": {"card": card}})
    return {"title": "Cameras", "path": "cameras", "type": "panel", "cards": [shell]}


def room_body(room, layout):
    def by_domain(domain):
        return {"area": room["area"], "domain": domain, "options": {"type": BUTTON, "template": DOMAIN_TEMPLATES[domain]}}

    include = [by_domain(d) for d in ROOM_DOMAINS]
    for entity_id in room["extra"]:
        include.append({"entity_id": entity_id, "options": {"type": BUTTON, "template": template_for(entity_id)}})
    exclude = [{"entity_id": "*_segment_*"}] + [{"entity_id": p} for p in layout["media_exclude"]]
    exclude += [{"hidden_by": "user"}, {"hidden_by": "integration"},
                {"entity_category": "config"}, {"entity_category": "diagnostic"}]
    return {"type": "custom:auto-entities", "show_empty": True,
            "card": {"type": "grid", "columns": 2, "square": False}, "card_param": "cards",
            "entities": [button("echo-room", name=room["title"], variables={"area": room["area"], "extra": room["extra"]})],
            "filter": {"include": include, "exclude": exclude}}


def anchored_row(template, cards, gap_key):
    keys = [key for key, _ in cards]
    return button(template, custom_fields={key: {"card": card} for key, card in cards},
                  styles={"grid": [{"grid-template-areas": '"' + " ".join(keys) + " " + gap_key + '"'}]})


def build(templates, layout, room_bodies=None):
    """room_bodies: optional {room_id: card} replacing the auto-entities bodies (used by the strategy cross-check)."""
    layout = normalize(layout)
    rooms = layout["rooms"]
    panels = [("fav", panel("Favorites", grid([tile(i, layout) for i in layout["favorites"]])))]
    for r in rooms:
        body = (room_bodies or {}).get(r["id"]) or room_body(r, layout)
        panels.append((r["id"], panel(r["title"], body)))
    if layout["cameras"]:
        panels.append(("cameras", panel("Cameras", grid([tile({**c, "template": "echo-camera"}, layout) for c in layout["cameras"]]))))
    pills = [("home", button("echo-nav", icon="mdi:home", variables={"target": "fav", "home": True})),
             ("overview", button("echo-pill", name="Overview", icon="mdi:view-dashboard",
                                 tap_action={"action": "navigate", "navigation_path": layout["overview_path"]}))]
    pills += [("nav_" + r["id"], button("echo-nav", name=r["title"], icon=r["icon"], variables={"target": r["id"]})) for r in rooms]
    if layout["cameras"]:
        pills.append(("nav_cameras", button("echo-pill-view", name="Cameras", icon="mdi:cctv", variables={"view": "cameras"})))
    pills.append(("media", button("echo-pill-media", variables={"exclude": list(layout["media_exclude"])})))
    if layout["doors"]:
        pills.append(("doors", button("echo-pill-doors", variables={"doors": list(layout["doors"])})))
    if layout["lock"]:
        pills.append(("lockpill", button("echo-pill-lock", entity=layout["lock"])))
    if layout["climate"]:
        pills.append(("climate", button("echo-pill-climate", entity=layout["climate"])))
    pills.append(("lights", button("echo-pill-lights")))
    top, side = button("echo-topbar"), button("echo-side")
    if layout["weather"]:
        top["entity"] = side["entity"] = layout["weather"]
    if layout["forecast_sensor"]:
        side["variables"] = {"forecast_sensor": layout["forecast_sensor"]}
    shell = button("echo-shell", custom_fields={"top": {"card": top}, "side": {"card": side},
                                                "rail": {"card": anchored_row("echo-rail", panels, "reg")},
                                                "dock": {"card": anchored_row("echo-dock", pills, "end")}})
    config = {}
    if layout["kiosk_users"]:
        config["kiosk_mode"] = {"user_settings": [{"users": list(layout["kiosk_users"]), "kiosk": True}]}
    config["button_card_templates"] = templates
    config["views"] = [{"title": "Echo Hub", "path": "home", "type": "panel", "cards": [shell]}]
    if layout["cameras"]:
        config["views"].append(cameras_view(layout))
    return config


def shell(config):
    return config["views"][0]["cards"][0]


def room_panel_ids(config):
    return list(shell(config)["custom_fields"]["rail"]["card"]["custom_fields"].keys())


def find_panel(config, panel_id):
    return shell(config)["custom_fields"]["rail"]["card"]["custom_fields"][panel_id]["card"]


def dock_card(config, key):
    return shell(config)["custom_fields"]["dock"]["card"]["custom_fields"][key]["card"]


def _walk(node):
    if isinstance(node, dict):
        yield node
        for value in node.values():
            yield from _walk(value)
    elif isinstance(node, list):
        for value in node:
            yield from _walk(value)


def _strings(node):
    if isinstance(node, str):
        yield node
    elif isinstance(node, (dict, list)):
        for value in (node.values() if isinstance(node, dict) else node):
            yield from _strings(value)


def validate(config):
    errors = []
    templates = config.get("button_card_templates", {})
    for name in REQUIRED_TEMPLATES:
        if name not in templates:
            errors.append("missing template: " + name)
    for node in _walk([config["views"], templates]):
        refs = node.get("template")
        for ref in refs if isinstance(refs, list) else [refs] if refs else []:
            if ref not in templates:
                errors.append("unknown template: " + ref)
    for text in _strings(config["views"]):
        if "[[[" in text:
            errors.append("JS template under views: " + text[:40])
    for node in _walk(config["views"]):
        for key in (node.get("custom_fields") or {}):
            if key in RESERVED_IDS:
                errors.append("reserved custom field id: " + key)
    ids = room_panel_ids(config)
    if len(ids) != len(set(ids)):
        errors.append("duplicate panel id")
    for field in shell(config)["custom_fields"]["dock"]["card"]["custom_fields"].values():
        pill = field["card"]
        if pill.get("template") == "echo-nav" and pill["variables"]["target"] not in ids:
            errors.append("nav target without panel: " + str(pill["variables"]["target"]))
    return errors


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0 if argv else 2
    text = sys.stdin.read() if argv[0] == "-" else Path(argv[0]).read_text()
    config = build(load_templates(), yaml.safe_load(text) or {})
    errors = validate(config)
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    if "--json" in argv:
        print(json.dumps(config))
    else:
        print(yaml.safe_dump(config, sort_keys=False, allow_unicode=True, width=120), end="")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
