# Changelog
## v0.1.3
- Fix: the topbar overview button follows `overview_path`; the clock stops its timer when the card is removed; the clock drops AM/PM in every language and the side date follows the Home Assistant language.
- Fix: tiles for entities that do not exist yet show "unavailable" instead of an error card (copy-paste YAML before editing).
- Fix: strategy rejects unknown option keys, treats null lists as empty, shows one camera per device (its main stream), and drops duplicate or `media_exclude`d room extras; the generator defaults a missing room title and accepts `extra: null`.
- Docs: `ptz`, room `id`, option-3 grid edits, auto-entities fork link. CI: release runs the tests first, hacs/action pinned, end-to-end test in a real Home Assistant (2024.8.0 and stable).
## v0.1.2
- Fix: the strategy waits for Advanced Camera Card instead of falling back to picture cards while it loads.
## v0.1.1
- Fix: generator and copy-paste room panels were empty (auto-entities rejects entity_category rules). Fix: dock and rail pills no longer stretch when the row is short.
## v0.1.0
- First release: `custom:echo-hub` dashboard strategy (HACS), Python generator, copy-paste YAML, shared button-card templates. Theme: DynamotechLLC/echo-hub-ha-theme.
