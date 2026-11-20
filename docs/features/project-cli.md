# Project CLI

[Features](../features.md)

`npm run convert:project` converts HL7 v2 with a local project's templates and prints the FHIR JSON. It uses the same project loader as the editor: the manifest, the project templates, the built-in fallback for a missing partial, and the [site pack](site-pack.md).

The project path must be absolute. The template name may omit `.liquid`. A name that would leave the template directory is rejected.

```bash
npm run convert:project -- \
  --project /absolute/path/to/project \
  --message /absolute/path/to/message.hl7 \
  --template ADT_A01
```

The FHIR resource is pretty-printed on stdout. Errors go to stderr and the process exits 1. The command does not start the HTTP server, does not read `CONVERT_API_KEY`, and does not write the [failure log](failure-log.md) or the audit file.

Debug is off, so the output has no lineage and no undeclared-segment list. The [site pack](site-pack.md) is applied. Unmapped codes are not printed.

## Expected bundles

`--check-goldens` walks `tests/expected/*.json` in sorted order. For `tests/expected/ADT04-23.json` the message is `<samples>/ADT04-23.hl7`, where `<samples>` is the HL7 v2 samples root in the project manifest. The template is `--template` when you pass one, otherwise the manifest startup template.

```bash
npm run convert:project -- \
  --project /absolute/path/to/project \
  --check-goldens
```

Each pair is compared with the same comparison the official HL7 suite uses. An empty expected directory, or a missing expected directory, exits 0. The first mismatch prints that basename on stderr and exits 1. Later files are not checked. A relative project path prints the usage line and exits 1.
