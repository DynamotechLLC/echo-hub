import { describe, expect, it } from "vitest";
import home from "../../fixtures/home.json";
import templates from "../src/templates.json";
import { discover } from "../src/discover";
import { build } from "../src/build";
import type { Hass } from "../src/types";

const hass = home as unknown as Hass;
const cfg = () => build(templates, discover(hass, {}, { advancedCamera: true }));
const shell = (c: any) => c.views[0].cards[0];
const rail = (c: any) => shell(c).custom_fields.rail.card.custom_fields;

describe("build", () => {
  it("has a home panel view and a cameras view", () => {
    const c = cfg();
    expect(c.views.map((v: any) => [v.path, v.type])).toEqual([["home", "panel"], ["cameras", "panel"]]);
  });
  it("renders room members as explicit tiles after the room tile", () => {
    const body = rail(cfg()).a_kitchen.card.custom_fields.body.card;
    expect(body.type).toBe("grid");
    expect(body.cards.map((x: any) => x.template)).toEqual(["echo-room", "echo-light", "echo-plug"]);
    expect(body.cards[0].variables).toEqual({ area: "kitchen", extra: [] });
  });
  it("falls back to echo-base for unsupported domains", () => {
    const c = build(templates, discover(hass, { favorites: ["sensor.temp", "cover.garage"] }, { advancedCamera: true }));
    const cards = rail(c).fav.card.custom_fields.body.card.cards;
    expect(cards.map((x: any) => [x.template, x.tap_action])).toEqual([["echo-base", { action: "more-info" }], ["echo-base", { action: "more-info" }]]);
  });
  it("has no JS under views", () => {
    expect(JSON.stringify(cfg().views)).not.toContain("[[[");
  });
  it("renders an empty home", () => {
    const empty = { areas: {}, devices: {}, entities: {}, states: {} } as Hass;
    const c = build(templates, discover(empty, {}, { advancedCamera: true }));
    expect(Object.keys(rail(c))).toEqual(["fav"]);
    expect(c.views).toHaveLength(1);
  });
});
