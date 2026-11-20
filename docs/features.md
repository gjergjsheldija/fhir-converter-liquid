# Features

The editor at `http://localhost:2019` authors Liquid maps for HL7 v2 and C-CDA, converts them to FHIR R4, and can check or send the result. Built-in mode is HL7 v2. C-CDA runs inside a project.

Each feature has its own page.

| Feature | What it does |
| --- | --- |
| [C-CDA projects](features/ccda-projects.md) | Start from the Microsoft C-CDA pack or an empty example, and read the document as `msg` |
| [Validate](features/validate.md) | Post the FHIR result to `{base}/$validate`, with an optional profile URL |
| [Conditional send](features/conditional-send.md) | Create a resource only if its identifier is new, or update the resource that already has that identifier |
| [IG coverage](features/ig-coverage.md) | Compare the generated field map with an Implementation Guide ConceptMap in the browser |
| [Unmapped codes](features/unmapped-codes.md) | List Codings a local project's site pack did not rewrite |
| [Result lineage](features/result-lineage.md) | Click a value in the FHIR result and see which include wrote it |
| [Declared segments](features/declared-segments.md) | Name the HL7 v2 segments a project accepts, and report the rest while debugging |
| [Failure log](features/failure-log.md) | Keep the time, template, error, and MSH-10 of a failed conversion, not the message |
| [Convert API key](features/convert-api-key.md) | Require a Bearer token on convert, and write an audit line for each attempt |
| [Site pack](features/site-pack.md) | Rewrite codes and fill identifier systems after conversion |
| [Project CLI](features/project-cli.md) | Convert one message, or check a project's expected bundles |
| [Open Integration Engine](features/oie.md) | Receive HL7 v2 in OIE and post it to this API |
