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
- `specs/liquid-template-compat/11-drop-extra-orm-medication-request.md` — **Done (2026-11-19)** — Dropped the extra `ORM_O01` `MedicationRequest` (include `Resource/MedicationRequest` at `ORM_O01.liquid` line 773: variable `medicationRequestID` is empty in case-sensitive LiquidJS but resolves to `medicationRequestId` in DotLiquid, so `normalizeVariableNameTypos` maps it); classification is now 29 pass, 1 count, 102 content (`ORM-O01-06.hl7` moved from count to content; only `ORM-O01-03` Account −1 remains a count row).
- `specs/liquid-template-compat/12-emit-missing-orm-account.md` — **Done (2026-11-19)** — Emitted the missing `ORM_O01` `Account` (include `BLG`, `ORM_O01.liquid` line 978: `ID: AccountId_BLG` vs `accountId_BLG` from `{% evaluate %}`; DotLiquid variable lookup is case-insensitive, LiquidJS left `ID` empty so both BLG Accounts merged into one id-less Account; `normalizeVariableNameTypos` maps it); classification is now 29 pass, 0 count, 103 content (`ORM-O01-03.hl7` moved from count to content).
- `specs/liquid-template-compat/13-classify-content-diffs.md` — **Done (2026-11-19)** — Added field-level `contentDelta` signatures (resource key plus differing dot paths) to every content row in `classification.json`; no conversion change, summary stays 132 cases: 29 pass, 0 count, 103 content.
- `specs/liquid-template-compat/14-align-condition-asserted-date.md` — **Blocked (2026-11-19)** — Not implemented: the `+05:30` expected offsets are the same instant as the emitted source offset and other fixtures keep the source offset; `compareContent` already treats them as equal.
- `specs/liquid-template-compat/15-ignore-same-instant-in-content-signatures.md` — **Done (2026-11-19)** — `contentDelta` ignores same-instant dateTime pairs; summary stays 132 cases: 29 pass, 0 count, 103 content; the new top signature is `costToBeneficiary.1` (33 cases).
- `specs/liquid-template-compat/16-drop-extra-coverage-cost.md` — **Done (2026-11-19)** — Dropped the extra `Coverage.costToBeneficiary[1]`: the second `Resource/Coverage` render (`ADT_A01.liquid` line 695, `IN2` include) ran `DataType/_IDCoding` with `ID` bound to the Coverage id string, and LiquidJS read `ID.3` as a character (DotLiquid returns nil), so a bare `CodeSystem/` coding was emitted and the merger kept it as index 1; numeric keys on strings now read as nil (`stringIndexAccess.js`). Classification is now 31 pass, 0 count, 101 content.
- `specs/liquid-template-compat/17-align-patient-citizenship-text.md` — **Done (2026-11-19)** — Dropped the missing Patient `patient-citizenship` text: `_PatientCitizenship.liquid` tests `CWE_5_doubleDash == null` where `CWE_5_doubleDash = citizen.5.Value | append: '--'`; with CWE_2 = `United States of America` and CWE_5/CWE_11 nil, DotLiquid `Append` returns null for a nil input (so the first branch emits `text` = CWE_2), while LiquidJS's built-in `append` returned `--`, so no branch matched and `text` was omitted. Actual `valueCodeableConcept.text` (ADT-A01-01 Patient 9e909e52-61a1-be50-1878-a12ef8c36346, extension 7): absent; expected: `United States of America`. Registered a DotLiquid-compatible `append` helper (`filters/append.js`: nil input stays nil). Classification is now 93 pass, 0 count, 39 content (all 43 cases no longer list the path; the 20 `extension.5` cases also cleared; 62 content cases became pass, none regressed).
- `specs/liquid-template-compat/18-align-siu-appointment-participant.md` — **Done (2026-11-19)** — Aligned the SIU Appointment device participant: `Resource/_Appointment.liquid` line 191 reads `device_ID_AIG_3` but line 3 assigns `device_Id_AIG_3` via `{% evaluate %}`; case-sensitive LiquidJS rendered an empty id, DotLiquid resolves it case-insensitively. Actual `participant[1].actor.reference`: `Device/`; expected: `Device/0434a8f4-6ef0-5dc7-d1a1-91ad4b080b00`. `normalizeVariableNameTypos` maps `device_ID_AIG_3` → `device_Id_AIG_3`. Classification stays 93 pass, 0 count, 39 content; the 14 SIU cases no longer list `participant.1.actor.reference` (new top signatures: `status` 8, `supportingInformation.1.reference` 6).
- `specs/liquid-template-compat/19-align-siu-appointment-status.md` — **Done (2026-11-19)** — Aligned the SIU Appointment status: `SIU_S15` (and `S16`/`S17`/`S26`) include `Resource/Appointment` with a numeric `type_sch: 15`, and `_Appointment.liquid` tests `type_sch == "15"`; DotLiquid converts the right operand to the left type, LiquidJS `===` did not. Actual `status`: absent; expected: `cancelled`. `dotLiquidEquality.js` makes `==`/`!=` compare number and string after conversion. Classification is now 96 pass, 0 count, 36 content (the 8 cases no longer list `status`; 3 more cases became pass).
- `specs/liquid-template-compat/HANDOFF.md` — Historical triage notes for the remaining engine/template-drift cases.
