import { describe, expect, it } from "vitest";
import home from "../../fixtures/home.json";
import templates from "../src/templates.json";
import { discover } from "../src/discover";
import { build } from "../src/build";
import type { Hass } from "../src/types";

const hass = home as unknown as Hass;
const env = { advancedCamera: true };
const shell = (c: any) => c.views[0].cards[0];

describe("option edge cases", () => {
  it("treats null lists as empty", () => {
    const l = discover(hass, { media_exclude: null, cameras: null, doors: null, favorites: null, kiosk_users: null } as any, env);
    expect([l.media_exclude, l.cameras, l.doors, l.favorites, l.kiosk_users]).toEqual([[], [], [], [], []]);
  });
  it("rejects unknown option keys", () => {
    expect(() => discover(hass, { favourites: [] } as any, env)).toThrow(/unknown options: favourites/);
  });
  it("shows one camera per device", () => {
    const h = JSON.parse(JSON.stringify(home));
    h.devices.d_cam = { id: "d_cam", area_id: null };
    h.entities["camera.front_door"].device_id = "d_cam";
    h.entities["camera.front_door_sub"] = { entity_id: "camera.front_door_sub", device_id: "d_cam", area_id: null };
    h.states["camera.front_door_sub"] = { state: "idle", attributes: {} };
    expect(discover(h, {}, env).cameras.map((c) => c.entity)).toEqual(["camera.backyard", "camera.front_door"]);
  });
  it("prefers a device's main stream over its sub stream", () => {
    const h = JSON.parse(JSON.stringify(home));
    const add = (id: string, device_id: string) => {
      h.devices[device_id] = { id: device_id, area_id: null };
      h.entities[id] = { entity_id: id, device_id, area_id: null };
      h.states[id] = { state: "idle", attributes: {} };
    };
    add("camera.a_porch_sub", "d1"); add("camera.b_porch_main", "d1");
    add("camera.c_yard_fluent", "d2"); add("camera.d_yard_balanced", "d2");
    add("camera.e_nursery_sd_stream", "d3"); add("camera.f_nursery_hd_stream", "d3");
    expect(discover(h, {}, env).cameras.map((c) => c.entity).filter((id) => /porch|_yard_|nursery/.test(id)))
      .toEqual(["camera.b_porch_main", "camera.d_yard_balanced", "camera.f_nursery_hd_stream"]);
  });
  it("drops room extras that are members or excluded", () => {
    const layout = discover(hass, { rooms: [{ area: "living_room", extra: ["light.living_room_lamp", "media_player.everywhere", "light.unassigned"] }] }, env);
    const body = shell(build(templates, layout)).custom_fields.rail.card.custom_fields.a_living_room.card.custom_fields.body.card;
    expect(body.cards.slice(1).map((c: any) => c.entity)).toEqual(["light.living_room_lamp", "media_player.living_room_tv", "light.unassigned"]);
  });
  it("passes overview_path to the topbar", () => {
    const top = shell(build(templates, discover(hass, { overview_path: "/home" }, env))).custom_fields.top.card;
    expect(top.variables).toEqual({ overview_path: "/home" });
  });
});
