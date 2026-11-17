# Spec 02: Wrap message and result lines

**Status:** Done. Implemented in commit 5211de8 (`lineWrapping: true` on `dataEditor` and `outputCode` in `src/static/js/template-editor.js`; `templateCodeEditor` left unwrapped).

## 1. Goal

A long HL7 segment and a long FHIR JSON line wrap inside the message pane and the result pane. The template editor stays one line per source line, because Liquid is indented and wrapping it hides structure.

## 2. Current behavior

Both editors are created in `$(document).ready` in `src/static/js/template-editor.js`.

- `dataEditor` is created from `#databox` with `lineNumbers: true`, theme `lightMode`, mode `{name: "default"}`. `lineWrapping` is omitted, so it is false.
- `outputCode` is created from `#resultbox` with `readOnly: true`, `lineNumbers: true`, theme `lightMode`, mode `{name: "javascript"}`. `lineWrapping` is omitted, so it is false.
- `templateCodeEditor` is created from `#templatebox` with mode `"application/json"`. Leave that mode and leave wrapping off. The mode string is historical; do not change it in this spec.

On 17 Nov 2026 the first line of `ADT04-23.hl7` and the `fullUrl` lines of the Bundle were cut off at the right edge of the pane. Spec 01 makes the pane scroll. This spec makes those two panes wrap so the user can read a segment without horizontal scrolling.

## 3. Files you may edit

- `src/static/js/template-editor.js`

## 4. Implementation

1. In the `CodeMirror.fromTextArea` options for `dataEditor`, add `lineWrapping: true`.
2. In the `CodeMirror.fromTextArea` options for `outputCode`, add `lineWrapping: true`.
3. Do not set `lineWrapping` on `templateCodeEditor`.
4. `changeDataType` sets `dataEditor` mode to `"default"` for HL7v2 and `"text/html"` for CDA. Do not change those modes. Wrapping stays on after a mode change; CodeMirror does not clear `lineWrapping` when the mode changes. Do not add a second `setOption` unless you observe the option being cleared.
5. Keep the spec 01 `refreshEditors()` calls. Wrapping changes line height, and those refreshes are what keep the scrollbar correct.

Do not add a wrap button. Do not add a setting. The message and the result always wrap.

## 5. How to check

With spec 01 already done, open `http://localhost:2019`.

1. Load `ADT04-23.hl7` and `ADT_A04.liquid`.
2. The MSH line is fully readable by scrolling vertically inside the message pane. The message pane has no horizontal scrollbar, or the horizontal scrollbar does not move past the pane width.
3. A long result line, such as a `fullUrl`, wraps inside the result pane. The result pane has no horizontal scrollbar that extends past the pane.
4. The template editor still scrolls horizontally when a Liquid line is wider than the pane. A line of Liquid is not wrapped onto the next visual row.
5. `document.documentElement.scrollHeight` is still less than or equal to `window.innerHeight + 1`.

Then run `npm test` and `npm run eslint`.

## 6. Acceptance criteria

- `dataEditor` and `outputCode` are created with `lineWrapping: true`.
- `templateCodeEditor` is created without line wrapping.
- No new control, setting, or dependency is added.
- Spec 01's pane scrolling still holds after a conversion.
