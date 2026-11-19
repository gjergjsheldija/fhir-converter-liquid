# Spec 01: Convert a C-CDA document

**Status:** Done (2026-11-19) — the sample document converts to a Bundle through the synced `CCD.liquid`; focused tests pass and `node scripts/test-summary.mjs` shows 0 unexpected failures with the official HL7 v2 classification at 132/0/0. Follow `.agents/skills/fhir-template-compat/SKILL.md`, `.agents/skills/spec-runner/SKILL.md`, `.agents/skills/test-baseline/SKILL.md`, `.agents/skills/spec-handoff/SKILL.md`, and `AGENTS.md`. `origin/main` is `bddba7e`. The user authorized this Ccda template sync. Do not implement specs 02 or 03 in this change.

## 1. Goal

An empty C-CDA project can convert a document with the synced `CCD.liquid`. The Liquid variable is `msg`, and `msg.ClinicalDocument` follows Microsoft's `CcdaDataParser` at the pinned commit `253307fe6063a42b024ef7dbeb6aae157f1c2f61`. HL7 v2 conversion stays as it is.

## 2. Current behavior

- `scripts/sync-upstream-assets.js` syncs only `data/Templates/Hl7v2` into `src/templates/Hl7v2`. There is no `src/templates/Ccda/`.
- `src/init-service.js` copies `src/templates/` to `src/service-templates/` before tests. `HL7V2_LIQUID_TEMPLATE_LOCATION` points at `src/service-templates/Hl7v2`.
- `dataHandlerFactory` registers `hl7v2` and `dummy` only.
- `convertInlineHl7v2` in `src/lib/workers/worker.js` renders only when `dataType === "hl7v2"`. Otherwise it rejects with "This converter only supports HL7v2." The render context is `{ msg: parsedData, hl7v2Data: parsedData.v2 }`.
- `prepareProjectConversion` rejects a project whose families do not include `hl7v2`.
- Upstream `CCD.liquid` reads `msg.ClinicalDocument.recordTarget.patientRole`. `CcdaDataParser` parses XML with `XDocument`, drops prefixed xmlns declarations whose URI equals the default namespace, renames a prefixed element to `prefix_localName`, replaces each text node with a child element named `_`, and serializes with Newtonsoft `SerializeXNode`. `DictionaryJsonConverter` then removes a leading `@` from every property name, so an attribute `root` is the key `root` and text stays on the key `_`. One child stays an object. Repeated names become an array. `_originalData` is the input with newlines removed.
- `StringFilters.ToJsonString` returns null for null and otherwise `JsonConvert.SerializeObject` with no extra whitespace. `CCD.liquid` line 26 calls `to_json_string`. This repo does not register that filter. The pinned filter sources are in the Microsoft tree at `src/Microsoft.Health.Fhir.Liquid.Converter/Filters/`.

If `src/templates/Ccda/CCD.liquid` already exists, stop and report the mismatch.

## 3. Files you may edit

- `scripts/sync-upstream-assets.js` and the Makefile target that runs the new asset
- `src/templates/Ccda/**` only as the output of that sync
- `src/lib/constants/constants.js` for the Ccda template directory
- `src/lib/parsers/ccda/ccda.js` and `src/lib/parsers/ccda/ccda.spec.js` (create both)
- `src/lib/liquid-converter/filters/toJsonString.js`, `src/lib/liquid-converter/filters/toJsonString.spec.js`, and the filter list in `src/lib/liquid-converter/liquid-helpers.js`
- A missing filter that `CCD.liquid` actually throws, only when that filter exists under the pinned `Filters/` directory. One new filter file per missing name.
- `src/lib/dataHandler/dataHandlerFactory.js`
- `src/lib/workers/worker.js` so `ccda` uses the existing render path
- `src/lib/projects/convertProject.js` and `src/lib/projects/convertProject.spec.js` for a ccda-only local project
- `.agents/skills/fhir-template-compat/PROJECT_CONTEXT.md` with the sync pin and the new behavior
- This spec's `**Status:**` line, the row in `specs/ccda/00-order.md`, and a bullet in `specs/ORDER.md`

Do not hand-edit any `*.liquid` or `*.json` template. Do not sync Hl7v2 templates, expected results, or samples. Do not edit `src/static/**`. Do not add a dependency. `xml2js` is already available.

## 4. Requirements

1. Add a `ccda-templates` asset whose upstream path is `data/Templates/Ccda` and whose only destination is `src/templates/Ccda`. Copy every file in that tree. Run the sync. `src/templates/Hl7v2/**` must be byte-identical afterwards. Do not commit `src/service-templates/`.
2. `parseCcda(document)` returns the object model from section 2. Whitespace-only input throws. This document:

```xml
<ClinicalDocument xmlns="urn:hl7-org:v3" xmlns:sdtc="urn:hl7-org:sdtc">
  <id root="1.2.3"/>
  <title>Hello</title>
  <recordTarget>
    <patientRole>
      <patient>
        <name>
          <given>Adam</given>
          <given qualifier="CL">Frankie</given>
        </name>
        <sdtc:raceCode code="2106-3"/>
      </patient>
    </patientRole>
  </recordTarget>
</ClinicalDocument>
```

   parses so that `ClinicalDocument.id.root` is `1.2.3`, `ClinicalDocument.title._` is `Hello`, `given` is an array of `{_: "Adam"}` and `{qualifier: "CL", _: "Frankie"}`, and `sdtc_raceCode.code` is `2106-3`. `_originalData` contains no `\n` or `\r`. `xmlns` may be absent. Do not leave `@` on attribute keys. LiquidJS cannot parse `{{ id.@root }}`.
3. Register `to_json_string`. Null and undefined return null. Any other value returns `JSON.stringify` with no extra whitespace. `srcDataType: "ccda"` renders with `msg` set to that object. A template `{"id":"{{ msg.ClinicalDocument.id.root }}"}` and the document above returns `fhirResource.id` `1.2.3`. HL7 v2 still receives `hl7v2Data`. A `debug=true` C-CDA conversion does not call the HL7 segment serializer.
4. A local project whose only family is `ccda` converts with its `templates/Ccda` directory and falls back to the synced Ccda tree. A project that includes `hl7v2` keeps today's HL7 v2 behavior.
5. Read the synced `CCD.liquid` and convert the document above with `srcDataType: "ccda"` and the Ccda template directory. The result is a Bundle (`resourceType` `Bundle`). If the render throws `undefined filter: <name>` and that filter is a public method in the pinned `Filters/` directory, implement that method and retry. If the error is not a missing pinned filter, or the same render still fails after those filters, stop and report the first remaining error. Do not edit the template and do not invent a filter.

## 5. Validation

```sh
npx mocha --no-package --no-config src/lib/parsers/ccda/ccda.spec.js src/lib/projects/convertProject.spec.js --exit --timeout 10000
node scripts/test-summary.mjs
```

The summary must show 0 unexpected failures. The official HL7 v2 classification stays 132 pass / 0 count / 0 content. ESLint and `git diff --check` must pass. If the sandbox reports concurrency 0, rerun `node scripts/test-summary.mjs` outside the sandbox.

## 6. Acceptance criteria

- `src/templates/Ccda/CCD.liquid` came from the sync of commit `253307fe6063a42b024ef7dbeb6aae157f1c2f61`.
- No file under `src/templates/Hl7v2/`, `src/sample-data/`, or `test/e2e-test/liquid-fixtures/` changed.
- The sample document converts to a Bundle through `CCD.liquid`.
- An HL7 v2 conversion still passes the official set.
- Status, `specs/ccda/00-order.md`, and `specs/ORDER.md` say Done with the date.

## 7. Git

Branch from current `main`: `feat/ccda-01-convert`. One commit, then a normal merge into `main` (no rebase, no amend). Push with `gh auth switch --user gjergjsheldija`, then `git push origin main`, then `gh auth switch --user gjergjsheldija-recare`. Do not force-push. Do not commit `docs/mappings/`, `opencode.json`, `relative_test.mjs`, `scripts/omlx-swap.mjs`, or `src/service-templates/`. Do not update git config and do not skip hooks. Include `specs/ccda/00-order.md` and this spec file in the commit.
