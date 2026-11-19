# Spec implementation order

Read `AGENTS.md` and the target folder's `00-order.md` before starting any spec. Implement **one numbered spec per change**.

## Completed historical baselines (do not re-implement)

- **Inline conversion plain JSON** (`1eee076`, 2026-11-16): `POST /api/v1/convert/:srcDataType` accepts plain `srcData`, `template`, and `templatesOverride` strings (no Base64).
- **AI template generation** (`46a9392` / `a8696f9`, 2026-11-17): `POST /api/v1/templategenerate`, `GET /api/v1/ai/providers`, browse routes, and FHIR send route.
- **Upstream v7.0 pin verification** (`specs/liquid-template-compat/03-pin-and-refresh-upstream-baseline.md`, `17231b1`): pinned to Microsoft FHIR Converter tag `v7.0`, commit `253307fe6063a42b024ef7dbeb6aae157f1c2f61` (`914` `.liquid` + `2` `.json` files in `src/templates/Hl7v2/`, `139` `.hl7` fixtures, `132` official expected JSON bundles).
- **Node 26 runtime migration** (`specs/runtime/01-migrate-to-node-26.md`, 2026-11-17): Node `>=26 <27`, mocha `12.0.3`, Docker `node:26-alpine`, CI matrix `[26]`. Host test baseline: `360 passing / 109 failing`, `npm run eslint` clean.
- **Web UI usability 01–16** (`specs/web-ui/usability/01` through `16`, commits `5211de8`..`c0f0e16` + spec 01 pane scroll): viewport-locked scrolling panes, wrapping, startup example, draggable/filterable sidebar, MSH-9 suggestion, button rows, unused-field legend, clear-on-failure, status/confirmations, dirty Save/Cmd-S, inline New template, split Settings, GitHub/Folder help, library filter autocomplete, Included partials panel, 13px coding font.

---

## Implementation queue (Phases 1–5 — ALL DONE as of 2026-11-18)

### Phase 1 — Runtime & test harness (`specs/runtime/00-order.md`) — Done
1. `specs/runtime/02-worker-pool-and-loader-cleanup.md` — **Done** (`e8cdb5e`)

### Phase 2 — Sidebar, Includes popover, and Sample management (`specs/web-ui/usability/00-order.md`) — Done
2. `specs/web-ui/usability/17-collapse-files-pane.md` — **Done** (`5525eec`)
3. `specs/web-ui/usability/18-fold-samples-templates-and-partials.md` — **Done** (`672e70c`)
4. `specs/web-ui/usability/19-includes-popover-and-create-include.md` — **Done** (`f9b6d53`)
5. `specs/web-ui/usability/20-add-and-import-hl7v2-samples.md` — **Done** (`a072704`)

### Phase 3 — Color tokens, unified editor theme, and SVG icons (`specs/web-ui/theme/00-order.md`) — Done
6. `specs/web-ui/theme/01-color-tokens.md` — **Done** (`869901a`)
7. `specs/web-ui/theme/02-editor-theme.md` — **Done** (`af07140`)
8. `specs/web-ui/theme/03-theme-control.md` — **Done** (`43e4df6`)
9. `specs/web-ui/theme/04-icons.md` — **Done** (`0127da0`)

### Phase 4 — Syntax coloring, folding, beautifier, and Debugger (`specs/web-ui/editor/00-order.md`) — Done
10. `specs/web-ui/editor/01-syntax-coloring-hl7-liquid-json.md` — **Done** (`5d96194`)
11. `specs/web-ui/editor/02-liquid-code-folding.md` — **Done** (`a55a2a0`)
12. `specs/web-ui/editor/03-liquid-beautifier.md` — **Done** (`e42bc41`)
13. `specs/web-ui/editor/04-debug-trace-and-hover-values.md` — **Done**
14. `specs/web-ui/editor/05-bottom-debug-drawer.md` — **Done**

### Phase 5 — Local & GitHub conversion projects (`specs/web-ui/projects/00-order.md`) — Done
15. `specs/web-ui/projects/01-manifest.md` — **Done**
16. `specs/web-ui/projects/02-create-empty-hl7v2.md` — **Done**
17. `specs/web-ui/projects/03-create-baseline-hl7v2.md` — **Done**
18. `specs/web-ui/projects/04-create-empty-ccda.md` — **Done**
19. `specs/web-ui/projects/05-open-local-project.md` — **Done**
20. `specs/web-ui/projects/06-open-github-project.md` — **Done**
21. `specs/web-ui/projects/07-new-and-open-dialog.md` — **Done**
22. `specs/web-ui/projects/08-open-startup-case.md` — **Done**
23. `specs/web-ui/projects/09-convert-from-open-project.md` — **Done**
24. `specs/web-ui/projects/10-save-into-the-open-project.md` — **Done**
25. `specs/web-ui/projects/11-add-official-hl7v2-samples.md` — **Done**

---

## Separate track — Microsoft v7.0 Liquid template compatibility

Keep compatibility changes strictly separate from Web UI commits (`AGENTS.md`):

- `specs/liquid-template-compat/07-align-generate-uuid-empty-input.md` — **Done (2026-11-19)** — Align `generate_uuid` empty/null handling with official Microsoft `v7.0` expected outputs.
- `specs/liquid-template-compat/08-classify-official-bundle-diffs.md` — **Done (2026-11-19)** — Classify every official HL7v2 case as pass/count/content (132 cases: 27 pass, 19 count, 86 content); `Device` is the dominant count family.
- `specs/liquid-template-compat/09-drop-extra-siu-device.md` — **Done (2026-11-19)** — Dropped the extra SIU `Device` (include path `AIG`: `{% evaluate %}` now shares the caller's scope like upstream `Evaluate.cs`); classification is now 27 pass, 5 count, 100 content.
- `specs/liquid-template-compat/10-drop-extra-oul-diagnostic-report.md` — **Done (2026-11-19)** — Dropped the extra `OUL_R23` `DiagnosticReport` (include variable `diagnosticId`: a doubled comma in `{% include … REF: x,, ID: diagnosticId %}` made LiquidJS drop `ID`; DotLiquid ignores it, so repeated tag-argument commas are now collapsed); classification is now 29 pass, 2 count, 101 content (`ADT-A08-01.hl7` also moved from count to content).
- `specs/liquid-template-compat/HANDOFF.md` — Historical triage notes for the remaining engine/template-drift cases.
