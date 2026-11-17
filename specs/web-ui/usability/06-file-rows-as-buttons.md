# Spec 06: Make file rows buttons

**Status:** Done. Implemented in commit ddfc8b2 (every `.file-browser-row` is now `<button type="button">` with `data-folder-name` on headings, roving `setFileRowTabOrder()` called at the end of both renderers and after folder toggles, a single `keydown` handler on `#file-browser` for Arrow/Home/End/ArrowRight/ArrowLeft, and the button reset plus `:focus` ring in `src/static/css/template-editor.css`).

## 1. Goal

Every file-list row is a `<button type="button">`. Keyboard users can move through the visible rows and activate them. Screen readers get a button name equal to the row label.

## 2. Current behavior

`file-browser.js` builds rows with `$('<div class="file-browser-row">')` in three places: sample rows, `templateRow`, and `renderExternalEntries` (the `..` row and each entry). Click handlers are `row.on('click', ...)`. Those divs do not appear as controls in the accessibility tree.

Spec 04 added chevrons, counts, `title`, ellipsis, folder memory, and the resizer. Spec 05 added `data-template-name` and `is-suggested`. Keep all of that. This spec changes the element type and adds keys.

## 3. Files you may edit

- `src/static/css/template-editor.css`
- `src/static/js/file-browser.js`

## 4. Button element

Replace every `$('<div class="file-browser-row">')` with `$('<button type="button" class="file-browser-row">')`.

The button's accessible name is its text. Do not add an `aria-label` that differs from the visible text. Keep the `title` attribute from spec 04.

CSS so the button looks like the current row:

```css
button.file-browser-row {
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    width: 100%;
}

button.file-browser-row:focus {
    outline: 2px solid #1f6feb;
    outline-offset: -2px;
}
```

`:focus` is the keyboard ring. `.is-selected` stays the selected-file background. `.is-suggested` stays the inset ring from spec 05. Do not remove those rules.

Folder headings and the external `..` row are buttons too.

## 5. Roving tabindex

Do not leave every button at the default tabindex. There are hundreds of partials.

Add `setFileRowTabOrder()` and call it at the end of `renderFileBrowser` and at the end of `renderExternalEntries`.

1. Collect `$('#file-browser .file-browser-row')`.
2. Set `tabindex="-1"` on each.
3. Among the rows that are visible (`$(row).is(':visible')`), choose the tab target:
   - the first visible row that has `is-selected`, if there is one;
   - otherwise the first visible row.
4. Set `tabindex="0"` on that one row.

Hidden children inside a closed folder are not visible, so they are not the tab target. Opening a folder re-renders or toggles visibility. After a folder click toggles the class without a full re-render, call `setFileRowTabOrder()` at the end of the heading click handler.

## 6. Keys

One `keydown` listener on `#file-browser`, registered once in the ready handler. It applies only when `event.target` is a `.file-browser-row`.

Visible rows in order: `$('#file-browser .file-browser-row').filter(function () { return $(this).is(':visible'); }).toArray()`.

| Key | Action |
| --- | --- |
| `ArrowDown` | `preventDefault`. Move focus to the next visible row. If this is the last, stay. |
| `ArrowUp` | `preventDefault`. Move focus to the previous visible row. If this is the first, stay. |
| `Home` | `preventDefault`. Focus the first visible row. |
| `End` | `preventDefault`. Focus the last visible row. |
| `ArrowRight` | If the row is a closed folder heading (parent `.file-browser-folder` lacks `open`), `preventDefault`, add `open`, set `openFolders[folderName] = true`, call `setFileRowTabOrder`. The folder name is the heading text with the chevron character and the ` (count)` suffix removed. Take the text of the heading, strip a leading `▸` or `▾` and the following space, then strip a trailing ` \(\d+\)`. |
| `ArrowLeft` | If the focused row is an open folder heading, `preventDefault`, close it, set `openFolders[folderName] = false`, call `setFileRowTabOrder`. If the focused row is a child inside `.file-browser-children`, `preventDefault` and focus that folder's heading button. |
| `Enter` and `Space` | Do not `preventDefault`. The button's click handler runs. |

When arrow keys move focus, set `tabindex="-1"` on the previously focused row and `tabindex="0"` on the newly focused row, then call `focus()` on it.

Store the folder name in `data-folder-name` on the heading button when you create it, equal to the raw folder key (`Resource`, not `Resource (120)`). Use that attribute in the key handler instead of parsing the label if you have it. The parse rule above is the fallback. Prefer the attribute.

Click behavior stays the click behavior from specs 04 and 05:

- Sample button calls `loadData(sample.full, highlightMatchingTemplate callback)`.
- Template button calls `loadTemplate`.
- Folder heading toggles `open` and does not load a template.
- External directory opens the directory. External file calls `openExternalFile`.

## 7. How to check

1. Tab from the filter. Focus lands on one file row, not on a closed folder's hidden child.
2. ArrowDown moves through visible sample rows. Enter on a sample loads it and runs the spec 05 suggestion.
3. ArrowDown into `Resource`, ArrowRight opens it, ArrowDown enters a child, Enter loads that partial, ArrowLeft returns focus to the `Resource` heading.
4. A closed folder's children are not individually tabbable.
5. The resizer, the filter cache, the chevron, the count, the suggestion ring, and the startup example still work.
6. Inspect a row in the accessibility tree. Its role is `button` and its name is the visible label.

Then run `npm test` and `npm run eslint`.

## 8. Acceptance criteria

- Every `.file-browser-row` is `<button type="button">`.
- Exactly one visible row in the file browser has `tabindex="0"` after each render.
- Arrow keys, Home, and End move focus among visible rows.
- Enter activates the same action as a click.
- Specs 04 and 05 behavior is still present.
