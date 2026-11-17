# Spec 18: Fold Samples, Templates, and Partials sections in the file browser

**Status:** Done (2026-11-17). Validated via full mocha suite + eslint + `git diff --check` (360 passing / 110 failing: 109 baseline failures + 1 load-induced flake in the HL7v2 regression spec that returns 200 in isolated re-runs). Live browser check skipped per orchestrator instruction; acceptance criteria verified statically against the implementation.

## 1. Goal

The three top-level sections in the Built-in file browser — `Samples`, `Templates`, and `Partials` — can each be folded and unfolded with a chevron and show their rendered item count. Users no longer have to scroll past all samples and all 58 root templates to reach partials, and their open/closed choices persist across reloads.

## 2. Current behavior

In `src/static/index.html` (lines `82–89`), `#builtin-lists` renders three static headings and three list containers:

```html
<div id="builtin-lists">
    <div class="file-browser-heading">Samples</div>
    <div id="samples-list"></div>
    <div class="file-browser-heading">Templates</div>
    <div id="templates-list"></div>
    <div class="file-browser-heading">Partials</div>
    <div id="partials-list"></div>
</div>
```

None of the three headings is interactive. Partials sub-folders (`CodeSystem (2)`, `Resource (45)`, etc.) fold individually from Spec 04, while `Samples` and `Templates` are always expanded and show no counts.

## 3. Files you may edit

- `src/static/index.html`
- `src/static/css/template-editor.css`
- `src/static/js/file-browser.js`

Do not edit `*.liquid` files, sample messages, or server code.

## 4. Markup and CSS

Replace `#builtin-lists` in `src/static/index.html` with three `.file-browser-section` blocks, all open by default:

```html
<div id="builtin-lists">
    <div class="file-browser-section open" data-section="samples">
        <button type="button" class="file-browser-heading file-browser-section-toggle" aria-expanded="true" aria-controls="samples-list">
            <span class="file-browser-chevron" aria-hidden="true"></span>
            <span class="file-browser-section-label" id="samples-heading-label">Samples</span>
        </button>
        <div id="samples-list" class="file-browser-section-body"></div>
    </div>
    <div class="file-browser-section open" data-section="templates">
        <button type="button" class="file-browser-heading file-browser-section-toggle" aria-expanded="true" aria-controls="templates-list">
            <span class="file-browser-chevron" aria-hidden="true"></span>
            <span class="file-browser-section-label" id="templates-heading-label">Templates</span>
        </button>
        <div id="templates-list" class="file-browser-section-body"></div>
    </div>
    <div class="file-browser-section open" data-section="partials">
        <button type="button" class="file-browser-heading file-browser-section-toggle" aria-expanded="true" aria-controls="partials-list">
            <span class="file-browser-chevron" aria-hidden="true"></span>
            <span class="file-browser-section-label" id="partials-heading-label">Partials</span>
        </button>
        <div id="partials-list" class="file-browser-section-body"></div>
    </div>
</div>
```

Note: `.file-browser-section-toggle` intentionally does **not** have class `.file-browser-row`, so Spec 06's file-row roving tabindex and file-selection queries remain scoped to file and sub-folder rows, while each section toggle remains a standard keyboard-focusable `<button type="button">`.

In `src/static/css/template-editor.css`:

- `button.file-browser-section-toggle`: `display: flex`, `align-items: center`, `gap: 4px`, `width: 100%`, `border: 0`, `background: transparent`, `padding: 2px 4px`, `border-radius: 6px`, `cursor: pointer`, `text-align: left`. Keep `#file-browser .file-browser-heading`'s `margin-top: 14px`, `font-size: 11px`, `letter-spacing: 0.04em`, `text-transform: uppercase`, and `color: #667085`. Hover background `#f2f6fb`; focus outline `2px solid #1f6feb`, `outline-offset: -2px`.
- `.file-browser-section > .file-browser-section-toggle .file-browser-chevron::before { content: "▸"; }`
- `.file-browser-section.open > .file-browser-section-toggle .file-browser-chevron::before { content: "▾"; }`
- `.file-browser-section:not(.open) > .file-browser-section-body { display: none; }`

## 5. Behavior

In `src/static/js/file-browser.js`:

1. Maintain `var openSections = { samples: true, templates: true, partials: true };`, hydrated on startup from `localStorage.getItem('fhirConverterFileSections')` inside `try / catch` (accept boolean properties for `samples`, `templates`, and `partials`; keep `true` as default for missing keys).
2. During `renderFileBrowser(messages)`:
   - Update the three labels with rendered item counts:
     - `#samples-heading-label`: `'Samples (' + renderedSamplesCount + ')'`
     - `#templates-heading-label`: `'Templates (' + renderedRootsCount + ')'`
     - `#partials-heading-label`: `'Partials (' + renderedPartialsFileCount + ')'` (sum of rendered partial files across shown folders)
   - When `filter` is non-empty, temporarily expand (`.addClass('open')` and `aria-expanded="true"`) every section whose rendered count is `> 0`, and collapse sections whose rendered count is `0`, without overwriting `openSections`.
   - When `filter` is empty, apply `openSections[section]` to each `.file-browser-section` (`open` class and `aria-expanded`).
   - Run `setFileRowTabOrder()` after updating section visibility so rows inside folded sections (`:visible === false`) are skipped by keyboard navigation.
3. On click of `.file-browser-section-toggle`:
   - Read `section = $(this).closest('.file-browser-section').attr('data-section')`.
   - Toggle the `.open` class and `aria-expanded`.
   - When `#file-filter` is empty, update `openSections[section]` and persist `JSON.stringify(openSections)` to `fhirConverterFileSections` inside `try / catch`.
   - Call `setFileRowTabOrder()`.
4. In `highlightMatchingTemplate(text)` (Spec 05): if `suggestedTemplate` is non-null and the `templates` section is folded, unfold `templates` (`openSections.templates = true`, persist, and apply before `scrollIntoView({block: 'nearest'})`) so the suggested template row is visible.

## 6. How to check

1. Open `http://localhost:2019`. Confirm headings read `Samples (16)`, `Templates (58)`, and `Partials (858)` (or current counts), each preceded by `▾`.
2. Click `Samples (16)` and `Templates (58)` to fold both. `Partials (858)` moves right to the top of the sidebar.
3. Reload. `Samples` and `Templates` remain folded; `Partials` remains open.
4. Type `adt` in `#file-filter`. Matching sections expand while the filter is active; clearing `#file-filter` restores the saved folded state.
5. Unfold `Samples`, fold `Templates`, and click `ADT01-23.hl7`. `Templates` automatically unfolds to reveal the outlined `ADT_A01.liquid` suggestion.

Then run `npm test` and `npm run eslint`.

## 7. Acceptance criteria

- `Samples`, `Templates`, and `Partials` fold and unfold independently with `▾` / `▸`, `aria-expanded`, and rendered counts.
- `fhirConverterFileSections` persists section state across reloads.
- Non-empty filters temporarily open matching sections and restore saved state when cleared.
- Folded sections are excluded from Spec 06's visible-row keyboard navigation.
