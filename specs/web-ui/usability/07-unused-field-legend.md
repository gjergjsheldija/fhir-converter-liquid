# Spec 07: Show the unused-field hint only after a conversion marks fields

**Status:** Done. Implemented in commit ef3e730 (`#unused-legend` starts hidden with exact `Underlined in red:` text in `src/static/index.html`, `#unused-legend[hidden]` rule in `src/static/css/template-editor.css`, and `setUnusedLegend` in `src/static/js/template-editor.js` hiding on request start/failure/non-hl7v2 success and showing only when the successful hl7v2 mark loop leaves at least one `unused-segment` mark; the mark loop is guarded by `if (unusedReport)` without try/catch).

## 1. Goal

The message pane explains the red underline only when the latest successful HL7 conversion actually marked an unused field. An empty message, a conversion with no unused fields, and a failed conversion show no hint.

## 2. Current behavior

`src/static/index.html` puts this under `#databox`, always visible:

```html
<div class="pane-legend">Red dots: this field is not read by the template.</div>
```

The mark is not a dot. `src/static/css/template-editor.css` defines:

```css
.unused-segment {
    border-bottom: 2px dotted #ff0000;
}
```

`convertData` in `src/static/js/template-editor.js` draws those marks only for `currentDataType === 'hl7v2'`, inside the success callback, inside `setTimeout(..., 0)`. It clears `dataDoc.getAllMarks()` and then calls `dataDoc.markText(..., {className: 'unused-segment'})`. Do not change the index arithmetic in that loop. Do not change the request query `unusedSegments=true&invalidAccess=true`.

The legend is on screen at load, including when the message says `No sample`.

## 3. Files you may edit

- `src/static/index.html`
- `src/static/css/template-editor.css`
- `src/static/js/template-editor.js`

## 4. Markup and CSS

Replace the legend element with:

```html
<div id="unused-legend" class="pane-legend" hidden>Underlined in red: this field is not read by the template.</div>
```

The text is exact, including the colon. Do not write "Red dots".

```css
#unused-legend[hidden] {
    display: none;
}
```

Keep `.pane-legend` padding and font size.

## 5. When it shows

Add `setUnusedLegend(visible)` that removes `hidden` when `visible` is true and sets `hidden` when it is false.

1. Page load: the element starts `hidden`. Do not show it from the ready handler.
2. At the start of a conversion that will send a request, immediately before `$('#conversion-status').text('Converting…')`, call `setUnusedLegend(false)`. The early return that happens when the message is empty must not show the legend. That return is above the status line. Leave the legend hidden in that case.
3. On the convert error callback, call `setUnusedLegend(false)`.
4. Inside the existing `setTimeout` success block, after the `unusedReport.forEach` loop finishes, count marks whose `className` is `unused-segment`. `TextMarker` exposes `className` in CodeMirror 5.65. If the count is greater than 0, call `setUnusedLegend(true)`. If the count is 0, call `setUnusedLegend(false)`.
5. If `currentDataType !== 'hl7v2'`, the success path does not enter that `setTimeout`. Call `setUnusedLegend(false)` on that success path as well, next to `hideConversionError()`.
6. If `data.unusedSegments` is missing, do not throw a new error from the legend code. Skip the mark loop the same way the current code would, and call `setUnusedLegend(false)`. Do not wrap the existing mark math in a new try/catch that hides real exceptions.

Do not clear marks on failure. The error callback does not touch message marks today. Leave that. Hiding the legend is enough, because the next success redraws marks.

## 6. How to check

1. Reload. The sentence `Underlined in red: this field is not read by the template.` is not on screen. The words `Red dots` are not in the document.
2. Load `ADT04-23.hl7` and `ADT_A04.liquid`. Wait until the status says `Converted`. If any message field has a red dotted underline, the legend is visible. If none do, the legend stays hidden.
3. Replace the template with `{{ "" }}` and convert. Fields that the empty output does not read get the underline, and the legend becomes visible. The mark is still `border-bottom: 2px dotted #ff0000`, not a dot.
4. Type `{% ` so the conversion fails. The legend hides.
5. Clear the message. The legend stays hidden.

Then run `npm test` and `npm run eslint`.

## 7. Acceptance criteria

- The legend text is `Underlined in red: this field is not read by the template.`
- It is hidden until a successful HL7 conversion created at least one `unused-segment` mark, and it hides again on the next request and on failure.
- The mark calculation and the convert request are unchanged.
