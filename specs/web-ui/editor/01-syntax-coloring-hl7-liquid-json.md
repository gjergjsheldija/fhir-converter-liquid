# Spec 01: Syntax coloring for HL7v2, Liquid, and FHIR JSON

**Status:** Done (2026-11-18).

## 1. Goal

Give each of the three editors accurate syntax coloring using the `fhir` theme tokens (`specs/web-ui/theme/02-editor-theme.md`) and CodeMirror's already-loaded `simple.js` and `multiplex.js` addons:

1. **Message editor (`hl7v2` mode):** highlights 3-letter segment IDs (`MSH`, `EVN`, `PID`, `OBX`), field delimiters (`|`), component/repeat/subcomponent delimiters (`^`, `~`, `&`), HL7 escape sequences (`\T\`, `\F\`, `\X0D\`), and numeric/timestamp fields.
2. **Template editor (`liquid-json` mode):** treats `{% comment %}...{% endcomment %}` as a true comment (fixing the bug where `this` and quoted words inside comments were colored as JS/JSON), colors Liquid tag keywords (`assign`, `evaluate`, `using`, `include`, `if`, `for`, `capture`), variables (`hl7v2Data`, `firstSegments.MSH.10`), and pipe filters (`| get_segment_lists`), and highlights surrounding FHIR JSON with `{name: "javascript", json: true}`.
3. **FHIR result editor (`{name: "javascript", json: true}`):** distinguishes JSON property keys (`"resourceType"`) from string values (`"Bundle"`), numbers, and booleans/null.

Also ensure switching tabs or opening external `.liquid` / `.json` files restores the matching editor mode, and fix `#editor-main` / `#navbar` flex rules.

## 2. Current behavior

1. `src/static/index.html` already loads `/codemirror/addon/mode/simple.js` (line `19`), `/codemirror/addon/mode/multiplex.js` (line `27`), and `/codemirror/mode/javascript/javascript.js` (line `36`).
2. In `src/static/js/template-editor.js`:
   - `dataEditor` uses `mode: {name: "default"}` (no HL7 token coloring).
   - `templateCodeEditor` uses `mode: "application/json"`, which highlights `this` inside `{% comment %}` prose as a purple JS keyword and leaves `{% ... %}` / `{{ ... }}` tags unstyled.
   - `outputCode` uses `mode: {name: "javascript"}` without `json: true`.
3. In `src/static/js/file-browser.js`, `openExternalFile` sets `templateCodeEditor.setOption('mode', 'text/plain')` on `.liquid` files and `changeTab` (`src/static/js/editor-tabs.js`) never resets the mode when returning to a `.liquid` or `.json` tab.
4. In `src/static/css/template-editor.css`, `#editor-main` hardcodes `flex-direction: column` even when `.vertical-content` is removed in `changeDataType('CDA')`, and `#navbar` lacks `flex: 0 0 auto`.

## 3. Files you may edit

- `src/static/js/editor-modes.js` (new)
- `src/static/index.html`
- `src/static/js/template-editor.js`
- `src/static/js/editor-tabs.js`
- `src/static/js/file-browser.js`
- `src/static/css/template-editor.css`

Do not add dependencies or CDN scripts. Do not edit `*.liquid` files.

## 4. Custom CodeMirror modes (`src/static/js/editor-modes.js`)

Load `<script type="text/javascript" src="/js/editor-modes.js"></script>` in `src/static/index.html` before `/js/editor-tabs.js`.

1. **`hl7v2` mode (`CodeMirror.defineSimpleMode("hl7v2", ...)`):**
   - Line start `sol: true` matching `/[A-Z][A-Z0-9]{2}(?=\|)/` → token `"keyword"` (transitions to state `"mshSep"` when the segment is `MSH`, else `"body"`).
   - In `"mshSep"`: first `|` plus up to 4 encoding chars (`/^\|[^\r\n|]{1,4}/`) → `["operator", "meta"]`, next `"body"`.
   - In `"body"`:
     - `/\|/` → `"operator"`
     - `/[\^~&]/` → `"bracket"`
     - `/\\[A-Za-z0-9.+-]+\\/` → `"variable-2"`
     - `/\b\d{4,14}(?:\.\d+)?(?:[+-]\d{4})?\b/` (HL7 timestamps/numbers at delimiter boundaries) → `"number"`
     - `/[^|^~&\\\r\n]+/` → `null` (normal `--text`).

2. **`liquid-inner` mode (`CodeMirror.defineSimpleMode("liquid-inner", ...)`):**
   - Pipe filter `/(\|\s*)([A-Za-z_][\w]*)/` → `["operator", "builtin"]`.
   - Single- or double-quoted strings `/'[^']*'|"[^"]*"/` → `"string"`.
   - Keywords `/(?:assign|capture|endcapture|if|elsif|else|endif|unless|endunless|for|endfor|in|break|continue|case|when|endcase|include|render|evaluate|using|raw|endraw|tablerow|endtablerow|increment|decrement|and|or|not|contains|nil|null|true|false|empty|blank)\b/` → `"keyword"`.
   - Numbers `/\b\d+(?:\.\d+)?\b/` → `"number"`.
   - Operators `/(?:==|!=|<=|>=|<|>|=|:|,|\.\.)/` → `"operator"`.
   - Variable and HL7 property paths `/[A-Za-z_][\w]*(?:\.[A-Za-z0-9_]+)*/` → `"variable"`.

3. **`liquid-json` mode (`CodeMirror.defineMode("liquid-json", ...)` using `CodeMirror.multiplexingMode`):**
   - Outer mode: `CodeMirror.getMode(config, {name: "javascript", json: true})`.
   - Multiplex slices in order:
     1. `{ open: "{%- comment -%}", close: "{%- endcomment -%}", mode: CodeMirror.getMode(config, "text/plain"), delimStyle: "comment", innerStyle: "comment" }`
     2. `{ open: "{% comment -%}", close: "{% endcomment -%}", mode: CodeMirror.getMode(config, "text/plain"), delimStyle: "comment", innerStyle: "comment" }` (cover all 4 dash combinations of `{%[-]? comment [-]?%}` and `{%[-]? endcomment [-]?%}`, or write a small custom stateful wrapper mode so any whitespace/trim dash variant of `comment`/`endcomment` and `raw`/`endraw` is handled cleanly without regex limitations if `multiplexingMode` only takes string delimiters — verify in `node_modules/codemirror/addon/mode/multiplex.js` first! Note: CodeMirror 5 `multiplexingMode` requires string `open`/`close`, so either list the 4 trim variants `"{% comment %}"`, `"{% comment -%}"`, `"{%- comment %}"`, `"{%- comment -%}"` with `"endcomment"` or implement a 60-line stateful overlay mode delegating outer tokens to `{name: "javascript", json: true}` so arbitrary spaces inside `{% comment %}` work).
     3. `{ open: "{%-", close: "-%}", mode: liquidInner, delimStyle: "meta" }`, `{ open: "{%-", close: "%}", ... }`, `{ open: "{%", close: "-%}", ... }`, `{ open: "{%", close: "%}", ... }`.
     4. `{ open: "{{-", close: "-}}", mode: liquidInner, delimStyle: "meta" }`, `{ open: "{{-", close: "}}", ... }`, `{ open: "{{", close: "-}}", ... }`, `{ open: "{{", close: "}}", ... }`.

4. **Helper `templateEditorModeForName(name)` on `window`:**
   - Returns `{name: "javascript", json: true}` when `/\.json$/i.test(name)`.
   - Returns `"liquid-json"` when `!name || name === "untitled" || /\.liquid$/i.test(name)`.
   - Returns `"text/plain"` otherwise.

## 5. Wire editors and layout

1. In `src/static/js/template-editor.js`:
   - Initialize `dataEditor` with `mode: "hl7v2"`. In `changeDataType`, set `"hl7v2"` for `'HL7V2'` and `"xml"` for `'CDA'`.
   - Initialize `templateCodeEditor` with `mode: "liquid-json"`.
   - Initialize `outputCode` with `mode: {name: "javascript", json: true}`.
2. In `src/static/js/hdc-hint.js` (read first; only if needed): verify `Ctrl-Space` and auto-hint still invoke `CodeMirror.hint.anyword` when `templateCodeEditor` uses `"liquid-json"`. If `liquid-json` has no mode-specific hint helper, `show-hint.js` automatically falls back to `CodeMirror.hint.anyword` — verify in the live page!
3. In `src/static/js/editor-tabs.js` (`changeTab`) and `src/static/js/file-browser.js` (`openExternalFile`), set `templateCodeEditor.setOption("mode", templateEditorModeForName(name))`.
4. In `src/static/css/template-editor.css`:
   - Change `#editor-main` `flex-direction: column` to `flex-direction: row` and add `#editor-main.vertical-content { flex-direction: column; }`.
   - Add `flex: 0 0 auto;` to `#navbar`.

## 6. How to check

Open `http://127.0.0.1:2019`.

1. **Message pane:** `MSH`, `EVN`, `PID`, `PV1` are colored with `--syntax-keyword`, `|` and `^` use `--syntax-punctuation`, and unused-segment red dotted underlines still align to the exact character offsets.
2. **Template pane:** Open `ADT_A04.liquid`, then open `Resource/_MessageHeader.liquid` from `Includes ▾`:
   - Lines 1–11 (`{% comment -%} ... {% endcomment -%}`) are uniformly styled in italic `--syntax-comment`; the word `this` on line 2 is **not** purple!
   - `{% evaluate`, `using`, `{% include`, `{% assign` are `--syntax-keyword`, filter names after `|` (`get_segment_lists`) are `--syntax-property`, and JSON keys (`"resourceType"`) vs string values (`"Bundle"`) are distinct in both Light and Dark themes.
   - Typing `| get_segment_list` still opens the autocomplete hint popup.
3. **FHIR result pane:** JSON keys use `.cm-property` (`--syntax-property`) and string values use `.cm-string` (`--syntax-string`).

Then run `npm test` and `npm run eslint`.

## 7. Acceptance criteria

- `dataEditor` uses `hl7v2`, `templateCodeEditor` uses `liquid-json` (and JSON mode on `.json` partials), and `outputCode` uses `{name: "javascript", json: true}` in both Light and Dark themes.
- `{% comment %}...{% endcomment %}` blocks render entirely as comments with no false JS/JSON tokens inside.
- Unused-segment underlines and Liquid autocomplete continue working unchanged.
