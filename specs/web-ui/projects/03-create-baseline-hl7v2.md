# Spec 03: Create an HL7 v2 project from the baseline

**Status:** Done (2026-11-18). Baseline copy verified with SHA-256 checks in `createProject.spec.js`.

## 1. Goal

`POST /api/v1/projects` with `startingPoint: "baseline"` and `family: "hl7v2"` creates a project whose templates are a byte copy of the pinned HL7 v2 pack, plus four sample messages. The empty starter from spec 02 still works.

## 2. Current behavior

Spec 02 accepts only `startingPoint: "empty"`. `baseline` returns 400 `This server cannot create that project yet.`

`src/templates/Hl7v2/` is the vendored Microsoft v7.0 pack. `src/sample-data/hl7v2/ADT04-23.hl7` exists. These files are read-only inputs. `baselineHl7v2Manifest` from spec 01 sets the startup pair to `samples/hl7v2/ADT04-23.hl7` and `templates/Hl7v2/ADT_A04.liquid`, and records commit `253307fe6063a42b024ef7dbeb6aae157f1c2f61`.

## 3. Files you may edit

- `src/lib/projects/createProject.js`
- `src/lib/projects/createProject.spec.js`
- `src/routes.spec.js`

Do not edit files under `src/templates/`, `src/service-templates/`, or `src/sample-data/`.

## 4. Copy

Keep every check from spec 02: name, slug, absolute parent, existing directory, and the refusal to create inside the server trees.

When `family` is `hl7v2` and `startingPoint` is `baseline`:

1. Write `fhir-converter.json` from `baselineHl7v2Manifest(name.trim())`.
2. Copy `src/templates/Hl7v2/` onto `<project>/templates/Hl7v2/`. Copy file bytes. Do not format, skip, or rename. Preserve relative paths, including `CodeSystem/CodeSystem.json` and `ValueSet/` files.
3. Copy these four files from `src/sample-data/hl7v2/` into `<project>/samples/hl7v2/` under the same file names:
   - `ADT04-23.hl7`
   - `LAB-ORM-1.hl7`
   - `LAB-ORU-1.hl7`
   - `VXU.hl7`
4. If any source path is missing, delete the project directory this request created and return 500 `The HL7 v2 baseline is not installed on this server.`

Do not copy `src/sample-data/data/sample.yaml`. Do not copy expected JSON. Do not copy the 139 fixture messages. That is spec 10.

`startingPoint: "empty"` remains spec 02. `family: "ccda"` remains the spec 02 400 until spec 04.

## 5. Tests

Extend `createProject.spec.js`:

- A baseline create under `os.tmpdir()` writes `fhir-converter.json` whose `roots.hl7v2.baseline.commit` is `253307fe6063a42b024ef7dbeb6aae157f1c2f61`.
- `<project>/templates/Hl7v2/ADT_A04.liquid` has the same SHA-256 as `src/templates/Hl7v2/ADT_A04.liquid`.
- `<project>/samples/hl7v2/ADT04-23.hl7` has the same SHA-256 as `src/sample-data/hl7v2/ADT04-23.hl7`.
- The four sample names exist, and no other files exist directly inside `<project>/samples/hl7v2/`.
- After the copy, the SHA-256 of `src/templates/Hl7v2/ADT_A04.liquid` is unchanged.

In `routes.spec.js`, change the spec 02 test that expected 400 for `baseline`. Post a baseline create only if you can point `parentPath` at a temp directory from the route test. If the route test cannot do that without a new dependency, keep the route test on the library and leave one route test that a baseline body with a relative `parentPath` is still 400.

Then run `npm test` and `npm run eslint`.

## 6. Acceptance criteria

- Baseline create copies the whole `Hl7v2` template tree and exactly four samples.
- Empty create still writes `Example.liquid` and `example.hl7` and no baseline key.
- No vendored source file changes.
