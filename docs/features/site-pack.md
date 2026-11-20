# Site pack

[Features](../features.md)

A local project can rewrite the FHIR result after conversion. The pack is applied by `POST /api/v1/projects/convert` and by the [project CLI](project-cli.md). GitHub projects do not load a pack. Built-in conversion does not either.

The pack is two optional locations at the project root. A missing directory or file is an empty pack. The conversion still succeeds.

| File | Effect |
| --- | --- |
| `conceptmaps/*.json` | FHIR ConceptMap files, read only in that folder. Nested directories are ignored. Names are applied in sorted order |
| `identifiers.json` | Map of identifier type code to a system URI |

Invalid JSON, or a JSON value that is not an object, fails the conversion with status 400. The message names the file.

## Codes

A Coding is a plain object with a string `system` and a string `code` and no `resourceType`. The pack walks the resource after conversion. For each Coding it looks through the ConceptMaps in order. A group matches when `group.source` equals `Coding.system`. An element matches when `element.code` equals `Coding.code`. The first element target must be an object with a string `code`, and the group must have a string `target`.

The Coding is then copied with:

| Property | New value |
| --- | --- |
| `system` | `group.target` |
| `code` | the first `element.target.code` |
| `display` | the first target's `display`, only when that display is a string |

A later ConceptMap is not consulted after one match. A Coding that matches nothing is left as produced by the template. Those leftovers are what [Unmapped codes](unmapped-codes.md) lists. The list is taken from the resource before this rewrite.

## Identifier systems

`identifiers.json` is an object whose keys are identifier type codes and whose values are system URIs:

```json
{"MR":"http://hospital.example/identifier/mrn"}
```

An Identifier is updated when it has a string `value`, it has no `system` property, and it has no `resourceType`. The pack reads `type.coding[].code` and uses the first code that is a key in the file with a string value. That string becomes `Identifier.system`. An Identifier that already has a `system` is not changed. This pass does not add rows to the unmapped-code list.

Both rewrites return a new resource. The template output is not edited in place.
