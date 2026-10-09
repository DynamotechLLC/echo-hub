import type { Layout, Room, Tile } from "./types";

const BUTTON = "custom:button-card";
const CAMERA_CARD_ID = "cams";
const DOMAIN_TEMPLATES: Record<string, string> = {
  light: "echo-light", fan: "echo-fan", switch: "echo-plug", media_player: "echo-media",
  lock: "echo-lock", camera: "echo-camera", climate: "echo-thermostat",
};
type Card = Record<string, any>;

const templateFor = (id: string) => {
  const t = DOMAIN_TEMPLATES[id.split(".", 1)[0]];
  if (!t) throw new Error("no Echo template for domain: " + id.split(".", 1)[0]);
  return t;
};
const button = (template: string, extra: Card = {}): Card => ({ type: BUTTON, template, ...extra });
const grid = (cards: Card[]): Card => ({ type: "grid", columns: 2, square: false, cards });
const panel = (title: string, body: Card) => button("echo-panel", { name: title, custom_fields: { body: { card: body } } });

function tile(item: Tile, layout: Layout): Card {
  const extra: Card = { entity: item.entity };
  if (item.name) extra.name = item.name;
  const template = item.template || templateFor(item.entity);
  if (template === "echo-camera" && layout.camera_card === "picture") extra.tap_action = { action: "more-info" };
  return button(template, extra);
}

function cameraEntry(cam: Tile): Card {
  const entry: Card = { camera_entity: cam.entity, id: cam.entity, dimensions: { aspect_ratio: "16:9", layout: { fit: "cover" } } };
  if (cam.name) entry.title = cam.name;
  if (cam.ptz) {
    entry.ptz = Object.fromEntries(["left", "right", "up", "down"].map((d) => ["actions_" + d,
      { action: "perform-action", perform_action: "button.press", target: { entity_id: `button.${cam.ptz}_move_${d}` } }]));
  }
  return entry;
}

function camerasView(layout: Layout): Card {
  const card: Card = layout.camera_card === "advanced"
    ? { type: "custom:advanced-camera-card", card_id: CAMERA_CARD_ID, cameras: layout.cameras.map(cameraEntry),
        live: { display: { mode: "grid", grid_columns: 4, grid_selected_width_factor: 1 }, lazy_load: false, controls: { thumbnails: { mode: "none" } } },
        dimensions: { aspect_ratio_mode: "unconstrained" } }
    : { type: "grid", columns: 3, square: false,
        cards: layout.cameras.map((c) => ({ type: "picture-entity", entity: c.entity, camera_view: "live", ...(c.name ? { name: c.name } : {}) })) };
  const shell = button("echo-camshell", { name: "Cameras", custom_fields: {
    home: { card: button("echo-round-view", { icon: "mdi:home", variables: { view: "home" } }) }, cams: { card } } });
  return { title: "Cameras", path: "cameras", type: "panel", cards: [shell] };
}

function roomBody(room: Room, layout: Layout): Card {
  const cards = [button("echo-room", { name: room.title, variables: { area: room.area, extra: room.extra } })];
  for (const id of [...room.members, ...room.extra]) cards.push(tile({ entity: id }, layout));
  return grid(cards);
}

function anchoredRow(template: string, cards: Array<[string, Card]>, gapKey: string): Card {
  return button(template, {
    custom_fields: Object.fromEntries(cards.map(([k, c]) => [k, { card: c }])),
    styles: { grid: [{ "grid-template-areas": '"' + cards.map(([k]) => k).join(" ") + " " + gapKey + '"' }] },
  });
}

export function build(templates: Record<string, unknown>, layout: Layout) {
  const panels: Array<[string, Card]> = [["fav", panel("Favorites", grid(layout.favorites.map((f) => tile(f, layout))))]];
  for (const r of layout.rooms) panels.push([r.id, panel(r.title, roomBody(r, layout))]);
  if (layout.cameras.length) panels.push(["cameras", panel("Cameras", grid(layout.cameras.map((c) => tile({ ...c, template: "echo-camera" }, layout))))]);
  const pills: Array<[string, Card]> = [
    ["home", button("echo-nav", { icon: "mdi:home", variables: { target: "fav", home: true } })],
    ["overview", button("echo-pill", { name: "Overview", icon: "mdi:view-dashboard", tap_action: { action: "navigate", navigation_path: layout.overview_path } })],
    ...layout.rooms.map((r): [string, Card] => ["nav_" + r.id, button("echo-nav", { name: r.title, icon: r.icon, variables: { target: r.id } })]),
  ];
  if (layout.cameras.length) pills.push(["nav_cameras", button("echo-pill-view", { name: "Cameras", icon: "mdi:cctv", variables: { view: "cameras" } })]);
  pills.push(["media", button("echo-pill-media", { variables: { exclude: [...layout.media_exclude] } })]);
  if (layout.doors.length) pills.push(["doors", button("echo-pill-doors", { variables: { doors: [...layout.doors] } })]);
  if (layout.lock) pills.push(["lockpill", button("echo-pill-lock", { entity: layout.lock })]);
  if (layout.climate) pills.push(["climate", button("echo-pill-climate", { entity: layout.climate })]);
  pills.push(["lights", button("echo-pill-lights")]);
  const top = button("echo-topbar"), side = button("echo-side");
  if (layout.weather) top.entity = side.entity = layout.weather;
  if (layout.forecast_sensor) side.variables = { forecast_sensor: layout.forecast_sensor };
  const shell = button("echo-shell", { custom_fields: {
    top: { card: top }, side: { card: side }, rail: { card: anchoredRow("echo-rail", panels, "reg") }, dock: { card: anchoredRow("echo-dock", pills, "end") } } });
  const config: Card = {};
  if (layout.kiosk_users.length) config.kiosk_mode = { user_settings: [{ users: [...layout.kiosk_users], kiosk: true }] };
  config.button_card_templates = templates;
  config.views = [{ title: "Echo Hub", path: "home", type: "panel", cards: [shell] }];
  if (layout.cameras.length) config.views.push(camerasView(layout));
  return config;
}
