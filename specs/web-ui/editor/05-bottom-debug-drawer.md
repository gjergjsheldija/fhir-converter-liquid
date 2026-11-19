# Spec 05: Chrome-DevTools-style bottom Debug and Inspector drawer

**Status:** Done (2026-11-18). Collapsible, draggable bottom Debug & Inspector drawer (`debug-drawer.js`) with Parsed HL7 tree, Variables & Console live evaluator, and Diagnostics/Bundle jump links implemented inside `#editor-main` beneath `#editor-panes`.

## 1. Goal

Add a collapsible, vertically resizable bottom **Debug / Inspector drawer** (`#debug-drawer`) inspired by Chrome DevTools so developers can:

1. **Browse Parsed Data (`Parsed HL7`):** Expand segments → fields → repeats → components as an interactive tree, filter by segment/value, see which fields were read vs unused, click any node to highlight that segment/field in the Message editor, and copy its Liquid path (`firstSegments.PID.5.1.Value`).
2. **Inspect Variables & Evaluate Paths (`Variables & Console`):** Expand root variables and partial invocation scopes from `window.latestDebugInfo.scopes`, and type any variable or dotted HL7 path (`firstSegments.MSH.10`, `patientId`, `MSH.9.1.Value`) into a live console prompt at the bottom to inspect its value immediately.
3. **Jump through Diagnostics & Resources (`Diagnostics & Bundle`):** View conversion duration, rendered FHIR Bundle entries grouped/listed with one-click jump to that entry's line in the FHIR result editor, and clickable unused HL7 fields / conversion errors.

## 2. Current behavior

- Spec 04 populates `window.latestDebugInfo` (`{ durationMs, parsedHl7v2, scopes }`) after every conversion and fires `$(document).trigger('fhir:debug-updated', [window.latestDebugInfo])`.
- `#editor-main` contains `.msg-area` and `.editor-area` split vertically by Split.js. There is no bottom inspector drawer.

## 3. Files you may edit

- `src/static/js/debug-drawer.js` (new)
- `src/static/index.html`
- `src/static/css/template-editor.css`
- `src/static/js/template-editor.js` (minimal hook to expose `unusedSegments` on `latestDebugInfo` if not already attached, and call `refreshEditors()` when drawer resizes)

Do not add npm dependencies or CDN scripts. Do not edit `*.liquid` files.

## 4. Layout and toggle

1. **Navbar toggle button (`src/static/index.html`):**
   - In `#navbar`, immediately before `#settings-open`, add `<button class="btn btn-outline-dark navbar-btn ml-2" id="debug-toggle-button" type="button" aria-expanded="false" aria-controls="debug-drawer" title="Toggle Debug drawer (Ctrl+`)">Debug</button>`.
2. **Drawer markup inside `#editor-main` (after `.editor-area`):**
   ```html
   <div id="debug-drawer-resizer" role="separator" aria-orientation="horizontal" aria-label="Resize debug drawer" hidden></div>
   <section id="debug-drawer" aria-label="Conversion debugger" hidden>
       <div class="debug-drawer-header">
           <div class="debug-drawer-tabs" role="tablist">
               <button type="button" role="tab" data-debug-tab="hl7" aria-selected="true" class="is-active">Parsed HL7</button>
               <button type="button" role="tab" data-debug-tab="vars" aria-selected="false">Variables &amp; Console</button>
               <button type="button" role="tab" data-debug-tab="diag" aria-selected="false">Diagnostics &amp; Bundle</button>
           </div>
           <input id="debug-tree-filter" class="form-control form-control-sm" type="text" placeholder="Filter tree…" aria-label="Filter debug view">
           <span id="debug-timing" class="debug-meta"></span>
           <button type="button" id="debug-drawer-close" class="file-browser-toggle" aria-label="Close debug drawer" title="Close (Ctrl+`)">&times;</button>
       </div>
       <div class="debug-drawer-body">
           <div id="debug-panel-hl7" class="debug-panel"></div>
           <div id="debug-panel-vars" class="debug-panel" hidden>
               <div id="debug-vars-tree" class="debug-tree-scroll"></div>
               <div class="debug-console-bar">
                   <span class="debug-console-prompt" aria-hidden="true">&gt;</span>
                   <input id="debug-console-input" type="text" placeholder="Evaluate variable or path, e.g. firstSegments.MSH.10" aria-label="Evaluate Liquid variable or HL7 path">
                   <span id="debug-console-output"></span>
               </div>
           </div>
           <div id="debug-panel-diag" class="debug-panel" hidden></div>
       </div>
   </section>
   ```
3. **Sizing & viewport lock (Spec 01 invariant):**
   - While `#debug-drawer` is open, `.msg-area` + `.editor-area` stay inside a flex wrapper `#editor-panes` (`flex: 1 1 auto; min-height: 0; overflow: hidden; display: flex; flex-direction: column;` — wrap `.msg-area` and `.editor-area` in `<div id="editor-panes" class="vertical-content">` so Split.js percentage heights apply to `#editor-panes` while `#debug-drawer` sits cleanly below `#editor-panes` inside `#editor-main` without fighting Split.js inline percentage heights!).
   - `#debug-drawer` has `flex: 0 0 220px; height: 220px; min-height: 130px; max-height: 55vh; display: flex; flex-direction: column; overflow: hidden; background: var(--surface); border: 1px solid var(--border); border-radius: 12px;`.
   - Dragging `#debug-drawer-resizer` (`height: 6px; cursor: row-resize;`) clamps height between `130px` and `Math.min(440, window.innerHeight * 0.55)`, saves `fhirConverterDebugHeight` in `localStorage`, and calls `refreshEditors()`.
   - Toggling `#debug-toggle-button`, `#debug-drawer-close`, or `` Ctrl+` `` opens/closes the drawer, saves `fhirConverterDebugOpen` in `localStorage`, and calls `refreshEditors()`.

## 5. Three Inspector Views (`src/static/js/debug-drawer.js`)

Render nodes lazily on expand (`▾` / `▸` buttons) so a 100-segment ORU message stays instant:

1. **`Parsed HL7` tab:**
   - Top-level rows: one per segment (`0: MSH`, `1: EVN`, `2: PID — DOE^JANE`, ...). Clicking a segment scrolls `dataEditor` to that line and briefly highlights it.
   - Expanding a segment shows its non-empty 1-based fields (`PID.3 = "12345^^^CLINIC^MR"`, `PID.5 = "DOE^JANE"`), each with a `read` / `unused` pill (`--include` vs `--unread`) and a `Copy path` button (`firstSegments.PID.5.Value` when first occurrence of that segment, or `PID.5.Value`). Expanding a composite/repeated field reveals repeats and 1-based components (`PID.5.1 = "DOE"`, `PID.5.2 = "JANE"`).
   - `#debug-tree-filter` filters segments and fields matching segment code, coordinate (`PID.5`), or value (`JANE`).
2. **`Variables & Console` tab:**
   - Expandable tree of `Scopes`: `Root (<topTemplateName>)` listing all captured variables (`bundleID`, `patientId`, `firstSegments`, segment lists) + `Included Partials` listing each rendered partial (`Resource/_MessageHeader.liquid ×1`, `Resource/_Organization.liquid ×3`) and its `lastScope` bindings.
   - Bottom console input (`#debug-console-input`): reuses Spec 04's path resolver against the active template's scope (`lastScope` → `__root__`). Typing `firstSegments.MSH.10` or `bundleID` prints the resolved value inline in `#debug-console-output` (and pressing `Enter` appends `{ expr, scope, value }` to a compact console history above the prompt, with Up/Down arrow history!).
3. **`Diagnostics & Bundle` tab:**
   - Shows `Converted in <durationMs> ms` in `#debug-timing`.
   - **Bundle Resources (`N`):** lists each `entry[i].resource` (`Patient / d5fe6802...`, `MessageHeader / ...`). Clicking a row searches `outputCode` for `"id": "<id>"` (or the `i`th `"resource": {`) and scrolls `outputCode` directly to that resource!
   - **Unused HL7 Fields (`M`):** lists each unread component (`MSH-3.1 = "NES"`, `PID-7.1 = "19800101"`). Clicking a row scrolls `dataEditor` and places the cursor at that exact line/column.

## 6. How to check

1. Open `http://127.0.0.1:2019`. Confirm the drawer starts closed and `document.documentElement.scrollHeight <= window.innerHeight + 1`.
2. Click `Debug` (or press `` Ctrl+` ``). The bottom drawer opens; all three CodeMirror panes remain scrollable inside the viewport (`scrollHeight <= innerHeight + 1`), and Split.js splitters between Message, Template, and FHIR result still drag smoothly.
3. Expand `PID` in **Parsed HL7**, click `PID.5`, confirm `dataEditor` jumps to the `PID` line, and click `Copy path`.
4. Switch to **Variables & Console**, expand `Root` and `Resource/_MessageHeader.liquid`, then type `firstSegments.MSH.10` in the `>` prompt — confirm the live value appears.
5. Switch to **Diagnostics & Bundle**, click `Patient / ...` — confirm `outputCode` scrolls straight to the `Patient` entry in the FHIR Bundle.
6. Switch to Dark theme (`data-theme="dark"`). Confirm every tree row, badge, resizer, and console prompt uses the dark tokens cleanly.

Then run `npm test` and `npm run eslint`.

## 7. Acceptance criteria

- Collapsible, draggable bottom Debug drawer works with `Debug` button and `` Ctrl+` `` without ever breaking Spec 01's locked viewport or Split.js panes.
- Parsed HL7 tree, Variables & Console live evaluator, and Bundle/Unused jump links work in both Light and Dark themes.
