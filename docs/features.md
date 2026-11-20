# Features

The editor at `http://localhost:2019` authors Liquid maps for HL7 v2 and C-CDA, converts them to FHIR R4, and can check or send the result. Built-in mode is HL7 v2 (accepting `\r\n`, `\n`, and bare `\r` MLLP terminators plus `MSH-18` character sets `8859/1`, `ISO-8859-15`, `WINDOWS-1252`, and `UTF-8`). C-CDA runs inside a project. Generated Bundles emit clean `FHIR Converter Liquid` Provenance narratives with no `TEMPLATE_VERSION_PLACEHOLDER` tokens or upstream tarball URLs.

Each feature has its own page.

| Feature | What it does |
| --- | --- |
| [C-CDA projects](features/ccda-projects.md) | Start from the Microsoft C-CDA pack or an empty example, and read the document as `msg` |
| [Validate](features/validate.md) | Post the FHIR result to `{base}/$validate`, with an optional profile URL |
| [Conditional send](features/conditional-send.md) | Rewrite Bundles into `urn:uuid:` transactions for conditional create (`If-None-Exist`) or conditional update (`PUT`) with intact internal references |
| [IG coverage](features/ig-coverage.md) | Compare the generated field map with an Implementation Guide ConceptMap in the browser |
| [Unmapped codes](features/unmapped-codes.md) | List local non-standard Codings a project's site pack did not rewrite |
| [Result lineage](features/result-lineage.md) | Click a value in the FHIR result to see the include and HL7 field that wrote it, and spot case-mismatched Liquid variables in Debug |
| [Declared segments](features/declared-segments.md) | Name the HL7 v2 segments a project accepts, and report the rest while debugging |
| [Failure log](features/failure-log.md) | Append timestamp, template, error, and PHI-free `MSH-10` asynchronously with automatic `5 MB` `.1` rotation |
| [Convert API key](features/convert-api-key.md) | Protect convert and studio routes with `CONVERT_API_KEY`, lock down deployments with `HEADLESS_RUNTIME=true`, and convert via `POST /api/v1/projects/:projectId/convert/:template` |
| [Site pack](features/site-pack.md) | Rewrite codes (with optional `"preserveSource": true`) and resolve multi-facility HIE Assigning Authority identifier systems |
| [Project CLI](features/project-cli.md) | Convert HL7 v2 or C-CDA messages (`bin/convert.mjs`) or check a project's expected golden bundles |
| [Open Integration Engine](features/oie.md) | Route MLLP HL7 v2 dynamically from `MSH-9`, forward `CONVERT_API_KEY`, and return `MSA|AA` or `MSA|AE` ACKs |
