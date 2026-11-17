# Spec 03: Light, Dark, and System

**Status:** Done (2026-11-18). `applyTheme` + stored `theme` (light/dark/system) apply in `$(document).ready` and on radio change; inline head script sets `data-theme` before first paint; `setColorTheme` deleted; Save button uses `is-dirty` with token CSS. Verified by `node scripts/test-summary.mjs` (369 passing / 109 known baseline failures, eslint clean); live browser check skipped by user.

## 1. Goal

The person chooses Light, Dark, or System. The choice applies as soon as it changes, and it is already applied on the next page load. System follows the operating system and updates when the operating system changes.

## 2. Current behavior

Settings has a checkbox `#settings-dark-mode`. The stored object `fhirConverterSettings` includes `darkMode: false` by default. Save writes it and, when the boolean changed, calls `setColorTheme`. That function toggles Bootstrap `bg-light` / `bg-dark` on `body`, `#navbar`, and `#settings-modal-content`, and it swaps `btn-dark` / `btn-light` on Convert, Settings Save, and Copy.

`setColorTheme` is not called on load. A stored `darkMode: true` does nothing until the person opens Settings and presses Save again.

`updateUnsavedDot` adds `btn-dark` or `btn-outline-dark` on `#template-save-button`. Those classes are not the theme.

Spec 01 paints chrome from `data-theme`. Spec 02 keeps the editors on `fhir`.

## 3. Files you may edit

- `src/static/index.html`
- `src/static/js/template-editor.js`
- `src/static/css/template-editor.css`

## 4. Stored value

The setting name is `theme`. The allowed values are `light`, `dark`, and `system`.

When reading `localStorage`:

- If `theme` is one of the three values, use it.
- If `theme` is absent and `darkMode` is `true`, use `dark`.
- If `theme` is absent and a settings object was stored with `darkMode` not `true`, use `light`.
- If no settings object is stored, use `system`.

Write `theme` back with the other settings. Leave a stored `darkMode` key in place if it is already there. Do not read it again once `theme` is set.

## 5. Apply

Add `applyTheme(choice)` in `template-editor.js`.

- `light` sets `document.documentElement.dataset.theme` to `light`.
- `dark` sets it to `dark`.
- `system` sets it to `dark` when `window.matchMedia('(prefers-color-scheme: dark)')` matches, otherwise `light`.

Register one `change` listener on that media query. When the stored choice is `system`, call `applyTheme('system')`. When the stored choice is `light` or `dark`, ignore the media change.

Call `applyTheme` once at the start of the existing `$(document).ready` handler, before `changeDataType('HL7V2')`, using the resolved stored choice.

Also put this script immediately after the `<html data-theme="light">` tag so the first paint matches the stored choice. It may only read `localStorage` and set `dataset.theme`. Duplicate the resolution rules from section 4 in those few lines. Do not call jQuery from that script. If `localStorage` throws, leave `data-theme` as `light`.

## 6. Control

Replace the Dark mode checkbox and its label with a fieldset inside the Editor group.

- Legend: `Theme`
- Three radios, name `settings-theme`, ids `settings-theme-light`, `settings-theme-dark`, `settings-theme-system`
- Labels: `Light`, `Dark`, `System`

On `change`, update the stored settings' `theme` and call `applyTheme`. Do not wait for the Settings Save button. Save still persists timezone and the FHIR server fields, and it may write `theme` again with the same value.

Opening the modal checks the radio that matches the stored `theme`.

Delete `setColorTheme` and every call to it. Do not add or remove `bg-dark`, `bg-light`, `navbar-dark`, `navbar-light`, `btn-dark`, or `btn-light` for theme.

## 7. Dirty Save button

`updateUnsavedDot` must not add `btn-dark` or `btn-outline-dark`.

Add class `is-dirty` on `#template-save-button` when the active template differs from its reference, and remove it when it does not.

In CSS:

- `#template-save-button` background `--surface`, color `--text`, border `1px solid var(--border)`.
- `#template-save-button.is-dirty` background `--accent`, color `--accent-text`, border-color `--accent`.

The tab's `.tab-dirty` dot stays.

## 8. How to check

1. A browser with no `fhirConverterSettings` and a dark operating system loads the dark canvas on the first paint. Light operating system loads the light canvas.
2. Choose Light. The page turns light before Save is pressed. Reload. It stays light.
3. Choose Dark. Editors and chrome are both dark. Reload. It stays dark.
4. Choose System, then change the operating system appearance. The page follows without a reload.
5. A stored object `{ "darkMode": true }` with no `theme` loads dark once, then the saved object gains `"theme": "dark"`.
6. A stored object `{ "darkMode": false, "timezone": "+0200" }` with no `theme` stays light and keeps `+0200`.
7. Dirty a template. Save is filled with the accent color. After save, it is quiet. The tab dot still appears and clears.

Then run `npm test` and `npm run eslint`.

## 9. Acceptance criteria

- Theme applies on load and on radio change, without Settings Save.
- `setColorTheme` is gone, and Bootstrap color classes are not used to theme the page.
- Existing timezone and FHIR settings are not dropped.
