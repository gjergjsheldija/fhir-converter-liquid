# Spec 10: Save follows the unsaved state

**Status:** Done. Implemented in commit 99b1c57 (`#template-save-button` starts `btn-outline-dark` and `updateUnsavedDot` in `src/static/js/template-editor.js` now toggles per-tab `.tab-dirty` spans plus the button's `btn-dark`/`btn-outline-dark` class from the active template; `setColorTheme` no longer recolors the save button and re-applies the dirty state; Cmd/Ctrl-S document keydown saves only a dirty active template; `tabLabelHtml` in `src/static/js/editor-tabs.js` used by `addTab`/`openLocalTemplate` and the `closeAllTemplates` default string in `src/static/js/template-menu.js`; `#unsaved-dot` removed from HTML, CSS, and JS).

## 1. Goal

Save looks like a primary button only when the open template differs from the last loaded or saved text. Each dirty tab shows a blue dot on the tab. Cmd-S on macOS and Ctrl-S on Windows and Linux save that dirty template. A clean template does not save again.

## 2. Current behavior

The header in `index.html` is:

```html
<span id="template-open-name">untitled</span>
<span id="unsaved-dot" hidden></span>
<button class="btn btn-sm btn-dark" id="template-save-button" type="button">Save</button>
```

`#unsaved-dot` is an 8px blue circle. `updateUnsavedDot` in `template-editor.js` shows it when `unchangedFromReference(activeTemplate.name, activeTemplate.data)` is false. The reference is `currentTemplateReference`, updated by `addTab`, `openLocalTemplate`, and a successful `saveTemplate`.

The template `change` handler also toggles `font-italic` on the active tab through `getTab`. Keep that italic class. The dot is an additional mark, not a replacement.

`setColorTheme` puts `#template-save-button` in an array with Convert, Settings Save, and Copy, then swaps `btn-dark` and `btn-light`. That fight would undo a dirty-state class. Remove only the save button from that array.

Tab HTML is built as a string in three places in `editor-tabs.js`: `addTab`, `openLocalTemplate`, and the `openDefault` branch of `closeAllTemplates` in `template-menu.js`. The initial tab is the `untitled` anchor in `index.html`.

`saveTemplate` PUTs `templateCodeEditor.getValue()` to `templateFileUrl(activeTemplate.name)`. Do not change the URL or the body.

## 3. Files you may edit

- `src/static/index.html`
- `src/static/css/template-editor.css`
- `src/static/js/template-editor.js`
- `src/static/js/editor-tabs.js`
- `src/static/js/template-menu.js` (the default-tab HTML string only)

## 4. Save button

In `index.html`, change `#template-save-button` from `btn btn-sm btn-dark` to `btn btn-sm btn-outline-dark`. Remove `<span id="unsaved-dot" hidden></span>` from the header.

`updateUnsavedDot` decides the button from the active template:

- Dirty: remove `btn-outline-dark`, add `btn-dark`.
- Clean, or no active template: remove `btn-dark`, add `btn-outline-dark`.

Do not use `btn-light`. Dark mode no longer recolors this button. In `setColorTheme`, delete `$('#template-save-button')` from the `buttons` array. At the end of `setColorTheme`, call `updateUnsavedDot()` so a theme change cannot leave the button on `btn-light`.

## 5. Dot on each tab

Add a helper `tabLabelHtml(templateName, closeHtml)` used by every place that creates a tab anchor. The anchor stays `a.nav-item.nav-link` with the existing `onclick`. Inside it, the visible name is text, then:

```html
<span class="tab-dirty" hidden></span>
```

Then the existing close button HTML when the tab has a parent. Do not put the dot inside the close button.

`updateUnsavedDot` loops `openTemplates`. For each template, find its tab with `getTab(template.name)` and toggle `hidden` on that tab's `.tab-dirty`. A missing tab is skipped. The active template's button classes are updated in the same function, as in section 4.

Replace the `#unsaved-dot` rules with:

```css
.tab-dirty {
    width: 8px;
    height: 8px;
    margin-left: 6px;
    border-radius: 50%;
    background: #0d6efd;
    display: inline-block;
    vertical-align: middle;
}

.tab-dirty[hidden] {
    display: none;
}
```

Delete the `#unsaved-dot` rules. No JavaScript may read `#unsaved-dot` after this change. Search the three JS files and remove those reads. `closeAllTemplates` currently does `$('#unsaved-dot').attr('hidden', true)`. Delete that line. `updateUnsavedDot` covers the new tab.

Apply `tabLabelHtml` in:

- the initial `untitled` anchor in `index.html`
- `addTab`
- `openLocalTemplate`
- the `openDefault` HTML assignment in `closeAllTemplates`

`renameTab` rewrites the anchor with a regex on `outerHTML`. A rename must keep `.tab-dirty`. The current regex replaces the old name inside `onclick` and inside the label. Keep that behavior, and do not let the regex eat the dot span. If the dot span contains no copy of the template name, the existing regex is safe. Confirm that before finishing.

## 6. Shortcut

In the existing document ready handler:

```javascript
$(document).on('keydown', function (event) {
    if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && (event.key === 's' || event.key === 'S')) {
        event.preventDefault();
        if (activeTemplate && !unchangedFromReference(activeTemplate.name, templateCodeEditor.getValue())) {
            saveTemplate();
        }
    }
});
```

`preventDefault` runs even when the template is clean, so the browser does not open its own save dialog. A clean template does not call `saveTemplate`. The shortcut saves the active template, including when focus is in the message editor or a modal field.

Do not bind Cmd-S inside CodeMirror `extraKeys` only. The document listener covers every focus target. One listener is enough. Do not add both, or one save would fire twice.

## 7. How to check

1. Open `ADT_A04.liquid`. Save is an outline button. No tab has a visible blue dot.
2. Type a space in the template. Save becomes a solid dark button. The active tab shows an 8px `#0d6efd` dot and is italic.
3. Click Save, or press Cmd-S or Ctrl-S. On success the dot hides and Save is outline again. The browser save dialog does not open.
4. Press Cmd-S or Ctrl-S again while the file is clean. No PUT appears in the network panel.
5. Open a second tab by double-clicking an include if that already works, or by whatever the current opener is. Dirty the first tab, switch away, and confirm the first tab keeps its dot. The Save button follows the tab you are looking at.
6. Toggle dark mode. Save does not turn into `btn-light`. A dirty file stays `btn-dark`. A clean file stays `btn-outline-dark`.

Then run `npm test` and `npm run eslint`.

## 8. Acceptance criteria

- Save uses `btn-dark` only while the active template is dirty.
- Every dirty open tab shows `.tab-dirty`. Clean tabs hide it.
- `#unsaved-dot` is gone from HTML, CSS, and JS.
- Cmd-S and Ctrl-S call `saveTemplate` only when the active template is dirty, and always prevent the browser save dialog.
- The PUT URL and body are unchanged.
