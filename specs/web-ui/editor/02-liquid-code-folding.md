# Spec 02: Code folding in the Liquid template editor

**Status:** Done (2026-11-18).

## 1. Goal

Enable gutter fold markers and `Ctrl-Q` code folding in the Liquid template editor (`templateCodeEditor`), matching the FHIR result editor, and fold **both** JSON `{ ... }` / `[ ... ]` blocks and multi-line Liquid blocks (`{% comment %}`, `{% if %}`, `{% unless %}`, `{% for %}`, `{% capture %}`, `{% case %}`, `{% raw %}`).

## 2. Current behavior

- `dataEditor` and `outputCode` in `src/static/js/template-editor.js` configure `foldGutter: true`, `gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"]`, and `"Ctrl-Q": function (cm) { cm.foldCode(cm.getCursor()); }`.
- `templateCodeEditor` omits `foldGutter`, `CodeMirror-foldgutter`, and `Ctrl-Q`.
- `src/static/index.html` already loads `foldcode.js`, `foldgutter.js`, `brace-fold.js`, and `foldgutter.css` (lines `20–26` and `31`). `CodeMirror.fold.brace` folds `{...}` and `[...]`, and has no helper for Liquid block tags such as the 11-line `{% comment -%} ... {% endcomment -%}` header at the top of `Resource/_MessageHeader.liquid`.

## 3. Files you may edit

- `src/static/js/liquid-fold.js` (new)
- `src/static/index.html`
- `src/static/js/template-editor.js`
- `test/liquid-fold.spec.js` (new — pure unit test of the line-matching fold range finder)

Do not edit `*.liquid` files or add dependencies.

## 4. Liquid block range finder (`src/static/js/liquid-fold.js`)

Expose a pure helper `findLiquidBlockEnd(getLine, lineCount, startLine)` (testable in Node when imported or evaluated, and attached to `CodeMirror.registerHelper("fold", "liquid", ...)` in the browser):

1. Inspect `firstLine = getLine(startLine)`. Look for an opening Liquid block tag on `startLine` that is **not** closed on the same line:
   - Opening tags and their matching closing tags:
     - `comment` → `endcomment`
     - `raw` → `endraw`
     - `if` → `endif`
     - `unless` → `endunless`
     - `for` → `endfor`
     - `capture` → `endcapture`
     - `case` → `endcase`
     - `tablerow` → `endtablerow`
   - Match tags with `/\{%-?\s*(end(?:comment|raw|if|unless|for|capture|case|tablerow)|comment|raw|if|unless|for|capture|case|tablerow)\b([\s\S]*?)-?%\}/g`.
2. Track nesting depth starting from the first unmatched opener on `startLine`:
   - Inside `comment` or `raw`, ignore all nested tags except the matching `endcomment` or `endraw`.
   - For `if`/`unless`/`for`/`capture`/`case`/`tablerow`, increment depth on the same tag type and decrement on `end<tag>`.
3. When depth reaches `0` on line `endLine > startLine`, return `{ from: CodeMirror.Pos(startLine, openTagEndCh), to: CodeMirror.Pos(endLine, closeTagStartCh) }` so folding collapses everything between the opening `{% ... %}` tag and the closing `{% end... %}` tag (or up to the end of `endLine - 1`, matching `CodeMirror.fold.brace` style so the closing `{% endif %}` / `{% endcomment %}` remains visible on its own line!). Keeping the closing tag line visible (`to: CodeMirror.Pos(endLine - 1, getLine(endLine - 1).length)` when `endLine > startLine + 1`, or up to `closeTagStartCh` on `endLine` for 2-line blocks) matches IDE block folding.
4. When no unclosed Liquid block opens on `startLine`, return `undefined` so `CodeMirror.fold.combine` falls through to `CodeMirror.fold.brace`.

## 5. Wire `templateCodeEditor`

1. Load `<script type="text/javascript" src="/js/liquid-fold.js"></script>` in `src/static/index.html` after `brace-fold.js` and before `template-editor.js`.
2. In `src/static/js/template-editor.js`, add to `templateCodeEditor` options:
   - `foldGutter: true`
   - `gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"]`
   - `foldOptions: { rangeFinder: CodeMirror.fold.combine(CodeMirror.fold.liquid, CodeMirror.fold.brace) }`
   - Add `"Ctrl-Q": function (cm) { cm.foldCode(cm.getCursor()); }` to `extrakeysObj` alongside `"Tab"` and `hintExtraKeysObj`.

## 6. Tests and verification

1. `test/liquid-fold.spec.js`:
   - Folds a multi-line `{% comment -%} ... {% endcomment -%}` block even when the comment prose contains the words `{% if %}` without `{% endif %}`.
   - Folds nested `{% if a %} ... {% if b %} ... {% endif %} ... {% endif %}` to the outer `endif`, not the inner one.
   - Returns `null`/`undefined` on single-line `{% if x %}1{% endif %}` and on `{% assign x = 1 %}` so brace folding can still handle `{` on the same or other lines.
2. Live check on `http://127.0.0.1:2019`:
   - Open `Resource/_MessageHeader.liquid`. Click the fold triangle on line 1 (`{% comment -%}`) — lines 2–10 collapse cleanly!
   - Click the fold triangle on line 12 (`{`) or a `{% if %}` block — both JSON braces and Liquid blocks fold and unfold via gutter click and `Ctrl-Q`.

Then run `npm test` and `npm run eslint`.

## 7. Acceptance criteria

- `templateCodeEditor` shows fold gutter markers and responds to `Ctrl-Q`.
- Both Liquid block tags (`comment`, `raw`, `if`, `unless`, `for`, `capture`, `case`) and JSON `{...}` / `[...]` fold accurately, including nested blocks.
