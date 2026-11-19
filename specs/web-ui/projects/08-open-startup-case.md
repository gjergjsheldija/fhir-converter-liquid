# Spec 08: Open the project's files and startup case

**Status:** Done (2026-11-18). Implemented in `src/lib/projects/projectFiles.js`, `POST /api/v1/projects/files`, `POST /api/v1/projects/file`, and `projects.js`.

## 1. Goal

When a local or GitHub project is open:

1. The sidebar lists that project's samples, root templates, and partials (fetched in a single Git Trees call for GitHub repos so 914-file baseline repos never hit rate limits).
2. The message pane opens the manifest's startup sample and the template pane opens the startup template with a **clean** (not dirty) reference.
3. Opening an included partial from `Includes ▾` or double-clicking / `Cmd/Ctrl-Click`ing `{% include %}` loads the partial from the **open project**, not from the server's built-in tree.
4. A C-CDA project loads the XML document (in `xml` mode) and template without calling the HL7v2 convert endpoint.

## 2. Current behavior

- `refreshFileBrowser` in `src/static/js/file-browser.js` always reads `GET /api/v1/sample-data` and `GET /api/v1/templates`, and runs `didOpenStartupExample` once on empty startup.
- `addTab(templateName, parentName)` in `src/static/js/editor-tabs.js` always calls `$.get(templateFileUrl(templateName))` (`/api/v1/templates/Hl7v2/...`).
- `src/lib/browse/sources.js` only wraps the single-directory GitHub Contents API, not the recursive Git Trees API.
- Spec 07 stores `fhirConverterProject` in `localStorage` and updates `#project-label`.

## 3. Files you may edit

- `src/lib/browse/sources.js`
- `src/lib/projects/projectFiles.js` (new)
- `src/lib/projects/projectFiles.spec.js` (new)
- `src/routes.js`
- `src/routes.spec.js`
- `src/static/index.html` (only `#project-family` select inside `#file-browser`, hidden for single-family projects)
- `src/static/js/file-browser.js`
- `src/static/js/editor-tabs.js`
- `src/static/js/projects.js`
- `src/static/js/template-editor.js`

## 4. Read API (`projectFiles.js` and `routes.js`)

1. **`listGithubTree(repoInput, token, ref)` in `src/lib/browse/sources.js`:**
   - Validate `repoInput` with `parseGithubRepo` and validate `ref` (reject whitespace or `..` with `400 Invalid ref.`).
   - When `ref` is empty/omitted, resolve the repo's `default_branch` via `GET https://api.github.com/repos/{owner}/{repo}`.
   - Fetch `GET https://api.github.com/repos/{owner}/{repo}/git/trees/{encodeURIComponent(effectiveRef)}?recursive=1` and return all `"type": "blob"` relative paths. (`404` → `404 Repository or ref not found.`; other non-2xx → `400 GitHub request failed with status N.`).
2. **`POST /api/v1/projects/files`:**
   - Local body: `{ "kind": "local", "path", "family"?: "hl7v2" | "ccda" }`. Read and validate `fhir-converter.json` via `readManifest(path)`.
   - GitHub body: `{ "kind": "github", "repo", "ref", "token", "manifest", "family"?: "hl7v2" | "ccda" }`. Validate `manifest` with `validateManifest` without re-fetching `fhir-converter.json` from GitHub.
   - Determine `activeFamily = body.family || manifest.startup.family`. Require `manifest.families.includes(activeFamily)`, else `400 Family is not in this project.`
   - Response `200`:
     ```json
     {
       "manifest": {},
       "family": "hl7v2",
       "samples": ["samples/hl7v2/example.hl7"],
       "templates": ["templates/Hl7v2/Example.liquid"]
     }
     ```
     `samples`: sorted relative paths under `manifest.roots[activeFamily].samples` (skipping `.gitkeep`). `templates`: sorted `.liquid` and `.json` relative paths under `manifest.roots[activeFamily].templates`.
3. **`POST /api/v1/projects/file`:**
   - Accepts the project body plus `{ "path": "samples/hl7v2/example.hl7" }` and returns `200` `text/plain`.
   - Require `path` to be a safe relative path (Spec 01) sitting under one of the roots in `manifest.roots`. Otherwise `400 Invalid path.`
   - For `local`: verify `fs.realpath` of the target file starts with `fs.realpath(projectRoot) + path.sep` so symlinks cannot escape the project directory (`400 Invalid path.` on escape, `404 File not found.` when missing).
   - For `github`: read via `readGithubFile(repo, path, token, ref)`.

## 5. Page behavior

1. **Switching between Built-in and an open project:**
   - When `fhirConverterProject` is absent: keep Built-in `#source-switch` visible and run today's `refreshFileBrowser` + `didOpenStartupExample`.
   - When `fhirConverterProject` is present: hide `#source-switch`, `#source-github`, and `#source-folder` (the project itself is the source), show `#builtin-lists`, and fetch `POST /api/v1/projects/files` for the active family.
   - Strip `<roots[family].samples>/` for sample display names and `<roots[family].templates>/` for `templateNames` so folder grouping (`Resource`, `ID`, `DataType`), icons (`icon-message`, `icon-template`, `icon-partial`, `icon-json` inside `.file-browser-label`), MSH-9 suggestions, and `Includes ▾` resolution all work identically!
2. **Opening project files cleanly (`dirty = false`):**
   - Selecting a project sample fetches `POST /api/v1/projects/file`, sets `dataEditor` (`mode: "hl7v2"` for `hl7v2`, `"xml"` for `ccda`), updates `#message-name`, and converts only when `activeProjectFamily === 'hl7v2'`.
   - Opening a project root template closes clean/confirmed tabs (`closeAllTemplates()`), fetches `POST /api/v1/projects/file` for `<templatesRoot>/<shortName>`, calls `openLocalTemplate(shortName, text, false)` (**`dirty = false`**, so freshly opened templates have a clean reference and no unsaved dot!), and records `tab.projectPath = '<templatesRoot>/<shortName>'` on the `openTemplates` entry.
   - Update `addTab(templateName, parentName)` in `src/static/js/editor-tabs.js`: when an active project is open, fetch the partial via `POST /api/v1/projects/file` (`path: <templatesRoot> + '/' + templateName`) instead of `templateFileUrl(templateName)`, store `currentTemplateReference[templateName] = data` and `projectPath`, and append the closable tab!
3. **Startup pair & multi-family selector (`#project-family`):**
   - Once per newly opened project (`path` or `repo@ref`), load `manifest.startup.sample` and `manifest.startup.template`:
     - `hl7v2`: run `convertData(true)`.
     - `ccda`: do not call `convertData`; clear `outputCode`, hide `#result-error` and `#unused-legend`, and set `#conversion-status` to `C-CDA conversion is not available yet.`
   - Show `<select id="project-family">` only when `manifest.families.length > 1` (`HL7 v2` / `C-CDA`). Changing it calls `POST /api/v1/projects/files` with `{ ...project, family }` and opens the startup pair (if `family === manifest.startup.family`) or the first sample and first root template of that family.

## 6. Tests

In `src/lib/projects/projectFiles.spec.js` and `src/routes.spec.js` (stubbing `fetch` for GitHub):

- Local project `/api/v1/projects/files` lists samples (excluding `.gitkeep`) and `.liquid`/`.json` templates, and switches roots when `family: "ccda"` is passed on a dual-family manifest.
- Symlink or `../` path escape on `/api/v1/projects/file` returns `400 Invalid path.`
- GitHub `/api/v1/projects/files` uses the single recursive `/git/trees/{ref}?recursive=1` endpoint rather than walking subdirectories one by one.

Manual check on `http://127.0.0.1:2019` (restart server first), then `npm test` and `npm run eslint`.

## 7. Acceptance criteria

- Opening a project loads its startup sample and template cleanly (`dirty === false`), lists its files with icons and collapsible sections, and opens partials via `Includes ▾` / double-click from the project rather than `src/service-templates/`.
- GitHub file listing uses the recursive Git Trees endpoint.
- C-CDA projects display XML without calling `/api/v1/convert/hl7v2`.
- Path traversal and symlink escapes outside a local project are rejected.
