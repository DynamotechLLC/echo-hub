import { DEFAULT_MEDIA_EXCLUDE, type Hass, type Layout, type Options, type Room, type Tile } from "./types";

const ROOM_DOMAINS = ["light", "fan", "switch", "media_player"];
const DOOR_CLASSES = ["door", "garage_door", "opening"];

export const globToRegExp = (p: string) =>
  new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");

const domainOf = (id: string) => id.split(".", 1)[0];
const sorted = (ids: string[]) => [...ids].sort();
const tile = (t: string | Tile): Tile => (typeof t === "string" ? { entity: t } : { ...t });

function areaOf(hass: Hass, id: string): string | null {
  const e = hass.entities[id];
  if (!e) return null;
  if (e.area_id) return e.area_id;
  const d = e.device_id ? hass.devices[e.device_id] : undefined;
  return d?.area_id ?? null;
}

function usable(hass: Hass, id: string, exclude: RegExp[]): boolean {
  const e = hass.entities[id];
  if (!e || e.hidden || e.entity_category) return false;
  if (!(id in hass.states) || id.includes("_segment_")) return false;
  return !exclude.some((r) => r.test(id));
}

function members(hass: Hass, area: string, exclude: RegExp[]): string[] {
  const ids = Object.keys(hass.entities).filter(
    (id) => ROOM_DOMAINS.includes(domainOf(id)) && areaOf(hass, id) === area && usable(hass, id, exclude),
  );
  return ROOM_DOMAINS.flatMap((d) => sorted(ids.filter((id) => domainOf(id) === d)));
}

const first = (hass: Hass, domain: string) =>
  sorted(Object.keys(hass.states).filter((id) => domainOf(id) === domain && hass.entities[id] && !hass.entities[id].hidden))[0] ?? null;

const pick = <T>(options: Options, key: keyof Options, fallback: T): T =>
  (Object.prototype.hasOwnProperty.call(options, key) ? (options[key] as T) : fallback);

export function discover(hass: Hass, options: Options, env: { advancedCamera: boolean }): Layout {
  const media_exclude = pick(options, "media_exclude", DEFAULT_MEDIA_EXCLUDE);
  const exclude = media_exclude.map(globToRegExp);
  let rooms: Room[];
  if (options.rooms) {
    rooms = options.rooms.map((r) => ({
      id: r.id || "a_" + r.area, area: r.area, title: r.title || hass.areas[r.area]?.name || r.area,
      icon: r.icon || hass.areas[r.area]?.icon || "mdi:home", extra: r.extra ?? [], members: members(hass, r.area, exclude),
    }));
  } else {
    rooms = Object.values(hass.areas)
      .map((a) => ({ id: "a_" + a.area_id, area: a.area_id, title: a.name, icon: a.icon || "mdi:home", extra: [], members: members(hass, a.area_id, exclude) }))
      .filter((r) => r.members.length > 0)
      .sort((a, b) => a.title.localeCompare(b.title));
  }
  const cameraIds = sorted(Object.keys(hass.states).filter((id) => domainOf(id) === "camera" && usable(hass, id, [])));
  const cameras = (options.cameras ?? cameraIds).map(tile);
  const doors = pick(options, "doors", sorted(Object.keys(hass.states).filter((id) => domainOf(id) === "binary_sensor"
    && DOOR_CLASSES.includes(String(hass.states[id].attributes.device_class)) && usable(hass, id, []))));
  const lock = pick(options, "lock", first(hass, "lock"));
  const climate = pick(options, "climate", first(hass, "climate"));
  const weather = pick(options, "weather", first(hass, "weather"));
  const defaults = [climate, lock, cameras[0]?.entity].filter((x): x is string => !!x);
  return {
    favorites: (options.favorites ?? defaults).map(tile), rooms, cameras, doors, lock, climate, weather,
    forecast_sensor: pick(options, "forecast_sensor", null), media_exclude, kiosk_users: pick(options, "kiosk_users", []),
    camera_card: pick(options, "camera_card", env.advancedCamera ? "advanced" : "picture"),
    overview_path: pick(options, "overview_path", "/lovelace"),
  };
}
