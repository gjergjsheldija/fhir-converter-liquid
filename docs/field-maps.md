# HL7v2 field maps

Each supported HL7v2 message has one table. A row is a field the Liquid template reads, and the FHIR R4 element that field feeds. The same rows are also written as a FHIR ConceptMap, so a review copy and a computable copy stay together.

The shape follows the HL7 [v2-to-FHIR message ConceptMap](https://hl7.org/fhir/uv/v2mappings/ConceptMap-message-adt-a09-to-bundle.html): one table per message. That guide maps a segment to a resource and records cardinality and conditions. These tables map the field the template actually reads. Both sides of a condition are listed. A generated resource id is left out.

## Generate the files

In the editor at `http://localhost:2019`, open the files pane.

* **Generate maps** writes three files for every message template in the current folder.
* **Export map** downloads those same three files as `hl7v2-field-map.zip`.

Built-in templates are written to `docs/mappings/`. A local project, or a folder you listed, is written to a `mappings` folder next to those templates. GitHub projects are read on GitHub, so use Built-in or Folder for the map.

| File | What it is |
| --- | --- |
| `hl7v2-field-map.md` | One Markdown table per message |
| `hl7v2-field-map.html` | The same tables as a page you can open in a browser |
| `hl7v2-field-map.conceptmap.json` | A FHIR R4 Bundle of one ConceptMap per message |

Refresh them after a template change. From the repo root:

```sh
node scripts/hl7-fhir-map.mjs ADT_A47
```

## Sample: ADT A47

ADT A47 changes a patient identifier. The template reads the message header, the current identifier, and the prior identifier. `PID-3.1` is the current id. `MRG-1.1` is the id it replaces. Both land on a Linkage.

### Markdown

```text
## ADT A47

| Sort | HL7 field | FHIR element |
| --- | --- | --- |
| 2 | MSH-3.1 | MessageHeader.source.name |
| 5 | MSH-4 | MessageHeader.sender.reference |
| 15 | MSH-7 | Bundle.timestamp |
| 15 | MSH-7 | Provenance.occurredDateTime |
| 15 | MSH-7 | Provenance.recorded |
| 19 | MSH-9.2 | MessageHeader.eventCoding.code |
| 21 | MSH-10 | Bundle.identifier.value |
| 78 | PID-3.1 | Linkage.item.resource.identifier.value |
| 86 | MRG-1.1 | Linkage.item.resource.identifier.value |
```

This is an excerpt. The full A47 table has a row for every component the template reads. `MSH-7` is one HL7 field with three FHIR targets, so those rows share sort 15.

### HTML

```html
<h2>ADT_A47</h2>
<table>
  <thead>
    <tr><th>Sort</th><th>HL7 field</th><th>FHIR element</th></tr>
  </thead>
  <tbody>
    <tr><td>15</td><td>MSH-7</td><td>Bundle.timestamp</td></tr>
    <tr><td>15</td><td>MSH-7</td><td>Provenance.occurredDateTime</td></tr>
    <tr><td>78</td><td>PID-3.1</td><td>Linkage.item.resource.identifier.value</td></tr>
    <tr><td>86</td><td>MRG-1.1</td><td>Linkage.item.resource.identifier.value</td></tr>
  </tbody>
</table>
```

### ConceptMap

The JSON file is a Bundle of type `collection`. ADT A47 is the entry `message-adt-a47-to-bundle`. `MSH-7` is one element. `PID-3.1` is another.

```json
{
  "resourceType": "ConceptMap",
  "id": "message-adt-a47-to-bundle",
  "url": "urn:fhir-converter-liquid:ConceptMap:message-adt-a47-to-bundle",
  "title": "Message ADT_A47 to Bundle Map",
  "status": "draft",
  "group": [
    {
      "source": "urn:fhir-converter-liquid:CodeSystem/hl7v2-field",
      "target": "http://hl7.org/fhir/R4",
      "element": [
        {
          "code": "MSH-7",
          "display": "MSH-7",
          "target": [
            {
              "code": "Bundle.timestamp",
              "display": "Bundle.timestamp",
              "equivalence": "equivalent"
            },
            {
              "code": "Provenance.occurredDateTime",
              "display": "Provenance.occurredDateTime",
              "equivalence": "equivalent"
            },
            {
              "code": "Provenance.recorded",
              "display": "Provenance.recorded",
              "equivalence": "equivalent"
            }
          ]
        },
        {
          "code": "PID-3.1",
          "display": "PID-3.1",
          "target": [
            {
              "code": "Linkage.item.resource.identifier.value",
              "display": "Linkage.item.resource.identifier.value",
              "equivalence": "equivalent"
            }
          ]
        }
      ]
    }
  ]
}
```

`equivalence` is the FHIR R4 value. The HL7 guide's narrative says "is equivalent to" for the same relationship.
