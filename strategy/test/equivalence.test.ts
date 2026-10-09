import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import home from "../../fixtures/home.json";
import templates from "../src/templates.json";
import { discover } from "../src/discover";
import { build } from "../src/build";
import type { Hass, Layout } from "../src/types";

const hass = home as unknown as Hass;

function generator(layout: Layout) {
  const { rooms, ...rest } = layout;
  const input = JSON.stringify({ ...rest, rooms: rooms.map(({ members, ...r }) => r) });
  return JSON.parse(execFileSync("python3", ["generator/generate.py", "-", "--json"], { input, encoding: "utf8" }));
}

function withoutRoomBodies(config: any, layout: Layout) {
  const c = JSON.parse(JSON.stringify(config));
  const fields = c.views[0].cards[0].custom_fields.rail.card.custom_fields;
  for (const r of layout.rooms) fields[r.id].card.custom_fields.body.card = "ROOM";
  return c;
}

describe("strategy and generator produce the same dashboard", () => {
  const variants: Record<string, Parameters<typeof discover>[1]> = {
    defaults: {}, noWeather: { weather: null }, picture: { camera_card: "picture" },
    kiosk: { kiosk_users: ["Panel"], forecast_sensor: "sensor.forecast" },
  };
  for (const [name, options] of Object.entries(variants)) {
    it(name, () => {
      const layout = discover(hass, options, { advancedCamera: true });
      expect(withoutRoomBodies(build(templates, layout), layout)).toEqual(withoutRoomBodies(generator(layout), layout));
    });
  }
});
