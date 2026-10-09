import { afterEach, describe, expect, it, vi } from "vitest";
import templates from "../src/templates.json";

// Runs a template's [[[ ]]] JavaScript the way button-card does: a function of
// (states, entity, user, hass, variables, html) called with the card element as `this`.
function run(js: string, self: any, hass: any, variables: any = {}, entity: any = null) {
  const body = js.trim().replace(/^\[\[\[/, "").replace(/\]\]\]$/, "");
  return new Function("states", "entity", "user", "hass", "variables", "html", body).call(self, hass.states, entity, null, hass, variables, null);
}
const t: any = templates;
const card = () => ({ isConnected: true, requestUpdate: vi.fn(), _echoTick: null as any });
const hass = (language: string, time_format: string) => ({ states: {}, locale: { language, time_format } });

describe("templates", () => {
  afterEach(() => vi.useRealTimers());
  it("clock drops the day period in any locale", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 9, 15, 4));
    for (const lang of ["en", "es", "de", "ko"]) {
      const html = run(t["echo-topbar"].custom_fields.now, card(), hass(lang, "12"), t["echo-weather"].variables);
      expect(html, lang).toMatch(/>\s*3:04\s*</);
    }
  });
  it("clock stops ticking once the card is gone", () => {
    vi.useFakeTimers();
    const el = card();
    run(t["echo-topbar"].custom_fields.now, el, hass("en", "24"), t["echo-weather"].variables);
    vi.advanceTimersByTime(20000);
    expect(el.requestUpdate).toHaveBeenCalledTimes(1);
    el.isConnected = false;
    vi.advanceTimersByTime(20000);
    expect(el.requestUpdate).toHaveBeenCalledTimes(1);
    expect(el._echoTick).toBeNull();
  });
  it("date follows the Home Assistant language", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 9, 15, 4));
    expect(run(t["echo-side"].custom_fields.date, card(), hass("es", "24"))).toContain("viernes");
  });
});

// A pasted layout names example entities that may not exist yet: every template must render, not throw.
describe("templates with a missing entity", () => {
  const chain = (name: string): any[] => (t[name] ? [...(t[name].template ? chain(t[name].template) : []), t[name]] : []);
  const strings = (v: any, out: string[] = []): string[] => {
    if (typeof v === "string" && v.includes("[[[")) out.push(v);
    else if (v && typeof v === "object") for (const x of Object.values(v)) strings(x, out);
    return out;
  };
  const h = { states: {}, entities: {}, devices: {}, areas: {}, locale: { language: "en", time_format: "12" } };
  for (const name of Object.keys(t)) {
    it(name, () => {
      vi.stubGlobal("window", {}); vi.stubGlobal("location", { pathname: "/echo-hub/home" });
      const variables: any = Object.assign({}, ...chain(name).map((x) => x.variables || {}));
      for (const [k, v] of Object.entries(variables)) if (typeof v === "string" && v.includes("[[[")) variables[k] = run(v, card(), h, variables);
      for (const js of strings(chain(name).map(({ variables: _, ...rest }) => rest))) expect(() => run(js, card(), h, variables, undefined), js.slice(0, 80)).not.toThrow();
      vi.unstubAllGlobals();
    });
  }
});
