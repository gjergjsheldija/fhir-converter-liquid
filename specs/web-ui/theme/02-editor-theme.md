# Spec 02: One editor theme (`fhir`)

**Status:** Done (2026-11-17). All three editors use the `fhir` theme; `eclipse.css`/`blackboard.css` unlinked and no functional references remain in `src/static/`; syntax tokens added for light and dark; full validation 369 passing with only the 109 known baseline failures.

## 1. Goal

The message, template, and result editors use one CodeMirror theme named `fhir`. It reads the surface and syntax tokens on `html[data-theme]`, so it automatically switches between Light and Dark and exposes clean token roles for FHIR JSON, Liquid tags/variables/filters, and HL7v2 segments/delimiters. Eclipse and Blackboard are removed.

## 2. Current behavior

- `src/static/index.html` links `/codemirror/theme/eclipse.css` and `/codemirror/theme/blackboard.css`.
- `src/static/js/template-editor.js` sets `darkMode = "blackboard"` and `lightMode = "eclipse"`, creates all three editors with `theme: lightMode`, and switches themes inside `setColorTheme`.
- Spec 01 defines surface tokens (`--surface`, `--text`, `--text-muted`, `--border-subtle`, `--selection`, `--accent`). This spec adds the syntax token palette so both today's modes and the upcoming HL7v2 + Liquid + JSON syntax modes (`specs/web-ui/editor/01-syntax-coloring-hl7-liquid-json.md`) style cleanly in light and dark.

## 3. Files you may edit

- `src/static/css/template-editor.css`
- `src/static/css/codemirror-fhir.css` (new)
- `src/static/index.html`
- `src/static/js/template-editor.js`

## 4. Syntax tokens

Add these tokens to `:root` / `html[data-theme="light"]` in `src/static/css/template-editor.css`:

| Token | Value | Used for |
| --- | --- | --- |
| `--syntax-keyword` | `#6f42c1` | Liquid tags (`assign`, `if`, `for`, `evaluate`, `include`, `using`), JSON `true`/`false`/`null`, HL7 segment IDs (`MSH`, `PID`, `OBX`) |
| `--syntax-property` | `#0550ae` | FHIR JSON keys (`"resourceType"`, `"entry"`), Liquid filter names after `\|` |
| `--syntax-string` | `#0a7a3e` | JSON string values, Liquid quoted strings |
| `--syntax-number` | `#1f6feb` | JSON numbers, HL7 numeric indices |
| `--syntax-variable` | `#9a3412` | Liquid variables (`hl7v2Data`, `firstSegments`, `bundleID`), HL7 component/escape tokens |
| `--syntax-punctuation` | `#57606a` | Liquid `{%`, `%}`, `{{`, `}}`, `\|`, HL7 delimiters `\|`, `^`, `~`, `&` |
| `--syntax-comment` | `#667085` | Liquid `{% comment %}...{% endcomment %}` blocks |

Add the matching dark values to `html[data-theme="dark"]`:

| Token | Value |
| --- | --- |
| `--syntax-keyword` | `#d2a8ff` |
| `--syntax-property` | `#79c0ff` |
| `--syntax-string` | `#7ee787` |
| `--syntax-number` | `#a5d6ff` |
| `--syntax-variable` | `#ffa657` |
| `--syntax-punctuation` | `#8b949e` |
| `--syntax-comment` | `#98a2b3` |

## 5. Theme file (`src/static/css/codemirror-fhir.css`)

Style `.cm-s-fhir` only:

- `.cm-s-fhir.CodeMirror`: `background: var(--surface)`, `color: var(--text)`.
- `.cm-s-fhir .CodeMirror-gutters`: `background: var(--surface)`, `color: var(--text-muted)`, `border-right: 1px solid var(--border-subtle)`.
- `.cm-s-fhir .CodeMirror-linenumber` and `.cm-s-fhir .CodeMirror-foldgutter-open, .cm-s-fhir .CodeMirror-foldgutter-folded`: `color: var(--text-muted)`.
- `.cm-s-fhir .CodeMirror-cursor`: `border-left: 1.5px solid var(--text)`.
- `.cm-s-fhir .CodeMirror-selected`, `.cm-s-fhir.CodeMirror-focused .CodeMirror-selected`: `background: var(--selection)`.
- `.cm-s-fhir span.cm-keyword`, `.cm-s-fhir span.cm-atom`, `.cm-s-fhir span.cm-tag`: `color: var(--syntax-keyword); font-weight: 600;` (keep `.cm-atom` normal weight `400`).
- `.cm-s-fhir span.cm-property`, `.cm-s-fhir span.cm-builtin`, `.cm-s-fhir span.cm-qualifier`: `color: var(--syntax-property)`.
- `.cm-s-fhir span.cm-string`, `.cm-s-fhir span.cm-string-2`: `color: var(--syntax-string)`.
- `.cm-s-fhir span.cm-number`: `color: var(--syntax-number)`.
- `.cm-s-fhir span.cm-variable`, `.cm-s-fhir span.cm-variable-2`, `.cm-s-fhir span.cm-def`: `color: var(--syntax-variable)`.
- `.cm-s-fhir span.cm-operator`, `.cm-s-fhir span.cm-meta`, `.cm-s-fhir span.cm-bracket`: `color: var(--syntax-punctuation)`.
- `.cm-s-fhir span.cm-comment`: `color: var(--syntax-comment); font-style: italic;`.
- `.cm-s-fhir span.CodeMirror-matchingbracket`: `color: inherit; border-bottom: 2px solid var(--accent);`.
- `.cm-s-fhir .CodeMirror-foldmarker`: `color: var(--accent); text-shadow: none; font-family: inherit;`.

Do not set `font-family`, `font-size`, or `line-height` here; Spec 16 owns those.

Link `<link rel="stylesheet" type="text/css" href="/css/codemirror-fhir.css">` in `src/static/index.html` after `codemirror.css`, and delete the `eclipse.css` and `blackboard.css` `<link>` tags.

## 6. Apply in `src/static/js/template-editor.js`

- Delete `var darkMode = "blackboard";` and `var lightMode = "eclipse";`.
- Create `dataEditor`, `outputCode`, and `templateCodeEditor` with `theme: "fhir"`.
- In `setColorTheme`, delete the three `setOption("theme", ...)` lines (leave the rest of `setColorTheme` for Spec 03 to delete cleanly).

## 7. How to check

1. Reload `http://localhost:2019`. Confirm all three editors report `getOption('theme') === 'fhir'` and gutters blend cleanly with the panes.
2. Toggle `document.documentElement.setAttribute('data-theme', 'dark')` in the console. Editor backgrounds (`#1c2430`), gutters, selections, JSON properties (`#79c0ff`), and strings (`#7ee787`) recolor immediately.
3. Confirm font size remains `13px` on `ui-monospace`.

Then run `npm test` and `npm run eslint`.

## 8. Acceptance criteria

- All three editors use `fhir` in both light and dark themes.
- `eclipse.css` and `blackboard.css` are no longer linked.
- Syntax tokens cover keywords/tags, properties/builtins, strings, numbers, variables, punctuation/operators, and comments in both themes.
