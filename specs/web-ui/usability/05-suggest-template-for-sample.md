# Spec 05: Suggest the template that matches the sample

**Status:** Done. Implemented in commit e7b8568 (optional `done` callback on `loadData` in `src/static/js/template-menu.js`, `matchTemplateForSample` and `highlightMatchingTemplate` in `src/static/js/file-browser.js` with `data-template-name`/`is-suggested` row attributes, and the inset `is-suggested` ring in `src/static/css/template-editor.css`).

## 1. Goal

When the user opens a built-in HL7 sample, the template whose name is the MSH-9 message type is outlined and scrolled into view. The current template stays open. The user can still click a different template.

## 2. Current behavior

A sample click in `renderFileBrowser` sets `selectedSample`, marks that row `is-selected`, and calls `loadData(sample.full)`. `loadData` replaces the message text and runs a conversion. It does not look at templates.

Root templates are names with no `/`, such as `ADT_A04.liquid`. They render in `#templates-list`.

`ADT04-23.hl7` begins with this MSH segment (field separator `|`, component separator `^`):

```text
MSH|^~\&|NES|NINTENDO|TESTSYSTEM|TESTFACILITY|20010101000000+0700||ADT^A04|0123456789...
```

Split by `|`, index 8 is `ADT^A04`. That is MSH-9, because MSH-1 is the separator character and is not its own pipe-delimited token. The matching template name is `ADT_A04.liquid`.

## 3. Files you may edit

- `src/static/js/template-menu.js` (one optional callback on `loadData` only)
- `src/static/js/file-browser.js`
- `src/static/css/template-editor.css`

## 4. Let the sample click see the message text

`loadData` today is:

```javascript
function loadData(dataFile) {
    $.get(getUrl('sample-data', dataFile), function (data) {
        dataEditor.setValue(data);
        var slash = dataFile.indexOf('/');
        $('#message-name').text(slash === -1 ? dataFile : dataFile.substring(slash + 1));
        convertData(true);
    });
}
```

Add an optional second parameter `done`. After `convertData(true)`, if `typeof done === 'function'`, call `done(data)`. Existing callers pass one argument and stay valid.

Do not change the request URL or the header text rule.

## 5. Match MSH-9

Add `matchTemplateForSample(text)` in `file-browser.js`. It returns a template name or `null`.

1. If `text` is not a non-empty string, return `null`.
2. Take the first line. Split on `\n`, `\r\n`, or `\r`, and use index 0. Trim a trailing `\r` if it is still there. Do not trim the line itself; a trim would remove a meaningful leading space, and MSH lines do not have one.
3. If the line does not start with `MSH`, return `null`.
4. If `line.length < 5`, return `null`.
5. `fieldSeparator` is `line.charAt(3)`. `componentSeparator` is `line.charAt(4)`.
6. `parts = line.split(fieldSeparator)`. If `parts.length < 9` or `parts[8]` is empty, return `null`.
7. `components = parts[8].split(componentSeparator)`. `type = components[0]`, `event = components[1]`.
8. If `type` or `event` is empty, or either contains `/`, `\`, or `..`, return `null`.
9. `candidate = type + '_' + event + '.liquid'`.
10. If `Array.isArray(templateNames) && templateNames.indexOf(candidate) !== -1`, return `candidate`. Otherwise return `null`.

Worked check: the MSH line above returns `ADT_A04.liquid`. A line that is not MSH returns `null`. An MSH-9 of `ACK^A04` returns `ACK_A04.liquid` only when that name is in `templateNames`; otherwise `null`.

Do not guess a nearby template. One exact name, or nothing.

## 6. Outline it, do not open it

Add `var suggestedTemplate = null;`.

Add `highlightMatchingTemplate(text)`:

1. `suggestedTemplate = matchTemplateForSample(text)`.
2. If the suggestion is non-null and the current `#file-filter` value hides that row, set the filter input to `''` and call `renderFileBrowser(cachedSamples)`. Spec 04 owns `cachedSamples`. If this spec is implemented and `cachedSamples` is missing, stop and report that spec 04 is not present.
3. Call `renderFileBrowser(cachedSamples)` so the class below is applied.
4. Find the row whose text or whose stored name is the suggestion. The reliable way is to record the name on the element. In `templateRow`, add `.attr('data-template-name', fullName)`. After render, select `[data-template-name="..."]` with the value escaped for a CSS attribute selector. Use this escape: `suggestedTemplate.replace(/\\/g, '\\\\').replace(/"/g, '\\"')`.
5. If the row exists, call `row.scrollIntoView({block: 'nearest'})` on the DOM element. Scroll only the file list. `block: 'nearest'` does that when the row's scroll parent is `#file-browser`. Do not call `scrollIntoView` with `block: 'center'`, because that can scroll the page. Spec 01 locks page scroll; keep it that way.
6. Do not set `selectedTemplate`. Do not call `loadTemplate`. Do not add `is-selected` for the suggestion.

In `templateRow`, after the existing `is-selected` class, add class `is-suggested` when `fullName === suggestedTemplate`.

CSS:

```css
.file-browser-row.is-suggested {
    box-shadow: inset 0 0 0 1px #1f6feb;
}
```

`box-shadow` is already used on the sidebar and the source switch in this file. One inset ring is the suggestion marker. Do not add a new shadow anywhere else. A row may have both `is-selected` and `is-suggested`. Keep both classes. The blue selected background and the inset ring are both visible.

Clear the previous suggestion by replacing `suggestedTemplate` and re-rendering. A sample that does not match sets `suggestedTemplate = null` and re-renders, which removes the ring.

Wire the sample click:

```javascript
loadData(sample.full, function (text) {
    highlightMatchingTemplate(text);
});
```

The startup example in spec 03 calls `loadData` with one argument, so it does not suggest. After spec 03's startup `loadTemplate('ADT_A04.liquid')`, that row is `is-selected` already. Do not also run the suggestion on startup. Leave spec 03's call unchanged.

External files that land in the message editor do not go through this click. Do not suggest a template for them in this spec.

## 7. How to check

1. Load `ADT01-23.hl7` by clicking it. The open template does not change if one is already open. If startup already opened `ADT_A04.liquid`, it stays open. The row `ADT_A01.liquid` gains `is-suggested` and is visible in the sidebar. Confirm MSH-9 of that file is `ADT^A01` before accepting a different row. If the file's MSH-9 is not `ADT^A01`, the outlined row must be the actual MSH-9 plus `.liquid`, and you report the real MSH-9 in the completion note.
2. Click `ADT04-23.hl7`. The ring moves to `ADT_A04.liquid`.
3. Type `xyz` in the filter so `ADT_A04.liquid` is hidden, then click `ADT04-23.hl7`. The filter clears and the row is outlined.
4. Click a sample whose MSH-9 has no template. The ring disappears. No error banner appears.
5. Clicking the outlined row still calls `loadTemplate` for that file, same as any other template row.

Then run `npm test` and `npm run eslint`.

## 8. Acceptance criteria

- Sample clicks outline the exact `{MSH-9 type}_{event}.liquid` template when that name exists.
- Sample clicks do not call `loadTemplate` and do not change `selectedTemplate`.
- No match clears the outline.
- A hidden match clears the filter so the row can be seen.
- `loadData`'s existing one-argument callers behave as before.
