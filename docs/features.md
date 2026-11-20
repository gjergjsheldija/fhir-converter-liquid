# Features

The editor at `http://localhost:2019` authors Liquid maps for HL7 v2 and C-CDA, converts them to FHIR R4, and can check or send the result. Built-in mode is HL7 v2. C-CDA runs inside a project.

## C-CDA projects

**New project** asks for a family and a starting point.

![New project with C-CDA and the Microsoft baseline selected](images/ccda-new-project.png)

| Choice | What you get |
| --- | --- |
| HL7 v2, Microsoft baseline | The pinned v7.0 HL7 v2 template pack and four sample messages |
| HL7 v2, empty example | One synthetic ADT message and one Patient template |
| C-CDA, Microsoft baseline | The pinned v7.0 C-CDA template pack and one sample document. The project opens `templates/Ccda/CCD.liquid` |
| C-CDA, empty example | One synthetic C-CDA document and `templates/Ccda/Example.liquid` |

The baseline pin is Microsoft FHIR Converter `v7.0`, commit `253307fe6063a42b024ef7dbeb6aae157f1c2f61`. The sample document is synthetic. This repository does not ship an official C-CDA expected-output corpus.

Open the project and the message editor uses XML coloring, conversion uses the C-CDA parser, and the debug drawer label becomes **Parsed CDA**. **Built-in** returns to HL7 v2. A project whose manifest lists both families shows a **Project family** control and loads that family's files.

![A C-CDA project: XML message, Liquid template, FHIR bundle, and the Parsed CDA tree](images/ccda-workspace.png)

In a template the document is `msg`:

| In the document | In Liquid |
| --- | --- |
| Attribute `id root="1.2.3"` | `msg.ClinicalDocument.id.root` |
| Text of `<title>` | `msg.ClinicalDocument.title._` |
| Prefixed element `sdtc:raceCode` | `msg.ClinicalDocument...sdtc_raceCode` |
| Repeated child | An array. The second `given` is `given[1]` |

**Copy path** on a Parsed CDA row copies that Liquid path.

Hover a tag, attribute, or text node in the message. The tooltip shows the same path and the value.

![Hover on a C-CDA attribute shows the Liquid path and the value](images/ccda-hover.png)

Put a FHIR bundle beside a sample to compare them. For `samples/ccda/example.xml` the file is `tests/expected/example.json`. For an HL7 sample `ADT04-23.hl7` it is `tests/expected/ADT04-23.json`. After conversion the drawer adds **Expected diff** and counts added, removed, and changed resources. A resource matches another by type and id, so a different id counts as one added and one removed.

![Expected diff reports one changed Patient](images/ccda-expected-diff.png)

`POST /api/v1/convert/ccda` converts a document with an inline template. `POST /api/v1/projects/convert` uses the open project. A project whose only family is `ccda` converts as C-CDA. Any other project converts as HL7 v2. A missing partial is read from the built-in template tree. A file in the project wins.

## Validate

**Validate**, next to **Send** on the FHIR result, posts that resource to `{base}/$validate`. Set the base URL under **Settings → FHIR server**. Convert does not call the FHIR server.

A success, or an OperationOutcome from the server, opens the **Validation** tab and lists the issues. A server that cannot be reached shows the request error there.

![Validate reports that the FHIR server could not be reached](images/fhir-validate.png)

```bash
curl -X POST http://localhost:2019/api/v1/fhir/validate \
  -H "Content-Type: application/json" \
  -d '{"baseUrl":"http://127.0.0.1:8080/fhir","resource":{"resourceType":"Patient","id":"example"}}'
```

The same `baseUrl` accepts `Authorization` bearer or basic username and password fields, matching **Send**.

## Conditional send

**Settings → FHIR server → Match existing resources by identifier** is off until you turn it on. It is stored in this browser as `fhirConditional`.

![The FHIR server settings, with match-by-identifier turned on](images/fhir-conditional-send.png)

With it off, **Send** posts the result as converted. With it on, a `batch` or `collection` Bundle is sent as one `transaction`. Each entry that has an identifier with a system and a value is a conditional create: `POST` to the resource type, with `If-None-Exist` set to `identifier={system}|{value}`. Other resources are posted unchanged. The editor still makes one request.

```bash
curl -X POST http://localhost:2019/api/v1/fhir/send \
  -H "Content-Type: application/json" \
  -d '{"baseUrl":"http://127.0.0.1:8080/fhir","conditional":true,"resource":{"resourceType":"Bundle","type":"batch","entry":[]}}'
```

## Site pack

A local project can rewrite the FHIR result after conversion. GitHub projects do not apply a site pack.

| File | Effect |
| --- | --- |
| `conceptmaps/*.json` | FHIR ConceptMap files, read only in that folder. A Coding whose `system` and `code` match a group is rewritten to `group.target` and the first `element.target` code. A string `display` is copied too |
| `identifiers.json` | Map of identifier type code to a system URI. An Identifier that has a `value` and no `system` receives the system for its `type.coding[].code` |

A missing directory or file is an empty pack. Invalid JSON, or a JSON value that is not an object, fails the conversion with status 400. The pack is also applied by the project CLI.

## Project CLI

`npm run convert:project` runs one conversion against a local project and prints the FHIR JSON. The project path must be absolute. The template name may omit `.liquid`.

```bash
npm run convert:project -- \
  --project /absolute/path/to/project \
  --message /absolute/path/to/message.hl7 \
  --template ADT_A01
```

`--check-goldens` walks `tests/expected/*.json` in sorted order. Each file is compared with `<samples>/<basename>.hl7`, using `--template` or the manifest startup template. The comparison is the same one the official HL7 suite uses. An empty expected directory exits 0. The first mismatch prints that basename on stderr and exits 1.

```bash
npm run convert:project -- \
  --project /absolute/path/to/project \
  --check-goldens
```

## Open Integration Engine

`integrations/oie/hl7v2-to-fhir.xml` is an OIE channel. OIE receives HL7 v2 on its TCP listener and posts `{"srcData","template"}` to `http://127.0.0.1:2019/api/v1/convert/hl7v2`. This server does not listen for MLLP. The channel ACK puts the inbound MSH-10 in MSA-2. Setup and the sample ACK are in [integrations/oie/README.md](../integrations/oie/README.md).
