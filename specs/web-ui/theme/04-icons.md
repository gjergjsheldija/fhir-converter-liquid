# Spec 04: Icons beside labels

**Status:** Done (2026-11-18). Nine `currentColor` symbols in `src/static/icons.svg` are referenced via `window.icon(id)` from `/js/icons.js`; the Font Awesome link is gone; full validation shows 369 passing, only the 109 known baseline failures, eslint and `git diff --check` clean (live browser items in section 7 unverified).

## 1. Goal

A short set of inline icons marks file kinds, the two families, the three sources, and the three pane titles. Every icon sits beside a word or a file name. Convert, Send, Copy, New, and Generate stay words with no icon. The Font Awesome stylesheet is removed.

## 2. Current behavior

`index.html` loads `https://use.fontawesome.com/releases/v5.6.3/css/all.css`. No element uses an `fa-` class.

File rows are buttons built in `src/static/js/file-browser.js`. Sample rows show the file label. `templateRow` shows the template label. Folder headings are buttons with a `.file-browser-chevron` span and the folder name plus a count. The chevron is the disclosure control. Leave it. Do not add a second folder mark on that heading.

Pane headers are text: `Message`, `Template`, `FHIR result`. The source switch buttons are `Built-in`, `GitHub`, and `Folder`.

`#template-save-button` gains `is-dirty` from spec 03. The tab already has `.tab-dirty`.

Project dialogs from `specs/web-ui/projects/` may be absent. If `#new-project-modal` and `#project-family` do not exist, skip the family icons in those places. Still add the icon function so a later project spec can call it. Do not implement the project specs here.

## 3. Files you may edit

- `src/static/icons.svg` (new)
- `src/static/index.html`
- `src/static/css/template-editor.css`
- `src/static/js/file-browser.js`
- `src/static/js/icons.js` (new)

## 4. Sprite

`src/static/icons.svg` is one SVG with `xmlns="http://www.w3.org/2000/svg"`. It contains nine `<symbol>` elements, each `viewBox="0 0 16 16"`. Strokes use `currentColor`. `fill="none"`. `stroke-width="1.5"`. `stroke-linecap="round"`. `stroke-linejoin="round"`. No bitmaps and no external references.

| id | Shape |
| --- | --- |
| `icon-message` | A 10 by 12 rectangle at x 3 y 2, rx 1, plus three horizontal lines inside at y 5.5, 8, and 10.5 from x 5 to x 11. |
| `icon-template` | The same rectangle, plus a polyline `5,6 7,8 5,10` and a polyline `11,6 9,8 11,10`. |
| `icon-partial` | Front sheet `<rect x="5" y="5" width="8" height="9" rx="1"/>` plus back sheet L-path `<path d="M3 11 V3 H10"/>` so the two sheets do not draw an overlapping inner grid when `fill="none"`. |
| `icon-json` | Two brace paths and no text. Left: `M6 3 C4 3 4 5 4 6.5 C4 8 3 8 3 8 C3 8 4 8 4 9.5 C4 11 4 13 6 13`. Right: the same path mirrored about x 8, starting at x 10. |
| `icon-hl7` | Three vertical lines, x 4, 8, and 12, from y 3 to y 13. |
| `icon-ccda` | The message rectangle, plus a polyline `4,8 7,8 8,5 10,11 11,8 13,8` clipped inside the rectangle by keeping the polyline from x 5 to x 11. |
| `icon-builtin` | A rectangle `2,6 12,8` and a path for the lid `M2 6 L4 3 H12 L14 6`. |
| `icon-repo` | A circle cx 5 cy 4 r 1.2, a circle cx 5 cy 12 r 1.2, a circle cx 12 cy 8 r 1.2, and lines from the first circle to the third and from the second circle to the third. This is a branch mark, not the GitHub logo. |
| `icon-folder` | A 12 by 8 rectangle at x 2 y 5, rx 1, plus a 5 by 3 tab at x 2 y 3. |

`icons.js` exposes one function on `window`:

```javascript
function icon(id) {
```

It returns an `<svg width="16" height="16" aria-hidden="true" focusable="false">` whose child is `<use href="/icons.svg#id">`. Unknown ids return an empty `<span>` so a bad id does not break the row.

Load `/js/icons.js` before `/js/file-browser.js`.

## 5. Where the icons go

Each mark is `aria-hidden="true"` because the visible word or file name is the label.

File rows, inside the button, before the text:

- A sample row uses `icon-message`.
- A root template whose name ends in `.liquid` uses `icon-template`.
- A file under a partial folder whose name ends in `.json` uses `icon-json`.
- Any other partial uses `icon-partial`.

The text node goes in `<span class="file-browser-label">` so ellipsis still applies to the name and not to the icon. Keep `title` as the full label. Keep `data-template-name`, `is-selected`, `is-suggested`, and the keyboard behavior from the usability specs.

Source switch, as the first child of each button:

- Built-in: `icon-builtin`
- GitHub: `icon-repo`
- Folder: `icon-folder`

The button text stays.

Pane headers, before the title word:

- Message: `icon-message`
- Template: `icon-template`
- FHIR result: `icon-json`

If `#project-label` exists, do not rewrite it in this spec.

Save: when `updateUnsavedDot` adds `is-dirty`, also prepend nothing new if a `.tab-dirty` is already inside the button. Add one `<span class="tab-dirty" hidden>` as the first child of `#template-save-button` in the HTML. `updateUnsavedDot` shows that span while the button has `is-dirty`, and hides it otherwise. The tab dot is unchanged. The button's accessible name stays `Save`.

Do not add icons to Convert, Send, Copy, New, Generate, Settings, or API docs.

## 6. CSS

```css
.file-browser-row svg,
.source-switch svg,
.pane-header svg {
    flex: 0 0 auto;
    width: 16px;
    height: 16px;
    color: var(--text-muted);
}
```

`.file-browser-row` is `display: flex`, `align-items: center`, `gap: 6px`. `.file-browser-label` gets `min-width: 0`, `overflow: hidden`, `text-overflow: ellipsis`, `white-space: nowrap`.

`.pane-header svg` color is `var(--text-muted)`. Selected rows use `color: var(--text)` on their svg.

`.source-switch button` is `display: inline-flex`, `align-items: center`, `justify-content: center`, `gap: 4px`.

Remove the Font Awesome `<link>` from `index.html`.

## 7. How to check

1. The network panel does not request `use.fontawesome.com`.
2. `ADT04-23.hl7` has the message mark. `ADT_A04.liquid` has the template mark. A partial `.liquid` has the partial mark. `CodeSystem.json`, if listed, has the brace mark. The folder chevron still opens and closes.
3. Long names still truncate, and the icon stays fully visible.
4. Built-in, GitHub, and Folder show their marks and their words.
5. Pane titles still read Message, Template, and FHIR result.
6. Convert, Send, and Copy have no svg.
7. Dirty Save shows the blue dot and the word Save. In dark theme the icons follow `--text-muted` and stay visible.
8. Keyboard: arrow keys still move between file rows. The svg is not a tab stop.

Then run `npm test` and `npm run eslint`.

## 8. Acceptance criteria

- Nine symbols exist, all `currentColor`, and no icon is the only label.
- Font Awesome is not loaded.
- File-row selection, truncation, and keyboard behavior still work in both themes.
