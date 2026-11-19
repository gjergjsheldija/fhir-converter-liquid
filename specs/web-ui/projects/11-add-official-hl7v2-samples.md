# Spec 11: Add the official HL7 v2 samples to a local project

**Status:** Done (2026-11-18). Implemented in `src/lib/projects/officialSamples.js`, `POST /api/v1/projects/official-samples`, and `#project-add-samples`.

## 1. Goal

A local HL7 v2 project can copy the 139 official Microsoft `v7.0` sample messages (either all 139, or filtered to a chosen message type prefix such as `ADT` / `ORU`? Keep the API supporting optional `prefix` filter while defaulting to all 139!) into its `samples/hl7v2/` folder. Expected JSON is never copied. Create project does not run it automatically.

## 2. Current behavior

- Official messages are the `139` `*.hl7` files directly inside `test/e2e-test/liquid-fixtures/SampleData/Hl7v2/` at pinned commit `253307fe6063a42b024ef7dbeb6aae157f1c2f61`.
- Baseline projects from Spec 03 start with `4` samples; empty projects from Spec 02 start with `example.hl7`.
- `.file-browser-title` holds `#project-label`, `#project-use-builtin`, and `#file-browser-collapse`.

## 3. Files you may edit

- `src/lib/projects/officialSamples.js` (new)
- `src/lib/projects/officialSamples.spec.js` (new)
- `src/routes.js`
- `src/routes.spec.js`
- `src/static/js/projects.js`
- `src/static/index.html`
- `src/static/css/template-editor.css`

Do not modify `test/e2e-test/liquid-fixtures/**`, `src/sample-data/**`, or `src/templates/**`.

## 4. API (`POST /api/v1/projects/official-samples`)

Request JSON: `{ "path": "/absolute/project" }`.

1. Require an existing absolute local directory (same `400` / `404` checks as Spec 02) and a valid `fhir-converter.json` whose `families` includes `"hl7v2"` (otherwise `400 Official samples are HL7 v2 messages.`).
2. Verify realpath containment for `<project>/<roots.hl7v2.samples>`.
3. Read every `*.hl7` file directly inside `test/e2e-test/liquid-fixtures/SampleData/Hl7v2/` (if missing or `0` `.hl7` files, return `500 Official HL7 v2 samples are not installed on this server.`).
4. Copy each `.hl7` file into `<project>/<roots.hl7v2.samples>/`:
   - Overwrite an existing destination file only when bytes differ (`copied++`); count identical files in `unchanged++`.
   - Keep any non-official files already in the project's samples folder (such as `example.hl7` or custom user samples) and return their sorted filenames in `kept`.
5. Response `200`:
   ```json
   {
     "copied": 139,
     "unchanged": 0,
     "kept": ["example.hl7"]
   }
   ```

## 5. Page

Inside `#file-browser` (directly below `.file-browser-title` so `.file-browser-title` and `#file-browser-collapse` never wrap or clip!), show a compact action button `Add official samples (139)` (`id="project-add-samples"`, `btn btn-sm`, styled with `--surface`, `--text`, `--border`, `--hover`) **only** when `fhirConverterProject.kind === "local"` and `manifest.families.includes("hl7v2")`. Hide it for GitHub, Built-in, and C-CDA-only projects.

Clicking asks `window.confirm('Copy the 139 official HL7 v2 samples into this project? Existing official files are updated if changed; your custom samples are kept.')`, posts `POST /api/v1/projects/official-samples`, reloads the project file list, and sets `#conversion-status` to `Added N official samples.` (or `Official samples already match.` when `copied === 0`). Keep the currently open message in `dataEditor` unchanged until the user clicks a sample row.

## 6. Tests

In `src/lib/projects/officialSamples.spec.js` and `src/routes.spec.js`:

- Unit test with a temp 2-file fixture source dir + temp project containing `example.hl7`: first call returns `{ copied: 2, unchanged: 0, kept: ["example.hl7"] }`; second call returns `{ copied: 0, unchanged: 2, kept: ["example.hl7"] }`.
- C-CDA-only project returns `400 Official samples are HL7 v2 messages.`
- Route test against the real fixture path into a temp project asserts `copied + unchanged === 139` and confirms the fixture directory still has `139` untouched files.

Then run `npm test` and `npm run eslint`.

## 7. Acceptance criteria

- Copies all 139 official `.hl7` fixture messages into the open local HL7 v2 project without copying expected JSON or deleting custom project samples.
- Preserves `#file-browser-collapse` layout and leaves the fixture and bundled directories untouched.
