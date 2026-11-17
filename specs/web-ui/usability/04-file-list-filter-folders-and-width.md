# Spec 04: File list filter, folders, names, and width

**Status:** Done. Implemented in commit 168e795 (cached sample list so filter keystrokes re-render without refetching, `openFolders` state with chevron and rendered-count folder headings, `title` attributes with CSS ellipsis on every built-in and external row, and a 180–480px draggable `#file-browser-resizer` persisted in `fhirConverterFileBrowserWidth`, across `src/static/js/file-browser.js`, `src/static/css/template-editor.css`, and `src/static/index.html`).

## 1. Goal

The built-in file list has 17 samples, 58 root templates, and 858 partials in 6 folders (`CodeSystem`, `DataType`, `Extensions`, `ID`, `Reference`, `Resource`). Using it must not refetch on every keystroke, folders must show that they open, long names must not force a horizontal scrollbar, and the sidebar width must be draggable.

## 2. Current behavior

`refreshFileBrowser` in `src/static/js/file-browser.js` always performs two AJAX calls. The filter input handler calls `refreshFileBrowser()` on every `input` event when `browseSource === 'builtin'`. Rebuilding the list drops the `open` class unless `filter` is non-empty, because `renderFileBrowser` adds `open` only when `filter` is truthy.

Folder headings are a `div.file-browser-row` whose text is the folder name. There is no chevron and no count. Children render inside `.file-browser-children`, shown only when the parent `.file-browser-folder` has class `open`.

`#file-browser` is `flex: 0 0 280px` and `width: 280px` in the later CSS rule (`flex-basis: 280px`). An earlier rule still says `240px`. The later rule wins. Rows use the full label as text. Names such as `IZ_1_1_Admin_Child_Max_Message.hl7` overflow the sidebar.

External GitHub and Folder browsing uses `renderExternalEntries`. This spec does not change how those requests work. It does apply the same name truncation to external rows.

## 3. Files you may edit

- `src/static/index.html`
- `src/static/css/template-editor.css`
- `src/static/js/file-browser.js`

## 4. Filter without a refetch

1. Add `var cachedSamples = [];` next to `selectedSample`.
2. In the sample-list success callback, set `cachedSamples = sampleList.messages || []` before `renderFileBrowser(cachedSamples)`.
3. Change the `#file-filter` `input` handler. When `browseSource === 'builtin'`, call `renderFileBrowser(cachedSamples)`. Do not call `refreshFileBrowser` from the input handler.
4. Keep `refreshFileBrowser()` for the initial ready call, for switching back to Built-in in `setBrowseSource`, and for the existing save-success call in `template-menu.js`. Do not edit `template-menu.js`. That call may keep calling `refreshFileBrowser()`.

Typing in the filter must not change `selectedSample` or `selectedTemplate`.

## 5. Remember open folders

Add `var openFolders = {};`.

In `renderFileBrowser`, when creating a folder block:

- Add class `open` when `openFolders[folder]` is true, or when the current filter string is non-empty.
- On heading click, toggle `openFolders[folder]` and toggle the class. Do not call `loadTemplate`.

A filter of `patient` opens only the folders that the existing filter logic already shows, for as long as the filter is non-empty. Clearing the filter restores `openFolders`. Folders the user had opened stay open. Folders that were closed stay closed.

## 6. Chevron and count

The folder heading text is the folder name, a space, and the count of children currently rendered in that folder, in parentheses. Example: a Resource folder that renders 120 children says `Resource (120)`. The count is `shown.length` after the existing filter logic, not the unfiltered total. When the filter is empty, that is the full child count.

Before the text, prepend `<span class="file-browser-chevron" aria-hidden="true"></span>`.

CSS, and only this CSS for the chevron:

```css
.file-browser-chevron {
    display: inline-block;
    width: 1em;
}

.file-browser-folder > .file-browser-row .file-browser-chevron::before {
    content: "▸";
}

.file-browser-folder.open > .file-browser-row .file-browser-chevron::before {
    content: "▾";
}
```

Use those two characters. Do not use an icon font and do not add a dependency.

## 7. Truncate names

Every built-in and external `.file-browser-row` gets a `title` attribute equal to the full label the row would show, including the folder count text and the external `▸ ` prefix for directories.

CSS:

```css
.file-browser-row {
    display: block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
}
```

Keep the existing padding, radius, hover, and `.is-selected` background. `#file-browser` keeps `overflow: auto` so the list scrolls vertically. It must not grow a horizontal scrollbar because of a file name. The `..` parent row in the external list uses the title `..`.

## 8. Drag the sidebar width

In `src/static/index.html`, inside `#editor-wrapper`, put this element between `#file-browser` and `#editor-main`:

```html
<div id="file-browser-resizer" role="separator" aria-orientation="vertical" aria-label="Resize file list"></div>
```

CSS:

```css
#file-browser-resizer {
    flex: 0 0 6px;
    width: 6px;
    cursor: col-resize;
    background: transparent;
}

#file-browser-resizer:hover,
#file-browser-resizer.is-dragging {
    background: #e3e8ef;
}
```

JavaScript in the existing `file-browser.js` ready handler:

1. Read `localStorage` key `fhirConverterFileBrowserWidth`. If it parses as a finite number from 180 to 480 inclusive, set both `#file-browser` `width` and `flex-basis` to that pixel value.
2. On `mousedown` of `#file-browser-resizer`:
   - `preventDefault()`.
   - Add class `is-dragging` to the resizer.
   - Listen to `mousemove` and `mouseup` on `document`.
3. On `mousemove`, the new width is `event.clientX - $('#file-browser')[0].getBoundingClientRect().left`. Clamp it to the closed range 180–480. Apply it as pixels to `width` and `flex-basis`.
4. On `mouseup`, remove both listeners, remove `is-dragging`, and `localStorage.setItem('fhirConverterFileBrowserWidth', String(width))`.
5. Ignore a stored value outside 180–480. Ignore a `mousedown` that is not button 0.

Do not use Split.js for this sidebar. The editor splits stay as they are.

After a drag, if spec 01's `refreshEditors` exists, call it on mouseup so the editors fit the new width. Guard the call with `typeof refreshEditors === 'function'`.

## 9. How to check

1. Type `adt` in the filter. The browser network panel shows no new `/api/v1/templates` or `/api/v1/sample-data` request for that keystroke. `ADT_A04.liquid` remains visible. A partial whose name contains `adt` remains visible, and its folder is open.
2. Clear the filter. Open `Resource`. Type `a`, then delete it. `Resource` is still open.
3. Hover `IZ_1_1_Admin_Child_Max_Message.hl7`. The tooltip is the full name. The sidebar has no horizontal scrollbar.
4. `Resource` shows a chevron and a count in parentheses. Clicking the heading toggles the children and does not load a template.
5. Drag the resizer. The width stays between 180px and 480px. Reload. The width is the width you released at.
6. Startup example from spec 03 still loads.

Then run `npm test` and `npm run eslint`.

## 10. Acceptance criteria

- Filter keystrokes do not refetch.
- Open and closed folders survive a re-render when the filter is empty.
- Every folder heading has a chevron and a `(count)` of the children rendered under it.
- Long names ellipsize and expose the full name in `title`.
- Sidebar width drags between 180 and 480 and is restored from `fhirConverterFileBrowserWidth`.
- GitHub and Folder listing requests are unchanged.
