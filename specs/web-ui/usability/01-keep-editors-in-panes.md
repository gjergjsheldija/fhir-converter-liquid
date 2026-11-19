# Spec 01: Keep the editors inside their panes

**Status:** Done. Checked on 17 Nov 2026 in the running page. `html` and `body` are `height: 100%` with `overflow: hidden`. `.editor-content` no longer sets `height: 90%`. `.editor-area` has `min-height: 0`, `overflow: hidden`, and `align-items: stretch`. The three CodeMirror boxes use `height: 100% !important` so an inline pixel height cannot grow the document. After converting `ADT04-23.hl7` with `ADT_A04.liquid`, `document.documentElement.scrollHeight` equalled the viewport (626px) and each editor's scroll height was greater than its client height. `refreshEditors()` was already called from convert, splitter drag, and window resize.

## 1. Goal

After a conversion, the FHIR result must scroll inside the result pane. The document itself must not grow with the JSON. The message editor and the template editor scroll inside their own panes. Dragging a splitter keeps that true.

## 2. Current behavior

Checked against the worktree on 17 Nov 2026, after specs 02–16. The `height: auto` rule this spec originally described is already gone. The three editors use `height: 100%` and `min-height: 0`, and `body` and `.container-fluid.h-100` use `overflow: hidden`.

That did not make the panes scroll. On `http://localhost:2019`, after `ADT04-23.hl7` converted with `ADT_A04.liquid`, the result CodeMirror's border box was about 25,000px tall in a viewport about 626px tall. `document.body` scroll height was about 26,000px. `overflow: hidden` clips that box, so the wheel does nothing: the scrollable element is as tall as the document, and the window only shows the top. The message pane sizes to the wrapped HL7 text, and the template and result are a strip at the bottom. `.editor-area` is not in the `min-height: 0; overflow: hidden` rule that `.msg-area`, `.output-area`, and `.template-area` have.

`#editor-wrapper` is a flex child with `min-height: 0` and `overflow: hidden`. It does not use `height: calc(100vh - 74px)`.

Keep the height and overflow rules that are already present. The remaining work is to make each editor's used height the pane, not the document, including `.editor-area`.

`changeDataType` in `src/static/js/template-editor.js` builds two Split.js splits. The HL7v2 path is the one the page uses (`changeDataType('HL7V2')` on startup):

- `.template-area` / `.output-area`, sizes `[50, 50]`, gutter `5`
- `.msg-area` / `.editor-area`, vertical, sizes `[30, 70]`, gutter `5`

There is a second, horizontal branch for `CDA`. Update both branches. The page still starts with HL7v2 only. Do not add a data-type control.

## 3. Files you may edit

- `src/static/css/template-editor.css`
- `src/static/js/template-editor.js`

Do not edit `index.html` in this spec. Do not edit Liquid templates, sample messages, or server code.

## 4. CSS

Make the page a fixed column and give every editor pane a bounded height.

1. `html` and `body`: `height: 100%`, `overflow: hidden`. Keep `body { margin: 0; }`.
2. `.container-fluid.h-100`: `height: 100vh`, `display: flex`, `flex-direction: column`, `overflow: hidden`, `min-height: 0`.
3. `#navbar`: `flex: 0 0 auto`.
4. `#banner`: `flex: 0 0 auto`.
5. `#editor-wrapper`: remove the `height: calc(100vh - 74px)` and `height: calc(100vh - 90px)` declarations. The later rule in the file wins today; delete both fixed heights. Set `flex: 1 1 auto`, `min-height: 0`, `overflow: hidden`. Keep `display: flex`, the row direction, the `12px` padding, and the `12px` gap.
6. `#conversion-error`: `flex: 0 0 auto`.
7. `#file-browser`: `height: 100%`, `min-height: 0`, `overflow: auto`. Keep its width.
8. `#editor-main`: `height: 100%`, `min-height: 0`, `overflow: hidden`.
9. `.msg-area`, `.editor-area`, `.template-area`, `.output-area`, `.template-editor`: add `min-height: 0` and `overflow: hidden`.
10. Replace the `height: auto` rule with:

```css
.msg-area .CodeMirror,
.output-area .CodeMirror,
.template-editor .CodeMirror {
    flex: 1 1 auto;
    height: 100%;
    min-height: 0;
}
```

11. `.CodeMirror-scroll` inside those three editors must be the scroller. Add:

```css
.msg-area .CodeMirror-scroll,
.output-area .CodeMirror-scroll,
.template-editor .CodeMirror-scroll {
    height: 100%;
    overflow: auto;
}
```

Do not change colors, radii, or the file-browser layout beyond the height and overflow above.

## 5. Refresh after size changes

CodeMirror measures itself when content or the pane size changes. In `template-editor.js`:

1. Add `refreshEditors()` that calls `refresh()` on `dataEditor`, `templateCodeEditor`, and `outputCode` when each one exists.
2. Call `refreshEditors()` at the end of the convert success path, after `outputCode.setValue(...)`.
3. Call `refreshEditors()` at the end of the convert error path.
4. On both Split.js instances in both `changeDataType` branches, set `onDrag` and `onDragEnd` to `refreshEditors`. Keep the existing `gutterSize`, `sizes`, and `direction`.
5. On `window` `resize`, call `refreshEditors()`. Register that once, inside the existing `$(document).ready` handler.

Do not change `waitForTypingTimeout`, the request body, or the unused-segment marker loop.

## 6. How to check

Start the app and open `http://localhost:2019`.

1. Click sample `ADT04-23.hl7`, then template `ADT_A04.liquid`. Wait until the result header says `Converted`.
2. In the browser console, `document.documentElement.scrollHeight` is less than or equal to `window.innerHeight + 1`.
3. The result pane shows a vertical scrollbar inside the result editor. Scrolling it does not move the file list or the template.
4. The message pane shows its own scrollbar. The template pane shows its own scrollbar.
5. Drag the horizontal splitter and the vertical splitter. All three editors stay inside the window and remain usable. No editor collapses to zero height.
6. Reload. The empty page also does not scroll the document.

Then run `npm test` and `npm run eslint`.

## 7. Acceptance criteria

- A successful ADT_A04 conversion does not increase the document scroll height beyond the viewport.
- Each of the three editors scrolls inside its pane.
- Splitter drag and window resize call `refresh()` on all three editors.
- Convert request and unused-segment marking are unchanged.
- No files outside the two listed files are modified.
