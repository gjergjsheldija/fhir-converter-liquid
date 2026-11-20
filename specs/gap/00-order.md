# Gap specs

These specs are the leftovers from the market analysis after the fidelity, editor, site-pack, CLI, OIE, conditional-send, and C-CDA tracks. They are not started.

## Rules

1. Implement one numbered spec, then stop.
2. Read this file, then the spec, then the files it names. If "Current behavior" does not match the worktree, stop and report the difference.
3. Edit only the files listed in that spec.
4. Do not edit `src/templates/**`, `src/sample-data/**`, or `test/e2e-test/liquid-fixtures/**`.
5. Do not add a dependency unless that spec says the dependency is required and names it.
6. Do not add a TCP listener to this server.
7. Do not commit unless the user explicitly asks.

## Order

| Spec | Status | File | What it changes |
| --- | --- | --- | --- |
| 01 | Done (2026-11-20) | `01-ig-coverage-score.md` | A coverage score between one generated field-map ConceptMap and the HL7 v2-to-FHIR IG. |
| 02 | Done (2026-11-20) | `02-validate-with-profile.md` | Validate can send one profile canonical URL to the existing `{base}/$validate` call. |
| 03 | Done (2026-11-20) | `03-unmapped-code-queue.md` | After a site pack runs, list Codings that no ConceptMap rewrote. |
| 04 | Done (2026-11-20) | `04-result-lineage.md` | Clicking a FHIR element shows the source field and the include that wrote it. |
| 05 | Done (2026-11-20) | `05-declared-segment-list.md` | A project segment list reports segment ids the message used that are not on the list. |
| 06 | Not started | `06-failure-log.md` | A failed conversion is listed with its MSH-10, without storing the raw message by default. |
| 07 | Not started | `07-convert-api-key-and-audit.md` | An optional API key on convert, plus an audit line that records MSH-10 and not the body. |
| 08 | Not started | `08-conditional-update.md` | A separate send option updates the resource that already has the identifier. |
| 09 | Not started | `09-oie-archive-msh10.md` | The OIE channel archives the raw message under MSH-10. This server still has no TCP listener. |
| 10 | Not started | `10-ccda-expected-outputs.md` | Sync official C-CDA expected JSON only if the pinned Microsoft tree has it. |
