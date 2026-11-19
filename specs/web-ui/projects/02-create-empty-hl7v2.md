# Spec 02: Create an empty HL7 v2 project

**Status:** Done (2026-11-18). Implemented in `src/lib/projects/createProject.js` and `POST /api/v1/projects`.

## 1. Goal

`POST /api/v1/projects` creates a directory that contains an empty HL7 v2 project: a manifest, one synthetic message, and one root template that converts that message.

## 2. Current behavior

`src/routes.js` has no `/api/v1/projects` route. `PUT /api/v1/templates/:file` writes into the bundled template cache and into `BASE_TEMPLATE_FILES_LOCATION`. That route stays as it is.

Spec 01 provides `emptyHl7v2Manifest`, `writeManifest`, and `validateManifest`.

The Liquid context for HL7 v2 is `hl7v2Data`. Field access uses `Segment.Field.Component.Value`. `PID.5.1.Value` is PID-5 component 1. `get_first_segments` is a registered filter.

## 3. Files you may edit

- `src/lib/projects/createProject.js` (new)
- `src/lib/projects/createProject.spec.js` (new)
- `src/routes.js`
- `src/routes.spec.js`

## 4. Request

`POST /api/v1/projects` with JSON:

```json
{
  "name": "Adt rules",
  "parentPath": "/absolute/path",
  "family": "hl7v2",
  "startingPoint": "empty"
}
```

This spec implements `family` `hl7v2` and `startingPoint` `empty` only. Any other `family` or `startingPoint` returns 400 and the sentence `This server cannot create that project yet.` Do not create a directory in that case.

`parentPath` is required, absolute, and an existing directory. A relative path returns 400 `Enter an absolute folder path.` A missing directory returns 404 `Folder not found.`

The directory name is the slug of `name`: trim, lowercase, turn each run of spaces into one `-`, drop every character outside `a-z`, `0-9`, `.`, `_`, and `-`, trim `-` from the ends, cut at 80 characters. An empty slug returns 400 `Use a name with letters or numbers.`

The project path is `path.join(parentPath, slug)`. When that path exists, return 400 `A folder with that name already exists.` Do not delete or merge.

Refuse the create when the resolved project path is inside `BASE_TEMPLATE_FILES_LOCATION`, `TEMPLATE_FILES_LOCATION`, or `SAMPLE_DATA_LOCATION` from `src/lib/constants/constants.js`. Compare resolved real paths. Return 400 `Choose a folder outside this server's templates and samples.`

## 5. Files written

On success, the project directory contains only:

- `fhir-converter.json` from `emptyHl7v2Manifest(name.trim())`.
- `samples/hl7v2/example.hl7`, exactly these four lines, LF endings, no extra blank line at the end of the last line beyond the final newline after `PV1`:

```
MSH|^~\&|IDE|CLINIC|FHIR|SANDBOX|20200101120000||ADT^A04|MSG00001|P|2.5
EVN|A04|20200101120000
PID|1||12345^^^CLINIC^MR||DOE^JANE||19800101|F
PV1|1|O
```

- `templates/Hl7v2/Example.liquid`, exactly:

```liquid
{% assign firstSegments = hl7v2Data | get_first_segments: 'PID|MSH' -%}
{
    "resourceType": "Bundle",
    "type": "batch",
    "entry": [
        {
            "resource": {
                "resourceType": "Patient",
                "name": [
                    {
                        "family": "{{ firstSegments.PID.5.1.Value }}",
                        "given": ["{{ firstSegments.PID.5.2.Value }}"]
                    }
                ]
            }
        }
    ]
}
```

The sample and the template are labeled synthetic by the fixed sending application `IDE`. Do not copy a file from `src/sample-data` or `src/templates`.

Response 201 JSON:

```json
{
  "path": "/absolute/path/adt-rules",
  "manifest": {}
}
```

`path` is the resolved project path. `manifest` is the object that was written.

A failure while writing removes the project directory that this request created. Do not remove `parentPath`.

## 6. Tests

`createProject.spec.js` calls the library function the route uses. Cover the slug, the existing-directory refusal, the non-absolute path, and a successful create under `os.tmpdir()`. Assert the three relative paths exist and the manifest validates.

In `routes.spec.js`, add one test that posts `startingPoint: "baseline"` and expects 400 with `This server cannot create that project yet.` Add one test that posts a relative `parentPath` and expects 400. Do not point a test at the repo's `src/templates` directory.

Then run `npm test` and `npm run eslint`.

## 7. Acceptance criteria

- An empty HL7 v2 project is three files, and the manifest startup paths point at them.
- The bundled template and sample trees are unchanged.
- Other family and starting-point values do not create a directory.
