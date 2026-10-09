#!/usr/bin/env bash
# Fails if yaml/echo-hub.yaml or dist/echo-hub.js differ from a fresh build.
set -euo pipefail
cd "$(dirname "$0")/.."
{ echo "# Echo Hub dashboard (github.com/DynamotechLLC/echo-hub). Paste into Dashboard > Edit > ⋮ > Raw configuration editor."; echo "# GENERATED from generator/layout.example.yaml. Change the entity ids and area ids (search for 'area:') to yours."; python3 generator/generate.py generator/layout.example.yaml; } > yaml/echo-hub.yaml
npm run build --silent
git diff --exit-code -- yaml/echo-hub.yaml dist/echo-hub.js
