import { readFileSync, writeFileSync } from "node:fs";
import yaml from "js-yaml";
const t = yaml.load(readFileSync(new URL("../src/templates.yaml", import.meta.url), "utf8"));
writeFileSync(new URL("../strategy/src/templates.json", import.meta.url), JSON.stringify(t));
console.log("embedded", Object.keys(t).length, "templates");
