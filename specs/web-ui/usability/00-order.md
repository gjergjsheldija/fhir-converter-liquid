# Web UI usability specs

These specs turn the UI usability and workflow reviews into work a single agent can implement one file at a time. They describe the page in `src/static/` and its supporting routes.

## Rules for every spec

1. Implement one numbered spec, then stop. Do not start the next spec in the same change.
2. Read this file, then the spec you are implementing, then the files that spec names. The spec's "Current behavior" section is the baseline. If the worktree no longer matches that baseline, stop and report the difference. Do not invent a new design.
3. Edit only the files listed in that spec.
4. Do not add a dependency. Do not add a test framework. Do not edit `*.liquid` files, bundled `src/sample-data/**` messages, or expected JSON.
5. Do not change the convert request body (`srcData`, `template`, `templatesOverride`), the convert URL, or how unused-segment marks are calculated.
6. Preserve behavior added by earlier specs in this folder. Later specs name what must stay.
7. Do not commit unless the user explicitly asks.

## Order

Specs 01–16 are implemented. Do not re-implement them. Implement specs 17–20 in order before starting `specs/web-ui/theme/`, `specs/web-ui/editor/`, and `specs/web-ui/projects/`.

| Spec | Status | File | What it changes |
| --- | --- | --- | --- |
| 01 | Done | `01-keep-editors-in-panes.md` | The page stops growing with the FHIR result. Each editor scrolls inside its pane. |
| 02 | Done | `02-wrap-message-and-result-lines.md` | Message and result lines wrap. The template editor does not. |
| 03 | Done | `03-open-example-on-startup.md` | An empty page loads `ADT04-23.hl7` and `ADT_A04.liquid`. |
| 04 | Done | `04-file-list-filter-folders-and-width.md` | Filter stays local, folders show a chevron and a count, names truncate, the sidebar can be dragged. |
| 05 | Done | `05-suggest-template-for-sample.md` | Choosing a sample outlines the template that matches MSH-9. |
| 06 | Done | `06-file-rows-as-buttons.md` | File rows are buttons with a roving tabindex and arrow keys. |
| 07 | Done | `07-unused-field-legend.md` | The red-underline hint appears only after a conversion marks unused fields. |
| 08 | Done | `08-clear-result-on-conversion-failure.md` | A failed conversion clears the result and shows the error in the result pane. |
| 09 | Done | `09-conversion-status-and-confirmations.md` | Success names the resource. Copy and Send confirm themselves. |
| 10 | Done | `10-save-follows-unsaved-state.md` | Save is quiet until the file is dirty. The dirty dot sits on the tab. Cmd/Ctrl-S saves. |
| 11 | Done | `11-name-a-new-template.md` | New asks for the template name in the header. Include opening stays in spec 15. |
| 12 | Done | `12-split-settings.md` | Settings is two groups. API docs moves to the navbar. |
| 13 | Done | `13-explain-github-and-folder.md` | GitHub and Folder say what to type and where the value goes. |
| 14 | Done | `14-autocomplete-library-filters.md` | After a pipe, completion includes filters such as `get_segment_lists`. `{% ` completion includes `evaluate`. |
| 15 | Done | `15-included-templates-panel.md` | The open template lists the partials it includes. One click opens that partial in a tab. |
| 16 | Done | `16-editor-font.md` | The three editors and the hint list use a 13px coding face. The rest of the page stays on the UI font. |
| 17 | Done | `17-collapse-files-pane.md` | Collapse and expand the left Files pane with a header toggle, a collapsed left rail, and Cmd/Ctrl-B. |
| 18 | Done | `18-fold-samples-templates-and-partials.md` | Fold and unfold the `Samples`, `Templates`, and `Partials` sidebar sections with counts and persisted state. |
| 19 | Done | `19-includes-popover-and-create-include.md` | Replace the multi-row Included chip tray with a grouped `Includes (N) ▾` tab-bar popover and one-click creation of missing includes. |
| 20 | Not started | `20-add-and-import-hl7v2-samples.md` | Add synthetic HL7v2 starters, drag-and-drop / multi-file sample import, and `Save sample` into gitignored `src/service-samples/`. |

## Required check on every spec

From the repo root:

```sh
npm test
npm run eslint
```

Report pass and fail counts. A failure that already exists in Liquid compatibility tests, and that your diff does not touch, is not a reason to edit converter code. Report it and stop.

There is no browser test suite. Each spec ends with a manual check against `http://localhost:2019` after the app is running (restart the server first whenever server files changed). Do that check. Do not mark the spec done from the build alone.
