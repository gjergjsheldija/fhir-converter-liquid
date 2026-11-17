# Spec 17: Collapse and expand the files pane

**Status:** Done (2026-11-17). Files pane collapses/expands via the header toggle, the 28px left rail, and Cmd/Ctrl-B (skipped while a Bootstrap modal is open); `fhirConverterFileBrowserCollapsed` persists across reloads and Spec 04's saved width is restored on expand. Validated with `node scripts/test-summary.mjs`: 361 passing, 109 failing (all known baseline), eslint exit 0, `git diff --check` exit 0.

## 1. Goal

A developer can collapse the left Files pane so the message, template, and FHIR result editors get the full window width, and expand it again with one click or a keyboard shortcut. The collapsed choice and the dragged sidebar width both persist across reloads.

## 2. Current behavior

`#editor-wrapper` in `src/static/index.html` is a flex row containing:

1. `#file-browser` (default width `280px`, draggable between `180px` and `480px`, stored in `localStorage` under `fhirConverterFileBrowserWidth`).
2. `#file-browser-resizer` (`6px` vertical drag separator).
3. `#editor-main` (`flex: 1 1 auto; min-width: 0`).

Inside `#file-browser`, the top element is `<div class="file-browser-title">Files</div>`. There is no control to hide `#file-browser`, so at `280px` plus gaps it permanently consumes nearly a quarter of a laptop screen even while the user is focused on editing Liquid and inspecting the FHIR bundle.

`refreshEditors()` in `src/static/js/template-editor.js` calls `refresh()` on `dataEditor`, `templateCodeEditor`, and `outputCode`.

## 3. Files you may edit

- `src/static/index.html`
- `src/static/css/template-editor.css`
- `src/static/js/file-browser.js`

Do not edit `*.liquid` files, sample messages, or server code. Do not add a dependency or an icon font.

## 4. Markup

In `src/static/index.html`, inside `#editor-wrapper`, place a collapsed rail button immediately before `#file-browser`:

```html
<button type="button" id="file-browser-expand" class="file-browser-rail" hidden aria-expanded="false" aria-controls="file-browser" aria-label="Expand files pane" title="Show files (Cmd/Ctrl+B)">▸ Files</button>
```

Replace `<div class="file-browser-title">Files</div>` inside `#file-browser` with a header row that keeps `.file-browser-title` so later project controls can sit beside the title without losing the collapse button:

```html
<div class="file-browser-title">
    <span class="file-browser-title-text">Files</span>
    <button type="button" id="file-browser-collapse" class="file-browser-toggle" aria-expanded="true" aria-controls="file-browser" aria-label="Collapse files pane" title="Hide files (Cmd/Ctrl+B)">‹</button>
</div>
```

Keep `#file-browser-resizer` between `#file-browser` and `#editor-main`.

## 5. CSS

Add rules in `src/static/css/template-editor.css`:

1. `#file-browser[hidden]`, `#file-browser-resizer[hidden]`, and `#file-browser-expand[hidden]` use `display: none`.
2. `.file-browser-title` becomes a flex row: `display: flex`, `align-items: center`, `gap: 6px`, `margin-top: 0` (keep `font-weight: 700`). `.file-browser-title-text` stays inline and truncates cleanly if siblings are added later (`min-width: 0`).
3. `.file-browser-toggle` sits at the right edge of `.file-browser-title` (`margin-left: auto`, `flex: 0 0 auto`, `width: 24px`, `height: 24px`, `padding: 0`, `border: 1px solid #e3e8ef`, `border-radius: 6px`, `background: transparent`, `color: inherit`, `line-height: 1`, `cursor: pointer`). Hover background `#f2f6fb`. Focus outline `2px solid #1f6feb`, `outline-offset: -2px`.
4. `.file-browser-rail` is a vertical strip along the left edge of `#editor-wrapper` when collapsed:
   - `flex: 0 0 28px`, `width: 28px`, `height: 100%`
   - `padding: 10px 4px`
   - `border: 0`, `border-radius: 10px`
   - `background: #fff`, `color: #1c2430`
   - `box-shadow: 0 1px 2px rgba(16, 24, 40, 0.06)`
   - `writing-mode: vertical-rl`, `text-orientation: mixed`
   - `font-size: 12px`, `font-weight: 600`, `cursor: pointer`
   - Hover background `#f2f6fb`; focus outline `2px solid #1f6feb`, `outline-offset: -2px`.

Do not break Spec 01's `height: 100%` / `min-height: 0` / `overflow: hidden` rules on `#editor-wrapper`, `#file-browser`, or `#editor-main`.

## 6. Behavior

In `src/static/js/file-browser.js`, add `setFileBrowserCollapsed(collapsed, options)`:

1. When `collapsed` is `true`:
   - Set `hidden` on `#file-browser` and `#file-browser-resizer`.
   - Remove `hidden` from `#file-browser-expand`.
   - Set `aria-expanded="false"` on both `#file-browser-collapse` and `#file-browser-expand`.
2. When `collapsed` is `false`:
   - Set `hidden` on `#file-browser-expand`.
   - Remove `hidden` from `#file-browser` and `#file-browser-resizer`.
   - Set `aria-expanded="true"` on both `#file-browser-collapse` and `#file-browser-expand`.
   - Keep `#file-browser`'s inline `width` and `flex-basis` from `fhirConverterFileBrowserWidth` if one was applied.
3. Persist `localStorage.setItem('fhirConverterFileBrowserCollapsed', collapsed ? 'true' : 'false')` inside a `try / catch` block unless `options && options.persist === false`.
4. If `typeof refreshEditors === 'function'`, call `refreshEditors()` so all three CodeMirror panes re-measure to the new width.
5. When `options && options.moveFocus === true`:
   - After collapsing, call `$('#file-browser-expand').focus()`.
   - After expanding, call `$('#file-browser-collapse').focus()`.

Wire these triggers in the existing `$(document).ready` handler in `file-browser.js`:

- On startup, after restoring `fhirConverterFileBrowserWidth`, read `localStorage.getItem('fhirConverterFileBrowserCollapsed') === 'true'` inside `try / catch` and call `setFileBrowserCollapsed(isCollapsed, {persist: false, moveFocus: false})`.
- Clicking `#file-browser-collapse` calls `setFileBrowserCollapsed(true, {moveFocus: true})`.
- Clicking `#file-browser-expand` calls `setFileBrowserCollapsed(false, {moveFocus: true})`.
- Document `keydown` for `Cmd-B` / `Ctrl-B`: when `(event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && (event.key === 'b' || event.key === 'B')`, ignore the shortcut if a Bootstrap `.modal.show` is open; otherwise `event.preventDefault()` and toggle `setFileBrowserCollapsed(!$('#file-browser').prop('hidden'), {moveFocus: false})`.

Startup example loading (`didOpenStartupExample` from Spec 03) still runs when the pane starts collapsed, so a fresh tab with a collapsed sidebar still loads and converts `ADT04-23.hl7` with `ADT_A04.liquid`.

## 7. How to check

Open `http://localhost:2019`.

1. Click `#file-browser-collapse` (`‹`). `#file-browser` and `#file-browser-resizer` hide, `#file-browser-expand` (`▸ Files`) appears on the left, `#editor-main` expands across the window, and focus lands on `#file-browser-expand`.
2. Reload. The Files pane stays collapsed, and `ADT04-23.hl7` / `ADT_A04.liquid` still load and convert.
3. Click `#file-browser-expand`. The Files pane reopens at its previous width (verify after dragging `#file-browser-resizer` to e.g. `360px`, collapsing, reloading, and expanding).
4. Press `Cmd-B` (macOS) or `Ctrl-B` (Windows/Linux) while focused inside CodeMirror. The Files pane toggles without scrolling the document (`document.documentElement.scrollHeight <= window.innerHeight + 1`).
5. Open Settings (`#settings-modal`) and press `Cmd-B` / `Ctrl-B`. The sidebar does not toggle behind the modal.

Then run `npm test` and `npm run eslint`.

## 8. Acceptance criteria

- Collapsing hides `#file-browser` and `#file-browser-resizer`, shows `#file-browser-expand`, and calls `refreshEditors()`.
- Expanding restores `#file-browser` at its saved width and hides `#file-browser-expand`.
- `fhirConverterFileBrowserCollapsed` persists the state across reloads.
- `Cmd-B` and `Ctrl-B` toggle the pane whenever no modal is open.
- Spec 01's viewport lock and Spec 04's width persistence remain intact.
