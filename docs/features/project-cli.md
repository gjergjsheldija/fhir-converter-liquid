# Project CLI

[Features](../features.md)

`bin/convert.mjs` (`npm run convert:project`) converts **HL7 v2** and **C-CDA** inputs with a local project's templates and prints the FHIR JSON. It uses the same project loader as the editor: `fhir-converter.json`, the project templates, the built-in fallback for a missing partial, and the [site pack](site-pack.md).

The project path must be absolute. The template name may omit `.liquid`. A name that would leave the template directory is rejected.

```bash
# HL7 v2 project (.hl7)
npm run convert:project -- \
  --project /absolute/path/to/hl7-project \
  --message /absolute/path/to/message.hl7 \
  --template ADT_A01

# C-CDA project (.ccda or .xml)
node bin/convert.mjs \
  --project /absolute/path/to/ccda-project \
  --message /absolute/path/to/sample.ccda \
  --template CCD
```

The FHIR resource is pretty-printed on stdout. Errors go to stderr and the process exits 1. The command does not start the HTTP server, does not read `CONVERT_API_KEY`, and does not write the [failure log](failure-log.md) or the audit file.

Debug is off, so the output has no lineage and no undeclared-segment list. The [site pack](site-pack.md) is applied. Unmapped codes are not printed.

## HL7 v2 line endings and `MSH-18` character sets

HL7 v2 parsing accepts `\r\n`, `\n`, and bare `\r` MLLP segment terminators without pre-normalizing files.

When reading raw bytes, the parser inspects `MSH-18` and decodes the message with the declared character set before splitting segments:

| `MSH-18` values | Encoding used |
| --- | --- |
| `UTF-8`, `UNICODE UTF-8`, `ASCII`, or empty | UTF-8 |
| `8859/1`, `ISO-8859-1`, `LATIN1` | ISO-8859-1 (Latin-1) |
| `8859/15`, `ISO-8859-15`, `LATIN9` | ISO-8859-15 |
| `WINDOWS-1252`, `CP1252`, `WIN-1252` | Windows-1252 |

## Expected bundles

`--check-goldens` walks `tests/expected/*.json` in sorted order. For each `<name>.json`, it looks up the matching sample in the project's samples directory: `<name>.hl7` for HL7 v2 projects, or `<name>.ccda` / `<name>.xml` for C-CDA projects. The template is `--template` when you pass one, otherwise the manifest startup template.

```bash
npm run convert:project -- \
  --project /absolute/path/to/project \
  --check-goldens
```

Each pair is compared with the structural JSON comparison used by the test suite. An empty expected directory, or a missing expected directory, exits 0. The first mismatch prints that basename on stderr and exits 1. Later files are not checked. A relative project path prints the usage line and exits 1.
