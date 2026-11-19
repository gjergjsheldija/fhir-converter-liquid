# Spec 10: Save templates and samples into the open project

**Status:** Done (2026-11-18). Implemented via `PUT /api/v1/projects/file` with realpath containment, template/sample routing, and read-only GitHub protection.

## 1. Goal

When a local project is open, `Save` (`Cmd/Ctrl-S`) writes the active template (including newly created includes from `usability/19`) into `<project>/<templatesRoot>/`, and `Save sample` / sample import (`usability/20`) writes into `<project>/<samplesRoot>/` — never touching `src/templates/`, `src/service-templates/`, `src/sample-data/`, or `src/service-samples/`. GitHub projects remain explicitly read-only with a clear message. Built-in mode stays unchanged.

## 2. Current behavior

- `saveTemplate` in `src/static/js/template-menu.js` PUTs to `/api/v1/templates/Hl7v2/<name>`, writing into `BASE_TEMPLATE_FILES_LOCATION` (`src/templates/`).
- `Save sample` / sample import from `usability/20` PUTs to `/api/v1/sample-data/hl7v2/<file>`, writing into `USER_SAMPLE_DATA_LOCATION` (`src/service-samples/`).
- Spec 08 opens project templates with `projectPath` recorded on the `openTemplates` entry. Newly created tabs (`New` or `+ Create` missing include) have `projectPath` unset until saved.

## 3. Files you may edit

- `src/lib/projects/projectFiles.js`
- `src/lib/projects/projectFiles.spec.js`
- `src/routes.js`
- `src/routes.spec.js`
- `src/static/js/template-menu.js`
- `src/static/js/file-browser.js`
- `src/static/js/projects.js`

## 4. Local project write API (`PUT /api/v1/projects/file`)

- Header `X-Project-Path`: absolute local project directory path.
- Header `X-Project-File`: safe relative path inside the project, e.g. `templates/Hl7v2/Example.liquid`, `templates/Hl7v2/Resource/_Custom.liquid`, or `samples/hl7v2/custom.hl7`.
- Header `X-Project-Target`: `"template"` (default when omitted) or `"sample"`.
- Body: `text/plain` UTF-8 bytes.

Validation:

1. Read and validate `fhir-converter.json` via `readManifest`.
2. When `X-Project-Target` is `"template"` (or omitted), require `X-Project-File` to sit under one of `manifest.roots[family].templates` and end in `.liquid` or `.json`. A path under `samples/` returns `400 Save writes templates. The sample stays unchanged.`
3. When `X-Project-Target` is `"sample"`, require `X-Project-File` to sit under one of `manifest.roots[family].samples` and end in `.hl7`, `.txt`, `.msg`, or `.xml`.
4. Verify `fs.realpath` of the project root and the deepest existing ancestor directory inside the project so symlinks cannot write outside the project root (`400 Invalid path.`).
5. Create missing subdirectories inside the allowed root, write UTF-8 bytes, and return `200 { "ok": true, "path": "<relative>" }`.

## 5. Page behavior

1. **Template Save (`saveTemplate`):**
   - `kind === "local"`: PUT `/api/v1/projects/file` with `X-Project-Path`, `X-Project-Target: template`, and `X-Project-File` equal to `activeTemplate.projectPath || (<activeFamilyTemplatesRoot> + '/' + activeTemplate.name)`. On `200`, store `activeTemplate.projectPath`, update `currentTemplateReference[activeTemplate.name]`, clear the dirty dot, and refresh the project file list so newly created templates/partials appear immediately in the sidebar!
   - `kind === "github"`: send no request; call `showConversionError('This GitHub project is open for reading. Save is available for a folder on this server.')` and keep the dirty dot.
   - No project stored (Built-in): keep today's `PUT /api/v1/templates/...` unchanged.
2. **Sample Save / Import (`usability/20` hooks when a project is open):**
   - `kind === "local"`: route `Save sample`, `Import…`, and sidebar sample drop to `PUT /api/v1/projects/file` with `X-Project-Target: sample` and `X-Project-File: <activeFamilySamplesRoot>/<fileName>`, then refresh the project file list.
   - `kind === "github"`: allow scratch drop into `dataEditor`, and on `Save sample` / `Import…` show `This GitHub project is open for reading. Save is available for a folder on this server.`

## 6. Tests

In `src/lib/projects/projectFiles.spec.js` and `src/routes.spec.js`:

- Saving `templates/Hl7v2/Resource/_NewPartial.liquid` into a temp project creates `Resource/_NewPartial.liquid`, leaves `src/templates/` untouched, and updates the file bytes.
- Saving a path under `samples/` with default `X-Project-Target: template` returns `400 Save writes templates. The sample stays unchanged.`
- Saving a sample with `X-Project-Target: sample` writes under `samples/hl7v2/`.
- Path traversal (`../outside.liquid`) and symlink escape return `400`.

Manual check on `http://127.0.0.1:2019`, then `npm test` and `npm run eslint`.

## 7. Acceptance criteria

- Local project saves write exclusively inside the open project root.
- GitHub project saves make zero network or disk writes and display the read-only error.
- Built-in save behavior is unchanged.
