# Spec 01: Color tokens

**Status:** Done (2026-11-17). Implement this file only. Read `specs/web-ui/theme/00-order.md` first.

## 1. Goal

The page chrome takes its colors from CSS custom properties. Light values match the page as it looks today. Dark values exist in the stylesheet and apply immediately when `html` has `data-theme="dark"` — without Bootstrap `.bg-light` `!important` blocking them, and without dark-grey buttons or bright-white autocomplete popups becoming unreadable. This spec does not add a theme picker control and does not change the CodeMirror theme. The default attribute is `light`.

## 2. Current behavior

1. `src/static/index.html` sets `<body class="bg-light">` (line `47`) and `<nav class="navbar navbar-expand-sm bg-light navbar-light" id="navbar">` (line `50`). In Bootstrap 4.3.1, `.bg-light` declares `background-color: #f8f9fa !important`, which beats non-`!important` custom rules unless `.bg-light` is removed from the HTML.
2. `src/static/css/template-editor.css` hardcodes light colors across the canvas (`#eef1f6`), text (`#1c2430`), surfaces (`#fff`), muted text (`#667085`), header names (`#344054`), borders (`#e3e8ef`, `#eef1f6`), selection (`#dbe7ff`), hover (`#f2f6fb`), accent (`#1f6feb`), danger (`#842029` on `#f8d7da`), dirty dot (`#0d6efd`), include links, and resizers.
3. Secondary buttons use Bootstrap `btn-outline-dark` and `btn-dark` (`#343a40`), and CodeMirror's `.CodeMirror-hints` popup uses hardcoded `#fff` / `#000` from `show-hint.css`.
4. `setColorTheme` in `src/static/js/template-editor.js` stays untouched in this spec; Spec 03 deletes it. Do not change heights, overflow, fonts, or splitters.

## 3. Files you may edit

- `src/static/css/template-editor.css`
- `src/static/index.html`

## 4. Tokens

On `:root`, and again on `html[data-theme="light"]`, set:

| Token | Value |
| --- | --- |
| `--canvas` | `#eef1f6` |
| `--surface` | `#ffffff` |
| `--surface-muted` | `#f2f4f8` |
| `--text` | `#1c2430` |
| `--text-muted` | `#667085` |
| `--border` | `#e3e8ef` |
| `--border-subtle` | `#eef1f6` |
| `--selection` | `#dbe7ff` |
| `--hover` | `#f2f6fb` |
| `--accent` | `#1f6feb` |
| `--accent-text` | `#ffffff` |
| `--danger-text` | `#842029` |
| `--danger-bg` | `#f8d7da` |
| `--warning` | `#d97706` |
| `--unread` | `#c41e3a` |
| `--include` | `#087443` |
| `--focus` | `#1f6feb` |
| `--dirty` | `#0d6efd` |
| `--gutter` | `#c5ced9` |

On `html[data-theme="dark"]` set:

| Token | Value |
| --- | --- |
| `--canvas` | `#151b24` |
| `--surface` | `#1c2430` |
| `--surface-muted` | `#242d3b` |
| `--text` | `#e7ecf2` |
| `--text-muted` | `#98a2b3` |
| `--border` | `#323c4d` |
| `--border-subtle` | `#2a3444` |
| `--selection` | `#1f3a5f` |
| `--hover` | `#243044` |
| `--accent` | `#4c9aff` |
| `--accent-text` | `#0b1220` |
| `--danger-text` | `#ffb4b4` |
| `--danger-bg` | `#4a2428` |
| `--warning` | `#fbbf24` |
| `--unread` | `#ff8a8a` |
| `--include` | `#5dcaa5` |
| `--focus` | `#4c9aff` |
| `--dirty` | `#6cb6ff` |
| `--gutter` | `#3a4658` |

In `src/static/index.html`:

- Set `<html data-theme="light">`. Do not add a script in this spec.
- Remove `class="bg-light"` from `<body>`.
- Remove `bg-light` and `navbar-light` from `<nav id="navbar">` (keep `class="navbar navbar-expand-sm"`).

## 5. Use the tokens

Replace hardcoded chrome colors in `src/static/css/template-editor.css` while keeping every layout declaration:

- `body`: `background: var(--canvas)`, `color: var(--text)`.
- `#navbar`: `background: var(--surface)`, `border-bottom: 1px solid var(--border)` (remove `background: #fff !important`). `#navbar .navbar-brand`: `color: var(--text)`.
- `#file-browser` and `.file-browser-rail`: `background: var(--surface)`, `color: var(--text)`. Under `html[data-theme="dark"]`, set `box-shadow: none` and `border: 1px solid var(--border)` on both.
- `.source-switch`: `background: var(--surface-muted)`. `.source-switch button`: `color: var(--text-muted)`. `.source-switch button.is-active`: `background: var(--surface)`, `color: var(--text)`.
- `#file-browser .file-browser-heading`, `.source-help`, and `#conversion-status`: `color: var(--text-muted)`.
- `#message-name` and `#template-open-name`: `color: var(--text)`.
- `.file-browser-row:hover`, `.file-browser-section-toggle:hover`, `.file-browser-toggle:hover`, and `.file-browser-rail:hover`: `background: var(--hover)`. `.file-browser-row.is-selected`: `background: var(--selection)`.
- `#file-browser-resizer:hover` and `#file-browser-resizer.is-dragging`: `background: var(--border)`.
- `#editor-main`, `.template-area`, `.output-area`, `.msg-area`, and `#includes-popover`: `background: var(--surface)`, `color: var(--text)`. `#includes-popover` border uses `var(--border)`.
- `.split`: `border-color: var(--border)`. `.pane-header` and `nav.template-tabs`: `border-bottom-color: var(--border-subtle)`.
- `.gutter` and `.gutter-vertical`: `background: var(--gutter)`.
- Primary action buttons (`#convert-button`, `#generate-run-button`, `#github-list`, `#folder-list`, `#new-template-create`, `#settings-save-button`): `background: var(--accent)`, `border-color: var(--accent)`, `color: var(--accent-text)`.
- Quiet/outline chrome buttons (`#settings-open`, `#api-docs-link`, `#new-template-button`, `#new-template-cancel`, `#generate-template-button`, `#copy-result-button`, `#send-fhir-button`, `.includes-trigger`, `#new-sample-button`, `#import-sample-button`, `#save-sample-button`, `.file-browser-toggle`): `background: var(--surface)`, `color: var(--text)`, `border: 1px solid var(--border)`, with `:hover` `background: var(--hover)`. (`#send-fhir-button` may keep `border-color: var(--accent); color: var(--accent)` so Send stays visually distinct.)
- `#conversion-error`, `#result-error`, and `.project-modal-error`: `color: var(--danger-text)`, `background: var(--danger-bg)`.
- `.tab-dirty`: `background: var(--dirty)`.
- `.underline` and `.include-link`: `border-bottom-color: var(--include)` (delete `.bg-dark .underline`). `.include-missing`: `border-bottom-color: var(--warning)`.
- `.unused-segment`: `border-bottom-color: var(--unread)`.
- Focus outlines and `.file-browser-row.is-suggested`: use `var(--focus)`.
- `.modal-content`, `.modal-header`, `.modal-footer`: `background: var(--surface)`, `color: var(--text)`, `border-color: var(--border)`. `.modal-header .close`: `color: var(--text)`.
- `.form-control`: `background: var(--surface)`, `color: var(--text)`, `border-color: var(--border)`; `::placeholder` `color: var(--text-muted)`.
- `.nav-link`: `color: var(--text-muted) !important`; `.nav-link:hover`, `.nav-link:focus`, and `.nav-link.font-weight-bold`: `color: var(--text) !important`. Delete the `.bg-dark .nav-link` and `.bg-dark .dropdown-*` rules.
- Autocomplete popup (`.CodeMirror-hints`): `background: var(--surface)`, `border-color: var(--border)`. `li.CodeMirror-hint`: `color: var(--text)`. `li.CodeMirror-hint-active`: `background: var(--selection)`, `color: var(--text)`.

## 6. How to check

Open `http://localhost:2019`.

1. With `data-theme="light"`, verify gray canvas, white panes, readable buttons, and blue selection on `ADT04-23.hl7`.
2. In the browser console, run `document.documentElement.setAttribute('data-theme', 'dark')`. Verify `body` (`#151b24`) and `#navbar` (`#1c2430`) actually switch to dark (not stuck on Bootstrap `#f8f9fa`), every navbar and pane-header button has readable light borders and text, `#includes-popover` and Settings modal are dark, and opening CodeMirror autocomplete (`| get_segment`) shows a dark popup.
3. Set `data-theme` back to `light` and reload. Confirm `<html data-theme="light">`.

Then run `npm test` and `npm run eslint`.

## 7. Acceptance criteria

- Light mode uses the tokens and preserves layout.
- `html[data-theme="dark"]` recolors `body`, `#navbar`, panes, sidebar/rail, buttons, modals, popovers, and `.CodeMirror-hints` cleanly without Bootstrap `bg-dark` or `.bg-light` interference.
- No new dependency or CDN request is added.
