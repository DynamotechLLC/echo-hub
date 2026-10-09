import templates from "./templates.json";
import { build } from "./build";
import { discover } from "./discover";
import type { Hass, Options } from "./types";

export interface Env { has(tag: string): boolean; whenDefined(tag: string, ms: number): Promise<boolean> }
const REQUIRED: Array<[string, string]> = [["button-card", "button-card"], ["card-mod", "card-mod"]];
const DOCS = "https://github.com/DynamotechLLC/echo-hub#requirements";

export async function generateDashboard(config: Options, hass: Hass, env: Env) {
  const missing: string[] = [];
  for (const [tag, name] of REQUIRED) if (!(await env.whenDefined(tag, 3000))) missing.push(name);
  if (missing.length) {
    return { views: [{ title: "Echo Hub", path: "home", cards: [{ type: "markdown",
      content: `**Echo Hub** needs ${missing.join(" and ")} (install from HACS, then reload). See [requirements](${DOCS}).` }] }] };
  }
  const { type: _type, ...options } = config as Options & { type?: string };
  return build(templates as Record<string, unknown>, discover(hass, options, { advancedCamera: env.has("advanced-camera-card") }));
}

const browserEnv: Env = {
  has: (tag) => !!customElements.get(tag),
  whenDefined: (tag, ms) => Promise.race([
    customElements.whenDefined(tag).then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(!!customElements.get(tag)), ms)),
  ]),
};

if (typeof customElements !== "undefined" && !customElements.get("ll-strategy-dashboard-echo-hub")) {
  class EchoHubStrategy extends HTMLElement {
    static getCreateSuggestions() { return { title: "Echo Hub", icon: "mdi:tablet-dashboard" }; }
    static async generate(config: Options, hass: Hass) { return generateDashboard(config, hass, browserEnv); }
  }
  customElements.define("ll-strategy-dashboard-echo-hub", EchoHubStrategy);
  const w = window as unknown as { customStrategies?: unknown[] };
  w.customStrategies = w.customStrategies || [];
  w.customStrategies.push({ type: "echo-hub", strategyType: "dashboard", name: "Echo Hub",
    description: "Wall-panel dashboard in the style of the Amazon Echo Hub, built from your areas.",
    documentationURL: "https://github.com/DynamotechLLC/echo-hub" });
}
