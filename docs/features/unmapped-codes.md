# Unmapped codes

[Features](../features.md)

After a successful conversion of a local project, Diagnostics lists Codings the project's [site pack](site-pack.md) did not rewrite. The list is computed from the FHIR resource before the pack is applied, so a code that the pack then rewrites is not listed, and a code it leaves alone is.

A Coding is a plain object with a string `system` and a string `code` and no `resourceType`. Each row is `system`, `code`, and the path of that object in the resource, such as `entry.0.resource.gender`. Identifiers are not listed here. They are filled by `identifiers.json`, not by a ConceptMap.

The Diagnostics heading is **Unmapped Codes (N)**. A row shows `system | code` and the path. An empty array shows **No unmapped codes**.

Canonical standard FHIR and HL7 code systems are excluded from the unmapped queue automatically:

- `http://hl7.org/fhir/*` and `http://terminology.hl7.org/*`
- LOINC (`http://loinc.org`)
- SNOMED CT (`http://snomed.info/sct`)
- UCUM (`http://unitsofmeasure.org`)
- BCP-47 (`urn:ietf:bcp:47`)
- ISO-3166 (`urn:iso:std:iso:3166`)

If a project `ConceptMap` explicitly declares one of those standard systems as `group.source`, codes in that system are checked against the map and any unmatched codes are included in the queue. Local and custom hospital systems are always checked; with no ConceptMaps, every non-standard Coding in the result is listed as unmapped.

The array is returned beside the resource on `POST /api/v1/projects/convert` and `POST /api/v1/projects/:projectId/convert/:template`. It is not added as a property of the FHIR resource, so Send and Validate do not post it. A GitHub project does not apply a site pack and does not return the list. A missing `unmapped` property leaves the Diagnostics section out. Built-in conversion does not return it either.

The panel shows the list from the latest project conversion only.
