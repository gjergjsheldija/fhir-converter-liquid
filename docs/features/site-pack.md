# Site pack

[Features](../features.md)

A local project can rewrite the FHIR result after conversion. The pack is applied by `POST /api/v1/projects/convert`, by `POST /api/v1/projects/:projectId/convert/:template`, and by the [project CLI](project-cli.md). GitHub projects do not load a pack. Built-in conversion does not either.

The pack is two optional locations at the project root. A missing directory or file is an empty pack. The conversion still succeeds.

| File | Effect |
| --- | --- |
| `conceptmaps/*.json` | FHIR ConceptMap files, read only in that folder. Nested directories are ignored. Names are applied in sorted order |
| `identifiers.json` | Identifier type and multi-facility Assigning Authority rules |

Invalid JSON, or a JSON value that is not an object, fails the conversion with status 400. The message names the file.

## Codes

A Coding is a plain object with a string `system` and a string `code` and no `resourceType`. The pack walks the resource after conversion. For each Coding it looks through the ConceptMaps in order. A group matches when `group.source` equals `Coding.system`. An element matches when `element.code` equals `Coding.code`. The first element target must be an object with a string `code`, and the group must have a string `target`.

The Coding is then copied with:

| Property | New value |
| --- | --- |
| `system` | `group.target` |
| `code` | the first `element.target.code` |
| `display` | the first target's `display`, only when that display is a string |

Set `"preserveSource": true` on a `ConceptMap` or on an entry in `ConceptMap.group[]` to keep the original local hospital `Coding` alongside the mapped LOINC or SNOMED target inside `CodeableConcept.coding[]`:

```json
{
  "resourceType": "ConceptMap",
  "preserveSource": true,
  "group": [
    {
      "source": "http://hosp-a.org/labs",
      "target": "http://loinc.org",
      "element": [
        {
          "code": "GLU_FAST",
          "target": [{ "code": "1558-6", "display": "Fasting glucose [Mass/volume] in Serum or Plasma" }]
        }
      ]
    }
  ]
}
```

When `"preserveSource": true` applies to a Coding inside `CodeableConcept.coding[]`, the original local Coding stays in `coding[]` and the mapped target Coding is appended right after it (unless an entry with the same `system` and `code` is already present). Without `preserveSource`, the source Coding is replaced.

A later ConceptMap is not consulted after one match. A Coding that matches nothing is left as produced by the template. Non-standard leftovers are what [Unmapped codes](unmapped-codes.md) lists.

## Identifier systems

`identifiers.json` maps identifier type codes (`Identifier.type.coding[].code`) and optional HL7 Assigning Authorities (`Identifier.assigner.display` or `Identifier.assigner.identifier.value`) to system URIs. Three forms can be mixed in the same file:

### Shorthand string

```json
{
  "MR": "http://clinic/mrn"
}
```

Fills `Identifier.system` when an Identifier has a non-empty string `value`, matches type code `MR`, and has no `system` yet. An existing `Identifier.system` is kept.

### Composite assigning authority key

```json
{
  "MR@HOSP_A": "https://hosp-a.org/mrn",
  "MR@HOSP_B": "https://hosp-b.org/mrn",
  "MR": "https://hie.example/mrn"
}
```

`<TYPE>@<ASSIGNER>` matches the identifier type code paired with its assigning authority (`HOSP_A`) before falling back to `<TYPE>`. A matching `@<ASSIGNER>` key sets `Identifier.system` to that facility's URI.

### Rule object

```json
{
  "MR": {
    "default": "https://hie.example/mrn",
    "byAssigner": {
      "HOSP_A": "https://hosp-a.org/mrn"
    },
    "bySystem": {
      "urn:oid:1.2.3": "https://hosp-a.org/mrn"
    },
    "override": true
  }
}
```

| Property | Effect |
| --- | --- |
| `bySystem` | Rewrites a matching source `Identifier.system` (such as a local OID `urn:oid:1.2.3`) to the target URI |
| `byAssigner` | Maps the assigning authority (`HOSP_A`) to a facility URI |
| `default` | Fallback URI when neither `bySystem` nor `byAssigner` matches |
| `override` | When `true`, `default` and `byAssigner` overwrite an existing `Identifier.system`. When `false` or omitted, `default` only fills a missing `system` |

Identifier rewrites do not add rows to the unmapped-code list. Both passes return a new resource; the template output is not edited in place.
