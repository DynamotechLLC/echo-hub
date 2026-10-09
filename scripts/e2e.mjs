// End-to-end check in a real Home Assistant: node scripts/e2e.mjs <image tag, e.g. 2024.8.0 or stable>
// Starts HA in Docker with the demo integration, onboards a user, installs button-card, auto-entities,
// the Echo Hub theme and dist/echo-hub.js, creates the three dashboards (strategy, generator, copy-paste)
// and opens each in headless Chromium. Fails on error cards, empty rooms, a missing clock or console errors.
// Needs Node 22+ (global WebSocket), Docker, Python 3 with PyYAML, and `npx playwright install chromium` (or E2E_CHANNEL=chrome to use an installed Chrome).
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const TAG = process.argv[2] || "stable";
const PORT = 18123;
const HA = `http://localhost:${PORT}`;
const CLIENT = `${HA}/`;
const NAME = `echo-hub-e2e-${process.pid}`;
const ROOT = new URL("..", import.meta.url).pathname;
const OUT = join(ROOT, "e2e-results");
const CARDS = {
  "button-card.js": "https://github.com/custom-cards/button-card/releases/download/v7.0.1/button-card.js",
  "auto-entities.js": "https://raw.githubusercontent.com/thomasloven/lovelace-auto-entities/v1.16.1/auto-entities.js",
};
const THEME = "https://raw.githubusercontent.com/DynamotechLLC/echo-hub-ha-theme/main/themes/echo-hub.yaml";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(`[e2e ${TAG}]`, ...a);

async function download(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download ${url}: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function prepareConfig() {
  const cfg = mkdtempSync(join(tmpdir(), "echo-hub-e2e-"));
  mkdirSync(join(cfg, "www"));
  mkdirSync(join(cfg, "themes"));
  writeFileSync(join(cfg, "configuration.yaml"),
    "default_config:\ndemo:\nfrontend:\n  themes: !include_dir_merge_named themes\n");
  for (const [file, url] of Object.entries(CARDS)) writeFileSync(join(cfg, "www", file), await download(url));
  writeFileSync(join(cfg, "themes", "echo-hub.yaml"), await download(THEME));
  writeFileSync(join(cfg, "www", "echo-hub.js"), readFileSync(join(ROOT, "dist", "echo-hub.js")));
  return cfg;
}

async function waitForHA() {
  for (let i = 0; i < 180; i++) {
    try { if ((await fetch(`${HA}/api/onboarding`)).ok) return; } catch {}
    await sleep(2000);
  }
  throw new Error("Home Assistant did not start in 6 minutes");
}

async function onboard() {
  const user = await fetch(`${HA}/api/onboarding/users`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT, name: "E2E", username: "e2e", password: "e2e-password", language: "en" }),
  }).then((r) => r.json());
  const tokens = await fetch(`${HA}/auth/token`, {
    method: "POST",
    body: new URLSearchParams({ grant_type: "authorization_code", code: user.auth_code, client_id: CLIENT }),
  }).then((r) => r.json());
  const auth = { Authorization: `Bearer ${tokens.access_token}`, "Content-Type": "application/json" };
  for (const [step, body] of [["core_config", {}], ["analytics", {}], ["integration", { client_id: CLIENT, redirect_uri: `${HA}/?auth_callback=1` }]]) {
    await fetch(`${HA}/api/onboarding/${step}`, { method: "POST", headers: auth, body: JSON.stringify(body) });
  }
  return tokens;
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/api/websocket`);
    let id = 0;
    const pending = new Map();
    const call = (msg) => new Promise((res, rej) => {
      const n = ++id;
      pending.set(n, { res, rej });
      ws.send(JSON.stringify({ id: n, ...msg }));
    });
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.type === "auth_required") ws.send(JSON.stringify({ type: "auth", access_token: token }));
      else if (m.type === "auth_ok") resolve({ call, close: () => ws.close() });
      else if (m.type === "auth_invalid") reject(new Error("websocket auth failed"));
      else if (m.type === "result" && pending.has(m.id)) {
        const p = pending.get(m.id);
        pending.delete(m.id);
        m.success ? p.res(m.result) : p.rej(new Error(JSON.stringify(m.error)));
      }
    };
    ws.onerror = () => reject(new Error("websocket error"));
  });
}

// A generator layout made from what the demo integration created on this instance.
async function demoLayout(ws) {
  // The demo integration loads its platforms in the background and assigns no areas, so wait for its
  // lights and spread them, a switch and a media player over two areas.
  let reg = [];
  for (let i = 0; i < 60 && reg.filter((e) => e.entity_id.startsWith("light.")).length < 2; i++) {
    await sleep(2000);
    reg = await ws.call({ type: "config/entity_registry/list" });
  }
  const pick = (d) => reg.filter((e) => e.entity_id.startsWith(d + ".") && !e.disabled_by).map((e) => e.entity_id).sort();
  const rooms = [];
  for (const name of ["E2E Living", "E2E Kitchen"]) rooms.push((await ws.call({ type: "config/area_registry/create", name })).area_id);
  const members = [...pick("light"), ...pick("switch").slice(0, 1), ...pick("media_player").slice(0, 1)];
  for (const [i, entity_id] of members.entries()) {
    await ws.call({ type: "config/entity_registry/update", entity_id, area_id: rooms[i % rooms.length] });
  }
  const [areas, devices, entities] = await Promise.all([
    ws.call({ type: "config/area_registry/list" }),
    ws.call({ type: "config/device_registry/list" }),
    ws.call({ type: "config/entity_registry/list" }),
  ]);
  const devArea = Object.fromEntries(devices.map((d) => [d.id, d.area_id]));
  const areaOf = (e) => e.area_id || devArea[e.device_id] || null;
  const live = entities.filter((e) => !e.disabled_by && !e.hidden_by);
  const ids = (domain) => live.filter((e) => e.entity_id.startsWith(domain + ".")).map((e) => e.entity_id).sort();
  const withLights = new Set(live.filter((e) => /^(light|fan|switch|media_player)\./.test(e.entity_id)).map(areaOf).filter(Boolean));
  return {
    favorites: [...ids("climate").slice(0, 1), ...ids("lock").slice(0, 1), ...ids("light").slice(0, 2)],
    rooms: areas.filter((a) => withLights.has(a.area_id)).map((a) => ({ area: a.area_id, title: a.name })),
    cameras: ids("camera").slice(0, 2), lock: ids("lock")[0] ?? null, climate: ids("climate")[0] ?? null,
    weather: ids("weather")[0] ?? null, camera_card: "picture",
  };
}

async function setupDashboards(ws) {
  for (const file of ["button-card.js", "auto-entities.js", "echo-hub.js"]) {
    await ws.call({ type: "lovelace/resources/create", res_type: "module", url: `/local/${file}` });
  }
  const layout = await demoLayout(ws);
  if (!layout.rooms.length) throw new Error("demo integration created no rooms with lights; the room check would prove nothing");
  const generated = JSON.parse(execFileSync("python3", [join(ROOT, "generator", "generate.py"), "-", "--json"], { input: JSON.stringify(layout), encoding: "utf8" }));
  const yamlText = execFileSync("python3", ["-c", "import json,sys,yaml; print(json.dumps(yaml.safe_load(open(sys.argv[1]))))", join(ROOT, "yaml", "echo-hub.yaml")], { encoding: "utf8" });
  const boards = {
    "e2e-strategy": { strategy: { type: "custom:echo-hub" } },
    "e2e-gen": generated,
    "e2e-yaml": JSON.parse(yamlText),
  };
  for (const [url_path, config] of Object.entries(boards)) {
    await ws.call({ type: "lovelace/dashboards/create", url_path, title: url_path, mode: "storage", require_admin: false, show_in_sidebar: false });
    await ws.call({ type: "lovelace/config/save", url_path, config });
  }
  return layout;
}

// Runs in the page: counts deep through shadow roots.
const INSPECT = () => {
  const all = [];
  const walk = (root) => { for (const e of root.querySelectorAll("*")) { all.push(e); if (e.shadowRoot) walk(e.shadowRoot); } };
  walk(document);
  const rail = all.find((e) => e.localName === "button-card" && e._config && e._config.template === "echo-rail");
  const top = all.find((e) => e.localName === "button-card" && e._config && e._config.template === "echo-topbar");
  const panels = rail ? [...rail.shadowRoot.querySelectorAll("#container > div:not(#reg)")].map((d) => {
    const inner = [];
    const w = (r) => { for (const e of r.querySelectorAll("*")) { inner.push(e); if (e.shadowRoot) w(e.shadowRoot); } };
    w(d);
    return { id: d.id, tiles: inner.filter((e) => e.localName === "button-card").length };
  }) : [];
  return {
    errorCards: all.filter((e) => e.localName === "hui-error-card").length,
    panels,
    clock: top ? (top.shadowRoot.querySelector("#now")?.textContent || "").replace(/\s+/g, " ").trim() : null,
  };
};

async function check(browser, tokens, path, { rooms }) {
  const page = await browser.newPage({ viewport: { width: 1456, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.addInitScript(([t, url, client]) => {
    localStorage.setItem("hassTokens", JSON.stringify({ ...t, hassUrl: url, clientId: client, expires: Date.now() + t.expires_in * 1000 }));
  }, [tokens, HA, CLIENT]);
  await page.goto(`${HA}/${path}/home`);
  let r;
  for (let i = 0; i < 40; i++) {
    await sleep(1500);
    r = await page.evaluate(INSPECT);
    const roomPanels = r.panels.filter((p) => p.id !== "fav" && p.id !== "cameras");
    if (r.clock && (!rooms || (roomPanels.length && roomPanels.every((p) => p.tiles > 1)))) break;
  }
  await page.evaluate(() => {
    const ha = document.querySelector("home-assistant");
    ha._updateHass({ selectedTheme: { theme: "Echo Hub", dark: false } });
    ha._applyTheme(false);
  });
  await sleep(1000);
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: join(OUT, `${TAG}-${path}.png`) });
  await page.close();
  const problems = [];
  if (r.errorCards) problems.push(`${r.errorCards} error card(s)`);
  if (!r.panels.some((p) => p.id === "fav")) problems.push("no Favorites panel");
  if (!/\d{1,2}:\d{2}/.test(r.clock || "")) problems.push(`clock missing: ${JSON.stringify(r.clock)}`);
  const roomPanels = r.panels.filter((p) => p.id !== "fav" && p.id !== "cameras");
  if (rooms && !roomPanels.length) problems.push("no room panels");
  if (rooms) for (const p of roomPanels) if (p.tiles <= 1) problems.push(`room ${p.id} is empty`);
  const relevant = errors.filter((e) => /button-card|auto-entities|echo|strategy|template/i.test(e));
  if (relevant.length) problems.push(`console: ${relevant.slice(0, 3).join(" | ")}`);
  log(path, problems.length ? "FAIL " + problems.join("; ") : `ok (${r.panels.length} panels, clock ${r.clock})`);
  return problems;
}

async function main() {
  const cfg = await prepareConfig();
  log("starting", `ghcr.io/home-assistant/home-assistant:${TAG}`);
  execFileSync("docker", ["run", "-d", "--rm", "--name", NAME, "-p", `${PORT}:8123`, "-v", `${cfg}:/config`, `ghcr.io/home-assistant/home-assistant:${TAG}`], { stdio: "ignore" });
  let browser;
  try {
    await waitForHA();
    const tokens = await onboard();
    await sleep(5000);
    const ws = await connect(tokens.access_token);
    const layout = await setupDashboards(ws);
    log("demo rooms", layout.rooms.map((r) => r.area).join(", "));
    ws.close();
    browser = await chromium.launch(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {});
    const problems = [
      ...await check(browser, tokens, "e2e-strategy", { rooms: true }),
      ...await check(browser, tokens, "e2e-gen", { rooms: true }),
      // The copy-paste file names example areas that do not exist here, so only the frame is checked.
      ...await check(browser, tokens, "e2e-yaml", { rooms: false }),
    ];
    if (problems.length) process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    execFileSync("docker", ["stop", NAME], { stdio: "ignore" });
  }
}

main().catch((e) => { console.error(e); try { execFileSync("docker", ["stop", NAME], { stdio: "ignore" }); } catch {} process.exit(1); });
