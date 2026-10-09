import { describe, expect, it } from "vitest";
import home from "../../fixtures/home.json";
import expected from "../../fixtures/expected_rooms.json";
import { discover } from "../src/discover";
import type { Hass } from "../src/types";

const hass = home as unknown as Hass;
const env = { advancedCamera: true };

describe("discover", () => {
  it("builds rooms from areas with the expected members", () => {
    const layout = discover(hass, {}, env);
    expect(Object.fromEntries(layout.rooms.map((r) => [r.id, r.members]))).toEqual(expected);
    expect(layout.rooms.map((r) => r.title)).toEqual(["Bedroom", "Kitchen", "Living Room"]);
  });
  it("prefixes area ids so reserved ids stay unique", () => {
    expect(discover(hass, {}, env).rooms.map((r) => r.id)).toEqual(["a_lock", "a_kitchen", "a_living_room"]);
  });
  it("uses area icon or a default", () => {
    const icons = Object.fromEntries(discover(hass, {}, env).rooms.map((r) => [r.area, r.icon]));
    expect(icons).toEqual({ lock: "mdi:bed", kitchen: "mdi:home", living_room: "mdi:sofa" });
  });
  it("finds cameras, doors, lock, climate and weather", () => {
    const l = discover(hass, {}, env);
    expect(l.cameras.map((c) => c.entity)).toEqual(["camera.backyard", "camera.front_door"]);
    expect(l.doors).toEqual(["binary_sensor.front_door"]);
    expect([l.lock, l.climate, l.weather]).toEqual(["lock.front_door", "climate.thermostat", "weather.home"]);
  });
  it("defaults favorites to climate, lock and the first camera", () => {
    expect(discover(hass, {}, env).favorites.map((f) => f.entity)).toEqual(["climate.thermostat", "lock.front_door", "camera.backyard"]);
  });
  it("honours options", () => {
    const l = discover(hass, { rooms: [{ area: "kitchen", title: "Cook" }], cameras: [], favorites: ["light.unassigned"], kiosk_users: ["Panel"], weather: null }, env);
    expect(l.rooms).toEqual([{ id: "a_kitchen", area: "kitchen", title: "Cook", icon: "mdi:home", extra: [], members: ["light.kitchen_ceiling", "switch.coffee"] }]);
    expect(l.cameras).toEqual([]);
    expect(l.favorites).toEqual([{ entity: "light.unassigned" }]);
    expect(l.kiosk_users).toEqual(["Panel"]);
    expect(l.weather).toBeNull();
  });
  it("picks the camera card from the environment unless set", () => {
    expect(discover(hass, {}, { advancedCamera: false }).camera_card).toBe("picture");
    expect(discover(hass, { camera_card: "picture" }, env).camera_card).toBe("picture");
  });
  it("rejects duplicate or reserved room ids", () => {
    for (const rooms of [[{ area: "kitchen" }, { area: "kitchen", title: "K2" }], [{ area: "x", id: "lock" }], [{ area: "x", id: "fav" }], [{ area: "x", id: "cameras" }]]) {
      expect(() => discover(hass, { rooms }, env)).toThrow(/duplicate or reserved room id/);
    }
  });
  it("handles an empty home", () => {
    const empty = { areas: {}, devices: {}, entities: {}, states: {} } as Hass;
    const l = discover(empty, {}, env);
    expect([l.rooms, l.cameras, l.favorites, l.doors]).toEqual([[], [], [], []]);
    expect([l.lock, l.climate, l.weather]).toEqual([null, null, null]);
  });
});
