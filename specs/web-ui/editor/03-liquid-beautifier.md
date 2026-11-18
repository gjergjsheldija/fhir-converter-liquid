# Spec 03: Safe Liquid + JSON template beautifier

**Status:** Done (2026-11-18). `Format` button + `Shift-Alt-F` wired to a safe in-buffer beautifier (`src/static/js/liquid-beautifier.js`, single-step `replaceRange` undo); 5 mocha tests pass, incl. render-equivalence of formatted vs unformatted `ADT_A04`+`ID/_Location` via supertest — the `normalizeTag` trim-flag fix (tight `{%-X` / `X-%}` forms are unconditional whitespace-control flags) made the formatted template transform-stable.

## 1. Goal

Add a **`Format`** button (and `Shift-Alt-F` keyboard shortcut) to the Template pane that cleanly indents Liquid control blocks and FHIR JSON braces/brackets in the open editor buffer — without corrupting DotLiquid whitespace-control markers (`-%}`, `{%-`, `{{-`, `-}}`), `{% comment %}` prose, `{% raw %}` blocks, or string literals, and with single-step `Cmd/Ctrl-Z` undo.

## 2. Current behavior and safety constraints

- There is no template formatter in the UI. `Tab` in `templateCodeEditor` inserts 4 spaces (`Array(5).join(" ")`).
- Liquid templates in this project mix Liquid tags (`{% if %}`, `{% for %}`, `{% capture %}`, `{% assign %}`, `{% evaluate %}`) with JSON object/array fragments (`{`, `}`, `[`, `]`) where commas and braces can sit conditionally inside `{% if %}` branches.
- **Why off-the-shelf JSON or HTML formatters break FHIR Liquid templates:**
  1. `JSON.parse` fails because of `{% ... %}` and `{{ ... }}`.
  2. Stripping or adding `-` inside `{% ... -%}` changes captured output in `ID/_*.liquid` and breaks deterministic UUID generation.
  3. Reflowing lines inside `{% comment %}...{% endcomment %}` or `{% raw %}...{% endraw %}` mangles documentation tables and raw blocks.
- **Immutability rule (`AGENTS.md`):** Format operates strictly on the in-memory `templateCodeEditor` buffer when triggered by the user in the browser. Never run the formatter over `src/templates/**/*.liquid` on disk.

## 3. Files you may edit

- `src/static/js/liquid-beautifier.js` (new — isomorphic module: works as ES/global browser script and importable from Node tests via `globalThis` or ESM/UMD export; check `"type": "module"` in `package.json`: browser scripts loaded via `<script src="/js/...">` without `type="module"` cannot use `export` syntax! Put the pure algorithm in `src/lib/liquid-converter/liquidBeautifier.js` or expose `window.beautifyLiquidTemplate` in `src/static/js/liquid-beautifier.js` without `export` syntax and test it by importing a thin ESM wrapper or serving `src/static/js/liquid-beautifier.js` — specifically: write pure `src/static/js/liquid-beautifier.js` attaching `(typeof globalThis !== 'undefined' ? globalThis : window).beautifyLiquidTemplate = beautifyLiquidTemplate;` with **no** `export` keyword so classic `<script>` tags parse it cleanly AND Node tests can `await import('../src/static/js/liquid-beautifier.js')` and read `globalThis.beautifyLiquidTemplate`!).
- `test/liquid-beautifier.spec.js` (new)
- `src/static/index.html`
- `src/static/js/template-editor.js`

Do not add npm dependencies. Do not edit any `*.liquid` file.

## 4. Formatting rules (`beautifyLiquidTemplate(source, options)`)

Default indent unit: `'    '` (4 spaces, matching `template-editor.js` `Tab`). Normalize line endings to `\n`, preserve a single trailing `\n` if `source` ended with one.

Process line-by-line with block-state tracking:

1. **Verbatim blocks (`comment` and `raw`):**
   - The line opening `{%[-]? comment [-]?%}` is indented at the current indent depth; every line until the matching `{%[-]? endcomment [-]?%}` is kept **verbatim** (preserve internal indentation and blank lines, only trim trailing spaces on non-raw comment lines? Even safer: keep every character inside `comment` and `raw` bodies completely unchanged!). Indent the closing `{% endcomment %}` line at the opener's indent depth.
2. **Tag delimiter spacing normalization (outside `comment`, `raw`, and quoted strings):**
   - Normalize internal padding right inside delimiters to a single space while keeping `-` flags untouched:
     - `{%-assign x = 1-%}` → `{%- assign x = 1 -%}`
     - `{{firstSegments.PID.5.1.Value}}` → `{{ firstSegments.PID.5.1.Value }}`
   - Never alter text inside `'...'` or `"..."` string literals.
3. **Indentation calculation (`liquidDepth` + `jsonDepth`):**
   - Count JSON `{` / `[` (`+1`) and `}` / `]` (`-1`) outside quoted strings and outside `{% ... %}` / `{{ ... }}` tags.
   - Count Liquid block tags on each line:
     - Openers (`+1` after the line): `if`, `unless`, `for`, `case`, `capture`, `tablerow`.
     - Closers (`-1` before the line): `endif`, `endunless`, `endfor`, `endcase`, `endcapture`, `endtablerow`.
     - Mid-block branches (`-1` on that line only, `+1` after): `else`, `elsif`, `when`.
   - Leading closing braces/brackets (`^[\s]*[}\]]`) reduce the current line's effective indent by the number of leading closers before printing the line, clamped to `>= 0`.
   - Blank lines output `''` (no whitespace-only lines); collapse runs of `>= 3` consecutive blank lines to at most `1` blank line.
4. **JSON-only mode:** When the active tab name ends with `.json` (`CodeSystem/CodeSystem.json`), try `JSON.stringify(JSON.parse(source), null, 4)`; if `JSON.parse` throws, leave the buffer unchanged and call `showConversionError('Cannot format invalid JSON.')`.

## 5. UI integration

1. In `src/static/index.html`, inside `.template-area .pane-header`, add a `Format` button (`id="format-template-button"`, `class="btn btn-sm btn-outline-dark"`) immediately before `#generate-template-button` (`New` · `Format` · `Generate` · `Save`). Load `<script type="text/javascript" src="/js/liquid-beautifier.js"></script>` before `template-editor.js`.
2. Add `formatActiveTemplate()` in `src/static/js/template-editor.js`:
   - Read `current = templateCodeEditor.getValue()`.
   - Compute `formatted` (using JSON pretty-print for `.json` tabs, `beautifyLiquidTemplate(current)` otherwise).
   - If `formatted === current`, return without dirtying undo history.
   - Save cursor `{line, ch}` and scroll `{left, top}` (`templateCodeEditor.getScrollInfo()`), replace buffer in one undoable step using `templateCodeEditor.replaceRange(formatted, {line: 0, ch: 0}, {line: doc.lastLine(), ch: doc.getLine(doc.lastLine()).length})`, clamp and restore cursor + scroll, and focus `templateCodeEditor`. (The `change` listener automatically updates dirty state, includes, and live conversion!)
3. Bind `#format-template-button` `click` and CodeMirror `extraKeys["Shift-Alt-F"]` to `formatActiveTemplate`.

## 6. Tests and verification

In `test/liquid-beautifier.spec.js`:

1. Indents unindented nested `{% if %}` + `{ "resourceType": "Patient", "name": [ ... ] }` + `{% else %}` + `{% endif %}` cleanly to 4-space steps.
2. Preserves `-%}`, `{%-`, `{{-`, and `-}}` flags byte-for-byte.
3. Leaves lines inside `{% comment -%} ... {% endcomment -%}` and `{% raw %} ... {% endraw %}` untouched.
4. Idempotency: `beautifyLiquidTemplate(beautifyLiquidTemplate(sample)) === beautifyLiquidTemplate(sample)`.
5. Rendering equivalence check: read `src/templates/Hl7v2/ADT_A04.liquid` and `src/templates/Hl7v2/ID/_Location.liquid` in memory (read-only!), pass through `beautifyLiquidTemplate`, render `ADT04-23.hl7` in memory, and assert the resulting FHIR `Bundle` deep-equals the unformatted template's `Bundle`!

Then run `npm test`, `npm run eslint`, and verify on `http://127.0.0.1:2019` that clicking `Format` indents messy Liquid and `Cmd/Ctrl-Z` undoes it in one step.

## 7. Acceptance criteria

- `Format` and `Shift-Alt-F` indent Liquid blocks and JSON braces cleanly to 4 spaces in a single undo step.
- Whitespace trim dashes (`-`), comments, raw blocks, and conversion output semantics are preserved.
- Zero vendored `*.liquid` files on disk are modified.
