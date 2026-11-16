# Handoff — fixture re-baseline to pinned v7.0 ("re-sync + fix to green")

Date: 2026-11-15. Status: historical. Specs 01–04 are gone. Implementation
order is `specs/ORDER.md`. Do not treat the remaining-work list below as current.

## 1. Objective — two spec documents to be written

- **Spec A** — "Bring the local JS test suite to upstream master test status."
  Re-baseline expected-result fixtures to the pinned Microsoft v7.0 official
  outputs, then close genuine engine gaps until `npm test` is green.
  Belongs here: `specs/liquid-template-compat/` (new file, e.g. `05-...`).
- **Spec B** — the second track: Node modernization (26.x latest stable,
  24.x LTS secondary). Deferred, not cancelled. Exact scope/location unknown —
  confirm with user; may live in the same dir or a new one.

## 2. Done so far (files written/edited, with paths)

- `test/e2e-test/liquid-fixtures/Expected/Hl7v2/**` — 132 fixture files
  replaced by `node scripts/sync-upstream-assets.js expected-results`
  (user-authorized). Verified against upstream commit
  `253307fe6063a42b024ef7dbeb6aae157f1c2f61` (v7.0).
  Example verified: `OUL-R23-01-expected.json` sha
  `40e869b0021cddf7200879b8770b482a23583cd8ddf0e2cad97f756593015f0d`.
- Prior commits (already in git): `a3d5d4a` (132 committed fixtures = this
  repo's own pre-fix engine output — the original drift), `eebd0dd`
  (DotLiquid-faithful engine fixes: nil-shim, generate_uuid), `949fc92`
  (upstream commit for generate_uuid semantics).
- Scratch (not in repo): `/tmp/suite-after-resync.txt` (full post-resync
  `npm test` output); `/private/var/folders/.../opencode/pinned-templates/`
  (git-archive of pinned `data/Templates/Hl7v2`, 914 .liquid files);
  `/private/var/folders/.../opencode/fhir-conv-pinned` (sparse upstream clone
  at the pin).
- Local template edits exist in `src/templates/Hl7v2/` (5 files, mtime
  2026-11-15 09:54, not synced, not by me this session):
  `Extensions/_PatientCitizenship.liquid`, `Extensions/_PatientNationality.liquid`,
  `Resource/_Coverage.liquid`, `Resource/_PLLocation.liquid`,
  `Resource/_Patient.liquid`. These are DotLiquid-compat workarounds
  (empty-value guards / has_CWE_* assign blocks) absent from upstream.

## 3. Findings (concrete facts)

- Post-resync `npm test` (Node 20.20.2): **393 passing, 1 pending, 61
  failing** = 4 generate_uuid unit failures + 57/132 e2e (75 e2e pass).
  Full output: `/tmp/suite-after-resync.txt`.
- Original fixture drift root cause: committed fixtures were this repo's own
  pre-fix engine output — 0/132 byte-matched pinned official v7.0, 59/132
  semantically differed. Fixed direction = re-baseline + fix engine, do not
  revert correctness fixes.
- generate_uuid unit failures: implementation (sentinel
  `984e2374-e7af-8f49-b5da-f1f36ac2d78a`, hashes literal "null") matches
  upstream per `949fc92`; the 4 failing tests have wrong expectations —
  correct them with an upstream citation (not a weakening).
- Template drift (real, small): exactly 5 local templates differ from pinned
  v7.0; none missing/extra. Official v7.0 fixtures were generated with the
  unmodified templates, so cases touching these 5 partials may fail by
  design. Diff seen only for `_PatientCitizenship.liquid` (local adds
  has_CWE_2/5/11 guards + comment); other 4 diffs truncated/unseen.
- Drifted files are partials (include templates) — one drifted partial can
  affect many message templates; map `{% include %}` chains before
  attributing failures.
- e2e pipeline: supertest `POST /api/v1/convert/hl7v2`
  (test/e2e-test/liquid-regression/liquid-regression.spec.js) using
  testcases-hl7v2.json (template/dataFile/expectedFile); compare via
  test/e2e-test/util/compare.js (key-sorted deep compare,
  MAX_COMPARISION_DEPTH=100, ExtraDynamicFieldInterceptor; failure message
  "different property: [entry.Array]" at compare.js:86, e.g. ORU_R01-01).
  Engine factory `instance(createNew, dataHandler, templateFilesLocation,
  templatesMap)` in `src/lib/liquid-converter/liquid-converter.js` accepts a
  template location — enables rendering against pinned vs local templates
  (planned triage experiment, not yet run).
- 57 e2e failures span 26 fixture dirs; notable families: SIU_S12–S17/S26
  (10), ADT_A08/A60 (4), ORM_O01 (6), OML_O21 (4), OUL_R23, DFT_P03/P11,
  OMG_O19, REF_I12/I14, RDE_O11/O25, RDS_O13, ADT01-23/28, ADT04-23/28,
  ORU_R01 (3), MDM_T02-03, BAR_P12-01, VXU_V04 (2).

## 6. Remaining work (in order)

1. Resolve the `git diff --check` blocker (see §5): decide whether upstream-ship
   trailing-whitespace is acceptable as a documented warning (done in `a3c12c3`),
   or whether a sanctioned fix (e.g. `.gitattributes` whitespace rules that
   suppress the check for `.hl7`/`.json` without altering bytes) is preferred.
2. Build per-case diff harness (scratch dir, ESM .mjs): replicate spec
   pipeline, run all 132 cases in-process, dump structural diffs for the 57
   failures. Support template-location override.
3. Run harness with local templates, then with `pinned-templates` → failures
   that disappear = template drift; remainder = engine gaps.
4. Map include chains of the 5 drifted partials → attribute drift failures.
5. Finish reading the 4 remaining template diffs (only _PatientCitizenship
   seen so far).
6. Present drift evidence to user; get decision (keep local edits vs
   `make sync-templates` to pin). Template changes = hard gate, user must
   explicitly authorize.
7. Fix engine gaps minimally (`src/lib/liquid-converter/`,
   `dotLiquidCompat.js`, filters/tags); iterate with focused tests.
8. Correct the 4 generate_uuid test expectations with the `949fc92`
   citation.
9. Final validation: `npm test` + `npm run eslint` green, report pass/fail
   counts (spec-03 `a3c12c3` already achieves 346/109; remaining task is the
   `git diff --check` blocker).
10. Update `.agents/skills/fhir-template-compat/PROJECT_CONTEXT.md` with
    measured findings (overdue).
11. Write spec A (and, after confirming scope with user, spec B).

## 7. Open questions

- What exactly is Spec B? Inferred = Node modernization (26.x / 24.x);
  unconfirmed.
- Keep the 5 local template edits or revert/sync to pin v7.0? (Needs user
  authorization; without it, green against official v7.0 may be impossible.)
- Do the 5 template edits predate or postdate the `eebd0dd` engine nil-shim,
  and were they made by the user or a prior agent session? Unknown.
- How many of the 57 e2e failures are template-drift vs engine gap: unknown
  until harness runs.
- Old specs 01–04: delete, archive, or leave? (Ask user.)

## Environment notes

- Tests need Node 20: `export PATH="$HOME/.local/share/mise/installs/node/20/bin:$PATH"`.
- Do not commit; 132 M fixtures + ~134 untracked WIP entries are in git status — leave untracked WIP untouched.
- `src/service-templates/Hl7v2` is gitignored; regenerate with `node src/init-service.js` in fresh worktrees.
- Pin: `test/e2e-test/liquid-fixtures/UPSTREAM_VERSION.md` = v7.0 @ `253307f...`.
