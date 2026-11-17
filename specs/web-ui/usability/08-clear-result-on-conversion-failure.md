# Spec 08: Clear the result when conversion fails

**Status:** Done. Implemented in commit b7ea128 (`#result-error` element in `.output-area` before `#resultbox` in `src/static/index.html`, its CSS in `src/static/css/template-editor.css`, and `showResultError`/`hideResultError` in `src/static/js/template-editor.js`: the convert error callback clears `outputCode`, sets `Failed`, and shows the message in `#result-error` (no `showConversionError`); success and request start hide it; save/copy/send/generate failures still use `#conversion-error`).

## 1. Goal

A failed conversion leaves the result pane empty and shows the error in that pane. The previous Bundle does not stay on screen next to the word `Failed`.

Save errors, copy errors, send errors, and file-browser errors still use the existing `#conversion-error` bar under the page.

## 2. Current behavior

The convert error callback in `convertData` does this:

```javascript
'error': function (err) {
    if (latestRequest !== requestNumber) {
        return;
    }
    $('#conversion-status').text('Failed');
    var message = 'Conversion failed.';
    try {
        var errObj = JSON.parse(err.responseText);
        if (errObj.error && errObj.error.message) {
            message = errObj.error.message;
        }
    } catch (ex) {
        message = 'Conversion failed.';
    }
    showConversionError(message);
}
```

`showConversionError` writes `#conversion-error`, which is a sibling after `#editor-wrapper`. The callback does not call `outputCode.setValue`. The last successful JSON remains in the result editor.

`#resultbox` sits directly under the FHIR result header. There is no error element inside `.output-area`.

`showConversionError` is also used by `saveTemplate` failure, the copy button, `sendToFhir`, `runGenerateTemplate` failure, and the file-browser error handlers. Those callers must keep using `#conversion-error`.

## 3. Files you may edit

- `src/static/index.html`
- `src/static/css/template-editor.css`
- `src/static/js/template-editor.js`

## 4. Markup and CSS

Inside `.output-area`, after `.pane-header` and before `#resultbox`, add:

```html
<div id="result-error" hidden></div>
```

```css
#result-error {
    flex: 0 0 auto;
    max-height: 72px;
    overflow: auto;
    margin: 0;
    padding: 6px 8px;
    color: #842029;
    background: #f8d7da;
    white-space: pre-wrap;
}

#result-error[hidden] {
    display: none;
}
```

Leave `#conversion-error` and its CSS in place.

## 5. Convert failure

Add `showResultError(message)` and `hideResultError()`.

- `showResultError` sets `#result-error` text to the message and removes `hidden`.
- `hideResultError` clears the text and sets `hidden`.

In the convert error callback, after the stale-request check:

1. Keep parsing `message` exactly as it is parsed now. The fallback string stays `Conversion failed.`
2. Call `outputCode.setValue('')`.
3. Set `#conversion-status` to `Failed`.
4. Call `showResultError(message)`.
5. Do not call `showConversionError` from this callback.
6. If spec 01 added `refreshEditors`, call it after `setValue`. Guard with `typeof refreshEditors === 'function'`.
7. If spec 07 added `setUnusedLegend`, call `setUnusedLegend(false)`. Guard with `typeof setUnusedLegend === 'function'`.

On a convert success, immediately after `outputCode.setValue(outputLines.join('\n'))`, call `hideResultError()`. The success path already calls `hideConversionError()`. Keep that call.

When a request is about to be sent, immediately before `$('#conversion-status').text('Converting…')`, call `hideResultError()` so an old error does not sit beside `Converting…`.

Do not clear the result when `sendToFhir`, `saveTemplate`, copy, or generate fails. Those paths keep `showConversionError`.

## 6. How to check

1. Load `ADT04-23.hl7` and `ADT_A04.liquid`. Confirm the result contains `"resourceType": "Bundle"` and `#result-error` is hidden.
2. Replace the template text with `{%` and wait for failure. The result editor is empty. `#conversion-status` is `Failed`. `#result-error` shows the server message, or `Conversion failed.` when the body has no `error.message`. `#conversion-error` stays hidden.
3. Restore a valid template. On success, `#result-error` hides and the Bundle is back.
4. Click Copy with an empty clipboard failure only if you can force it. Otherwise call `showConversionError('Could not copy the result.')` from the console. That message appears in `#conversion-error`, not in `#result-error`, and it does not clear the Bundle.
5. Click Save on a template the server rejects, if you have one. The save message uses `#conversion-error` and does not clear the result.

Then run `npm test` and `npm run eslint`.

## 7. Acceptance criteria

- A failed conversion clears the result editor and shows the error text in `#result-error`.
- A later success hides `#result-error` and fills the result as it does today.
- Save, copy, send, and generate failures still use `#conversion-error` and do not clear the result.
- The convert request body is unchanged.
