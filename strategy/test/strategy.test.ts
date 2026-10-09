import { describe, expect, it } from "vitest";
import home from "../../fixtures/home.json";
import { generateDashboard } from "../src/echo-hub-strategy";
import type { Hass } from "../src/types";

const env = (tags: string[]) => ({ has: (t: string) => tags.includes(t), whenDefined: async (t: string) => tags.includes(t) });
const all = env(["button-card", "card-mod", "advanced-camera-card"]);

describe("generateDashboard", () => {
  it("builds the dashboard when cards are present", async () => {
    const c: any = await generateDashboard({}, home as unknown as Hass, all);
    expect(c.views[0].path).toBe("home");
    expect(c.button_card_templates["echo-shell"]).toBeDefined();
  });
  it("shows missing cards", async () => {
    const c: any = await generateDashboard({}, home as unknown as Hass, env([]));
    expect(c.views[0].cards[0].type).toBe("markdown");
    expect(c.views[0].cards[0].content).toContain("button-card");
    expect(c.views[0].cards[0].content).not.toContain("card-mod");
  });
  it("does not need card-mod", async () => {
    const c: any = await generateDashboard({}, home as unknown as Hass, env(["button-card"]));
    expect(c.views[0].path).toBe("home");
    expect(c.views[0].cards[0].type).toBe("custom:button-card");
  });
  it("shows bad options as one card instead of throwing", async () => {
    const c: any = await generateDashboard({ rooms: [{ area: "kitchen" }, { area: "kitchen" }] }, home as unknown as Hass, all);
    expect(c.views[0].cards[0].type).toBe("markdown");
    expect(c.views[0].cards[0].content).toContain("duplicate or reserved room id: a_kitchen");
  });
  it("generate works without callWS", async () => {
    const hass = { ...(home as object), callWS: () => { throw new Error("admin only"); } } as unknown as Hass;
    const c: any = await generateDashboard({}, hass, all);
    expect(c.views).toHaveLength(2);
  });
  it("falls back to picture cameras without Advanced Camera Card", async () => {
    const c: any = await generateDashboard({}, home as unknown as Hass, env(["button-card", "card-mod"]));
    expect(c.views[1].cards[0].custom_fields.cams.card.type).toBe("grid");
  });
});
