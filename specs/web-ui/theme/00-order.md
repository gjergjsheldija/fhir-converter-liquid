# Theme and icon specs

These specs replace the Settings checkbox that toggles Bootstrap `bg-dark` and the CodeMirror Blackboard theme, and they add a small set of inline icons.

Implement `specs/web-ui/usability/` (`01` through `20`) before this folder, and implement this folder before `specs/web-ui/editor/` and `specs/web-ui/projects/` so all editor modes, debug drawers, and project dialogs build directly on the color tokens, unified `fhir` editor theme, and inline SVG icon helper.

## Rules for every spec

1. Implement one numbered spec, then stop. Do not start the next spec in the same change.
2. Read this file, then the spec you are implementing, then the files that spec names. The spec's "Current behavior" section is the baseline. If the worktree no longer matches that baseline, stop and report the difference. Do not invent a new design.
3. Edit only the files listed in that spec.
4. Do not add a dependency. Do not load a font, an icon font, or a stylesheet from a CDN. Do not add a test framework.
5. Do not edit `*.liquid` files, sample messages, or expected JSON.
6. Preserve behavior added by earlier specs in `usability/` and in this folder.
7. Do not commit unless the user explicitly asks.

## Order

| Spec | Status | File | What it changes |
| --- | --- | --- | --- |
| 01 | Done | `01-color-tokens.md` | Names the light and dark colors as variables, removes Bootstrap `.bg-light` `!important` overrides, and points chrome, buttons, popovers, and autocomplete hints at the tokens. |
| 02 | Done | `02-editor-theme.md` | One CodeMirror theme (`fhir`) uses surface and rich syntax tokens ready for HL7v2, Liquid, and FHIR JSON. Eclipse and Blackboard are removed. |
| 03 | Done | `03-theme-control.md` | Light, Dark, and System. The choice applies immediately and on first paint. |
| 04 | Not started | `04-icons.md` | Nine inline SVG symbols beside labels. The Font Awesome CDN stylesheet is removed. |

## Check

There is no browser test suite. Each spec ends with a manual check against `http://localhost:2019`. Do that check. Also run `npm test` and `npm run eslint`. A Liquid compatibility failure that the diff does not touch is reported, not fixed here.
