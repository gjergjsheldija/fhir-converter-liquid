# Spec 04: Debug trace metadata and mouse-over variable / HL7 path values

**Status:** Done (2026-11-18). Opt-in `?debug=true` parsed HL7v2 + non-marking root/partial scope collector (`debugCollector.js`) and mouse-over value tooltips (`debug-hover.js`) implemented; 78/78 `debugCollector.spec.js` and `routes.spec.js` tests pass.

## 1. Goal

Let the developer hover over any variable (`bundleID`, `patientId`, `ID`, `nk1SegmentLists`) or dotted HL7v2 path (`firstSegments.MSH.10`, `firstSegments.PID.5.1.Value`, `MSH.9`) in the Liquid template editor — in **both** root templates (`ADT_A04.liquid`) and open partial tabs (`Resource/_MessageHeader.liquid`) — and immediately see the actual runtime value evaluated during the latest conversion, plus hover over fields in the HL7v2 Message editor to see their `Segment.Field.Component` coordinates and decoded value.

## 2. Current behavior

- `POST /api/v1/convert/hl7v2?unusedSegments=true&invalidAccess=true` runs `convertInlineHl7v2` (`src/lib/workers/worker.js`) and returns `{ fhirResource, unusedSegments }`.
- Neither the parsed `hl7v2Data` structure (`parseHl7v2FieldModel`) nor the runtime Liquid variable scopes (`assign`, `capture`, `evaluate`, and `include` child parameters) are returned to the browser.
- Hovering over `firstSegments.MSH.10` or `Organization_ID_MSH_4` in `templateCodeEditor` shows nothing.

## 3. Files you may edit

- `src/lib/liquid-converter/debugCollector.js` (new — serializes `hl7v2Data` + collects bounded scope snapshots when `debug === true`)
- `src/lib/liquid-converter/debugCollector.spec.js` (new)
- `src/lib/liquid-converter/liquid-converter.js`
- `src/lib/liquid-converter/tags/evaluate.js`
- `src/lib/workers/worker.js`
- `src/routes.js`
- `src/routes.spec.js`
- `src/static/js/debug-hover.js` (new)
- `src/static/index.html`
- `src/static/css/template-editor.css`
- `src/static/js/template-editor.js`

Do not add npm dependencies. Do not edit `*.liquid` files or expected fixtures.

## 4. Opt-in `?debug=true` server metadata (zero impact when omitted)

1. **Query flag:**
   - In `src/routes.js`, read `const debug = req.query.debug === "true";` on `POST /api/v1/convert/:srcDataType` and forward `debug` in the worker message. When `debug` is not `"true"`, **do not** run serialization or attach `debugInfo` to the response, preserving exact API compatibility and regression test speed.
2. **Parsed HL7v2 snapshot (`serializeHl7v2Debug(v2)` in `debugCollector.js`):**
   - Convert `parsedData.v2` (`parseHl7v2FieldModel` wrapped with `trackAccess`) **after** `parseAndRender` completes (so access tracking has already recorded which fields/components were read without serializing triggering extra access marks!). Read underlying raw data or use a non-marking reader exported from `hl7v2AccessTracking.js` (verify `hl7v2AccessTracking.js` first so reading for `debugInfo` **never** mutates `unusedSegments`!).
   - Produce `{ segments: [ { line, name, raw, fields: [ { index, value, accessed, repeats: [ { value, components: [ { index, value, accessed, subcomponents } ] } ] } ] } ] }`, omitting null padding at slot `0`.
3. **Liquid variable & partial scope capture (`debugCollector.js`):**
   - Store an optional collector on the CLS `session` (`DEBUG_COLLECTOR` key) during `convertInlineHl7v2` only when `msg.debug === true`.
   - Capture bounded JSON snapshots (max depth `5`, max array preview `50` items, converting HL7 Field/Component objects into `{ __kind: "hl7Field" | "hl7Segment", value, fields/components }` so dotted lookups like `firstSegments.MSH.10` and `firstSegments.PID.5.1.Value` resolve cleanly on the client!):
     - Root scope (`scopes["__root__"]`): snapshot `dataContext` + top-level variables in `ctx.environments` / `ctx.scopes` at the end of root `parseAndRender` (captures all root `{% assign %}`, `{% capture %}`, and `{% evaluate %}` variables such as `firstSegments`, `nk1SegmentLists`, `bundleID`, `patientId`).
     - Partial scopes (`scopes[normalizedTemplateName]`, e.g. `"Resource/_MessageHeader.liquid"`, `"ID/_Bundle.liquid"`): hook `evaluate.js` and LiquidJS partial render (`_parsePartialFile` / `renderTemplates` or custom tag/fs wrapper when collector is active) to record `{ callCount, firstScope, lastScope }` for each rendered partial (cap at `100` distinct partials, `32` keys per scope).
4. **Response shape when `debug=true`:**
   `{ fhirResource, unusedSegments, debugInfo: { durationMs, parsedHl7v2, scopes } }`.

## 5. Browser hover inspector (`src/static/js/debug-hover.js`)

1. **Request & state (`template-editor.js`):**
   - Append `&debug=true` in `getDataTypeSpecificUrl('convert')`.
   - On convert success, store `window.latestDebugInfo = data.debugInfo || null` and dispatch `$(document).trigger('fhir:debug-updated', [window.latestDebugInfo])` (so Spec 05's bottom drawer can subscribe too!).
   - On convert error or empty message, set `window.latestDebugInfo = null`, hide the hover tooltip, and trigger `'fhir:debug-updated'`.
2. **Expression extraction under the pointer (`debug-hover.js`):**
   - Debounce `mousemove` (`180ms`) over `.template-editor .CodeMirror` and `.msg-area .CodeMirror`.
   - Use `cm.coordsChar({left: event.clientX, top: event.clientY}, "window")`. Confirm the pointer actually sits over text on that line (not empty right-hand margin).
   - In `templateCodeEditor`: extract the full dotted token around `pos.ch` matching `/[A-Za-z_][\w]*(?:\.[A-Za-z0-9_]+)*/` (for example hovering over `10` in `firstSegments.MSH.10` resolves **both** `firstSegments.MSH.10` and shows the base `firstSegments.MSH` context; hovering `PID.5.1.Value` resolves `firstSegments.PID.5.1.Value`!). Ignore Liquid keywords (`assign`, `if`, `include`, `using`, `true`, `false`, `null`) and text inside `{% comment %}` blocks (`cm.getTokenTypeAt(pos)` containing `"comment"`).
   - Resolve the dotted path against:
     1. `latestDebugInfo.scopes[activeTemplate.name]?.lastScope` (when viewing a partial tab like `Resource/_MessageHeader.liquid`!)
     2. `latestDebugInfo.scopes.__root__`
     supporting HL7 field/component numeric indexing (`MSH.10` → field 10, `.Value` → string value, `.Repeats` → array).
   - In `dataEditor` (HL7v2 Message pane): map `(line, ch)` to exact HL7 coordinate `SEG-F` / `SEG-F.C` (e.g. `PID-5.1 (Family / Component 1)` = `"DOE"`, Liquid expression `PID.5.1.Value`, plus `Read` vs `Unused` badge!).
3. **Tooltip UI (`#debug-hover-tooltip`):**
   - Single floating `<div>` appended to `body` (`position: fixed; z-index: 1050; max-width: 420px; max-height: 240px; overflow: auto;`), styled with `var(--surface)`, `var(--text)`, `1px solid var(--border)`, `border-radius: 8px`, `12px`/`13px` coding font for values.
   - Displays:
     - Expression header (`firstSegments.MSH.10`) + scope badge (`ADT_A04.liquid` or `Resource/_MessageHeader.liquid · call 1/2`) + `Copy` button.
     - Primary resolved value (`"0123456789"` or `null (empty / unset)`).
     - When the target is a composite HL7 field (e.g. `firstSegments.PID.5`), lists non-empty components (`.1`: `"DOE"`, `.2`: `"JANE"`).
   - Dismisses when the pointer leaves both the token and the tooltip (`150ms` grace so the user can move into the tooltip to click `Copy`), on editor scroll, or on `Escape`.

## 6. Tests and verification

1. `src/lib/liquid-converter/debugCollector.spec.js` and `src/routes.spec.js`:
   - `POST /api/v1/convert/hl7v2` **without** `debug=true` returns no `debugInfo` key, and `unusedSegments` + `fhirResource` are identical with and without `debug=true`!
   - `POST /api/v1/convert/hl7v2?unusedSegments=true&debug=true` on `ADT04-23.hl7` + `ADT_A04.liquid` returns `debugInfo.parsedHl7v2.segments` (containing `MSH`, `PID`), `debugInfo.scopes.__root__.firstSegments`, `debugInfo.scopes.__root__.bundleID`, and `debugInfo.scopes["Resource/_MessageHeader.liquid"]`.
2. Live check on `http://127.0.0.1:2019` (restart server first):
   - Hover `firstSegments.MSH.10` and `bundleID` in `ADT_A04.liquid` → tooltip shows exact values from `ADT04-23.hl7`.
   - Open `Resource/_MessageHeader.liquid` tab and hover `MSH.10` or `ID` → tooltip shows the value captured when `ADT_A04.liquid` included `Resource/MessageHeader`.
   - Hover `NINTENDO` or patient name in the Message pane → tooltip shows the exact `MSH-4` / `PID-5.1` coordinate and read/unused status.

Then run `npm test` and `npm run eslint`.

## 7. Acceptance criteria

- `?debug=true` is strictly opt-in and never changes `fhirResource` or `unusedSegments` counts/marks.
- Hovering variables and HL7 dotted paths (`firstSegments.MSH.10`, `PID.5.1.Value`) displays accurate live values in both root and included partial tabs, in both Light and Dark themes.
