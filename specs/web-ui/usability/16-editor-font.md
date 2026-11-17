# Spec 16: Use a coding font in the editors

**Status:** Done. Implemented in commit 4b27988 (the spec's `.CodeMirror, .CodeMirror-hints` rule — `ui-monospace, "SF Mono", Menlo, Consolas, monospace` at `13px` with `line-height: 1.45` — added after the existing `.CodeMirror` block in `src/static/css/template-editor.css`; the block's height/width declarations and the spec 01 `height: auto` rules are untouched, no font file added, no JavaScript or `index.html` changes).

## 1. Goal

The message editor, the template editor, and the result editor use one coding face at 13px. The navbar, the file list, the buttons, and the settings dialog stay on the system UI font.

On this Mac, `Segoe UI` is not installed, so the chrome already falls through to `system-ui`. Leave that. The editors are the part that changes. They currently use the CSS generic `monospace` at the page's 16px size, which is large for these panes and draws `|`, `^`, and `~` poorly. Those characters are what a person reads in an HL7 segment and in Liquid.

## 2. Current behavior

`node_modules/codemirror/lib/codemirror.css` sets:

```css
.CodeMirror {
  font-family: monospace;
  height: 300px;
}
```

It does not set `font-size`. `line-height` on the line nodes is `inherit`. Bootstrap's reboot sets `body` to `font-size: 1rem` (16px) and `line-height: 1.5`. `src/static/css/template-editor.css` replaces the body family and does not set a size:

```css
body {
    font-family: "Segoe UI", system-ui, sans-serif;
}
```

So each CodeMirror inherits 16px and a 1.5 line-height, with whatever face the browser uses for the generic `monospace`.

The same project file already has a `.CodeMirror` rule that only sets height and width. A later rule sets `height: auto` on `.msg-area .CodeMirror`, `.output-area .CodeMirror`, and `.template-editor .CodeMirror`. Do not change those height rules in this spec. Spec 01 owns them. If spec 01 has already replaced `height: auto`, leave that replacement in place.

`node_modules/codemirror/addon/hint/show-hint.css` sets `.CodeMirror-hints` to `font-family: monospace` and `font-size: 90%`. `index.html` loads `show-hint.css` before `/css/template-editor.css`, so a rule in the project file overrides it.

The themes `eclipse` and `blackboard` do not set a font. Dark mode calls `setOption("theme", ...)` and must not need a second font assignment.

There are three editors, created in `template-editor.js` from `#databox`, `#templatebox`, and `#resultbox`. Do not edit that file for this spec. The stylesheet is in the document before those editors are created, so CodeMirror measures the new face on init. No `refresh()` call is required.

## 3. Files you may edit

- `src/static/css/template-editor.css`

Do not add a font file. Do not add a dependency. Do not edit `index.html`, the CodeMirror package, or any `*.liquid` file.

## 4. CSS

Add this rule after the existing `.CodeMirror` block. Do not delete the height declarations in that block.

```css
.CodeMirror,
.CodeMirror-hints {
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    font-size: 13px;
    line-height: 1.45;
}
```

Use that stack in that order. `ui-monospace` selects the platform coding face. `SF Mono` and `Menlo` cover macOS when `ui-monospace` is missing. `Consolas` covers Windows. `monospace` is the last fallback.

`font-size: 13px` is the size for all three editors and for the autocomplete list. Do not use `0.85rem` or `90%`. Those follow the body size and would change if the body size changes.

`line-height: 1.45` replaces the inherited 1.5 for editor lines and for hint rows. Do not set a line-height on `body`.

Line numbers sit inside `.CodeMirror` and inherit this face and size. Leave `.CodeMirror-linenumber` color and padding alone.

## 5. What stays the same

- `body` keeps `font-family: "Segoe UI", system-ui, sans-serif`.
- File-browser rows stay at `font-size: 13px` on the body font. Do not set them to the coding face.
- Pane headers, buttons, the settings dialog, and the generate dialog stay on the body font.
- Editor height, wrapping, and theme colors stay as they are.
- Do not add a font setting to the settings dialog.

## 6. How to check

Open `http://localhost:2019` and load `ADT04-23.hl7` and `ADT_A04.liquid`.

1. In the console, `getComputedStyle(document.querySelector('.msg-area .CodeMirror')).fontSize` is `13px`.
2. The same element's `fontFamily` lists `ui-monospace` first.
3. The template editor and the result editor report the same `fontSize` and the same `fontFamily`.
4. `getComputedStyle(document.querySelector('#navbar')).fontFamily` does not contain `ui-monospace`, `Menlo`, or `Consolas`.
5. A `|` in the message and a `|` in the template are the same width. `^` and `~` are distinct from each other.
6. Open settings and turn dark mode on. The three editors keep `13px` and the same family.
7. In the template editor, type `| abs` so the hint list opens. A hint row is 13px and uses the same family. The file list is still the UI font.

Then run `npm test` and `npm run eslint`.

## 7. Acceptance criteria

- The three editors and the hint list use `ui-monospace, "SF Mono", Menlo, Consolas, monospace` at `13px` with `line-height: 1.45`.
- The rest of the page keeps the existing UI font.
- No font file is added, and no JavaScript file is modified.
