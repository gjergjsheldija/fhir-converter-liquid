# Spec 04: Create an empty C-CDA project

**Status:** Done (2026-11-18). Empty C-CDA starter and baseline refusal implemented in `createProject.js`.

## 1. Goal

`POST /api/v1/projects` can create an empty C-CDA project. The page can hold C-CDA templates and a sample document. Conversion stays HL7 v2 only. A request for a C-CDA baseline pack is refused, because this repo does not vendor a Ccda template tree.

## 2. Current behavior

`dataHandlerFactory` maps `hl7v2` and `dummy`. `convertInlineHl7v2` rejects any other data type with `Data type '…' is not supported. This converter only supports HL7v2.`

Spec 02 returns 400 `This server cannot create that project yet.` for `family: "ccda"`.

`emptyCcdaManifest` from spec 01 uses startup sample `samples/ccda/example.xml` and startup template `templates/Ccda/Example.liquid`.

## 3. Files you may edit

- `src/lib/projects/createProject.js`
- `src/lib/projects/createProject.spec.js`
- `src/routes.spec.js`

## 4. Request

`family: "ccda"` and `startingPoint: "empty"` uses the same path, slug, and refusal rules as spec 02.

Write:

- `fhir-converter.json` from `emptyCcdaManifest(name.trim())`.
- `samples/ccda/example.xml`, UTF-8, exactly this document:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3">
  <typeId root="2.16.840.1.113883.1.3" extension="POCD_HD000040"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.2"/>
  <id root="2.16.840.1.113883.19.5.99999.1" extension="IDE-CCD-1"/>
  <code code="34133-9" codeSystem="2.16.840.1.113883.6.1" displayName="Summarization of Episode Note"/>
  <title>Synthetic continuity of care document</title>
  <recordTarget>
    <patientRole>
      <id extension="12345" root="2.16.840.1.113883.19.5"/>
      <patient>
        <name>
          <given>Jane</given>
          <family>Doe</family>
        </name>
      </patient>
    </patientRole>
  </recordTarget>
  <component>
    <structuredBody>
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.5.1"/>
          <code code="11450-4" codeSystem="2.16.840.1.113883.6.1" displayName="Problem list"/>
          <title>Problems</title>
          <text>Synthetic problem list. No real patient.</text>
        </section>
      </component>
    </structuredBody>
  </component>
</ClinicalDocument>
```

- `templates/Ccda/Example.liquid`, exactly these lines:

```liquid
{% comment %}
Empty C-CDA starter. This server does not convert C-CDA yet.
The document title in the sample is "Synthetic continuity of care document".
{% endcomment %}
```

`family: "ccda"` and `startingPoint: "baseline"` returns 400 `C-CDA baseline is not installed on this server. Create an empty C-CDA project.` Do not create a directory. Do not invent Microsoft Ccda templates.

Do not add a parser, a convert branch, or a sample XML library.

## 5. Tests

- Empty C-CDA create writes the three relative paths, and `validateManifest` accepts the file.
- The XML file contains `IDE-CCD-1` and does not contain a real person's name other than the synthetic `Jane` and `Doe` in section 4.
- Baseline C-CDA returns the sentence in section 4 and leaves the parent directory without a new child.
- Empty HL7 v2 and baseline HL7 v2 from specs 02 and 03 still pass.

Then run `npm test` and `npm run eslint`.

## 6. Acceptance criteria

- An empty C-CDA project is a manifest, one XML document, and one Liquid comment.
- No C-CDA convert route is added.
- HL7 v2 create is unchanged.
