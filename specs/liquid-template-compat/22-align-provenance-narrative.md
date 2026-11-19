# Spec 22: Align Provenance narrative text

**Status:** Blocked (2026-11-19). Traced `MDHHS-OML-O21-2` and the other four cases at `cbe0459`: the actual `text.div` is identical to the expected div except the instant in `Resource bundle generated on <instant> using Microsoft FHIR Converter.` (actual: the run-time `now`, e.g. `2026-11-19T13:08:14.473Z`; expected: `2022-03-28T08:56:42.431Z`). `Template Version: TEMPLATE_VERSION_PLACEHOLDER.`, the template URL and `Root template: OML_O21.` match. The five expected instants are five distinct values (`2022-03-28T08:56:42.431Z`, `…T09:49:49.173Z`, `…T09:50:33.43Z`, `…T09:51:27.48Z`, `…T09:52:28.155Z`), so no engine behavior can match them; no engine, template, sample, or fixture change was made. Original note: Follow `.agents/skills/fhir-template-compat/SKILL.md` and `AGENTS.md`. Spec 21 is Done and on `origin/main` at `cbe0459`. Fix only this Provenance `text.div` path, or mark this spec Blocked when the trace shows the difference is the per-fixture generation clock.

## 1. Goal

Five official cases differ first at `Provenance.text.div`. After a real engine fix, none of those cases still lists that path. Cases that already pass stay passing. `summary.count` stays 0.

If the only difference is the generation instant inside that narrative, do not change the engine. Record the trace and set this spec to Blocked.

## 2. Verified set

From `classification.json` on `main` at `cbe0459`. Every content row whose first path is `text.div` is in this set. There are 5. All five are Provenance:

- `OML_O21` / `MDHHS-OML-O21-2.hl7`, Provenance `2f0f2d7d-7f93-e624-fa21-11d1c490897f`
- `REF_I12` / `REF-I12-01.hl7` and `REF-I12-02.hl7`, Provenance `7beed73b-5c63-2f47-d793-8e393f68b681`
- `REF_I14` / `REF-I14-01.hl7` and `REF-I14-02.hl7`, same Provenance id `7beed73b-5c63-2f47-d793-8e393f68b681`

`Resource/_Provenance.liquid` assigns `generationInstant` from `"" | now` and `templateVersion` to the literal `TEMPLATE_VERSION_PLACEHOLDER`, then writes both into `text.div`. `now` is the current UTC instant (`dateFilters.js` `nowFilter`). The five expected narratives do not share one instant:

- `MDHHS-OML-O21-2`: `2022-03-28T08:56:42.431Z`
- `REF-I12-01`: `2022-03-28T09:49:49.173Z`
- `REF-I12-02`: `2022-03-28T09:50:33.43Z`
- `REF-I14-01`: `2022-03-28T09:51:27.48Z`
- `REF-I14-02`: `2022-03-28T09:52:28.155Z`

Trace `MDHHS-OML-O21-2` before editing. Record the actual `text.div` and say which characters differ from the expected div.

## 3. Files you may edit

- Engine code under `src/lib/liquid-converter/**` and `src/lib/parsers/hl7v2/**`, plus a focused unit test next to the code you change, only when the trace names an engine cause other than the per-fixture clock
- `.agents/skills/fhir-template-compat/PROJECT_CONTEXT.md` with the verified result
- `test/e2e-test/liquid-regression/classification.json` by re-running the classifier, only when the engine changed
- Section 7 of `specs/liquid-template-compat/13-classify-content-diffs.md`, only when the engine changed
- This spec's `**Status:**` line and a spec 22 bullet in `specs/ORDER.md`

Do not edit any `*.liquid` file, samples, expected fixtures, `compare.js`, or the classifier's status and same-instant rules. Do not add a dependency. Do not make `now` return one of those 2022 instants. Do not special-case these filenames or Provenance ids.

## 4. Requirements

1. Record the actual and expected `text.div` for Provenance `2f0f2d7d-7f93-e624-fa21-11d1c490897f` before changing code.
2. If the narratives match except for the `generated on <instant>` text, and the five expected instants are not one shared value, stop. Set status to Blocked with those five expected instants and a description of the actual instant. Do not change engine code.
3. If some other engine behavior selects the wrong narrative, change that behavior. Do not hard-code these div strings, these ids, or these filenames.
4. Re-run the classifier only when the engine changed.
5. Stop and do not merge an engine change if any of these become true:
   - You cannot name the value that selects the actual div.
   - Any of the 5 cases still lists `text.div` as a Provenance path in `contentDelta.fields`.
   - Any case that was `pass` at `cbe0459` becomes `count` or `content`.
   - Any case gains a non-empty `byType` count delta.
   - `summary.pass` drops below 117 or `summary.count` is not 0.

A blocked result does not merge an engine change. It does merge the spec status and the `specs/ORDER.md` bullet.

## 5. Validation

When the engine changed:

```sh
npx mocha --no-package --no-config <the new unit test> --exit --timeout 10000
node test/e2e-test/liquid-regression/classify-diffs.mjs
node scripts/test-summary.mjs
```

When blocked, do not run the full suite. `git diff --check` must pass. Use `--no-package --no-config` for a single mocha file.

## 6. Acceptance criteria

Either:

- None of the 5 cases lists Provenance `text.div` in `contentDelta.fields`.
- `summary.pass` is at least 117 and `summary.count` is 0.
- No previously passing case regressed.
- No Liquid template, sample, or expected fixture was modified.
- Status and `specs/ORDER.md` say Done with the date, the actual-versus-expected div difference, and the new pass/count/content totals.

Or:

- Status and `specs/ORDER.md` say Blocked with the date, the actual div pattern, and the five expected instants.
- No engine file, template, sample, or expected fixture was modified.
