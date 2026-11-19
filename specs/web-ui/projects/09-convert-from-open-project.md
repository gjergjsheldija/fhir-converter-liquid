# Spec 09: Convert HL7v2 messages using the open project's templates and partials

**Status:** Done (2026-11-18). Implemented in `src/lib/projects/convertProject.js`, `POST /api/v1/projects/convert`, `liquid-converter.js`, and `worker.js`.

## 1. Goal

When a local or GitHub HL7 v2 project is open, conversions must resolve every `{% include %}` and `{% evaluate ... using %}` partial and code-mapping `.json` file from **that project** (overlaid with any unsaved open partial tabs in `templatesOverride`), never silently falling back to the server's built-in `src/service-templates/Hl7v2/`. Built-in mode and `POST /api/v1/convert/:srcDataType` remain completely unchanged.

Also ensure `applyDotLiquidCompatTransforms` runs on `.liquid` entries in `templatesOverride` inside `src/lib/liquid-converter/liquid-converter.js`, fixing DotLiquid preprocessing for open partial tabs in both Built-in and Project modes.

## 2. Current behavior

1. `convertData` in `src/static/js/template-editor.js` always posts to `/api/v1/convert/hl7v2` with `{ srcData, template, templatesOverride }`, where `templatesOverride` only contains partials currently open as secondary editor tabs.
2. `GetLiquidInstance` in `src/lib/workers/worker.js` always passes `HL7V2_LIQUID_TEMPLATE_LOCATION` (`src/service-templates/Hl7v2`) as the root directory to `liquid-converter.js`. Any partial inside a local or GitHub project that is not currently open in a tab resolves from `src/service-templates/Hl7v2` (ignoring project files or failing with `ENOENT` on custom project partials).
3. In `src/lib/liquid-converter/liquid-converter.js` (lines `42–44`), `readFileSync` returns `overrides[relativeName]` raw without calling `applyDotLiquidCompatTransforms(...)`, whereas disk reads on line `45` apply `applyDotLiquidCompatTransforms`.

## 3. Files you may edit

- `src/lib/liquid-converter/liquid-converter.js`
- `src/lib/workers/worker.js`
- `src/lib/projects/convertProject.js` (new)
- `src/lib/projects/convertProject.spec.js` (new)
- `src/routes.js`
- `src/routes.spec.js`
- `src/static/js/projects.js`
- `src/static/js/template-editor.js`

Do not edit `*.liquid` files or expected fixtures. Do not change `POST /api/v1/convert/:srcDataType` request/response contracts.

## 4. Engine and worker support

1. **`overrides` DotLiquid preprocessing (`src/lib/liquid-converter/liquid-converter.js`):**
   - In `fs.readFileSync(templateFilePath)`: when `relativeName in overrides`, if `relativeName.toLowerCase().endsWith('.json')` return `overrides[relativeName]`; otherwise return `applyDotLiquidCompatTransforms(overrides[relativeName])`.
   - Add an option `allowDiskFallback` (default `true`) or pass an empty non-existent root when `strictOverridesOnly === true` (used for GitHub projects so an include missing from the GitHub repo errors cleanly instead of silently reading `src/service-templates/Hl7v2`!).
2. **Custom `templateDirectory` & `strictOverridesOnly` in `convertInlineHl7v2` (`src/lib/workers/worker.js`):**
   - Accept optional `msg.templateDirectory` and `msg.strictOverridesOnly` in `convertInlineHl7v2` and `GetLiquidInstance`.
   - When `msg.templateDirectory` is set or `msg.strictOverridesOnly` is `true`, always create a fresh Liquid instance (`createNew = true`) for that render and set `rebuildLiquidCache = true` so subsequent Built-in conversions rebuild their clean `HL7V2_LIQUID_TEMPLATE_LOCATION` cache.

## 5. Project convert route (`POST /api/v1/projects/convert`)

Accepts query flags `?unusedSegments=true&invalidAccess=true&debug=true` and optional `timezone` header, identical to `/api/v1/convert/hl7v2`.

Request JSON:

```json
{
  "project": { "kind": "local", "path": "/abs/project" },
  "srcData": "MSH|...",
  "template": "{% include 'Resource/Custom' %}",
  "templatesOverride": {}
}
```

1. **Local project (`project.kind === "local"`):**
   - Read and validate `fhir-converter.json` via `readManifest(project.path)`. Require `manifest.families.includes("hl7v2")`, else `400 This converter only supports HL7v2.`
   - Resolve `templateDir = path.resolve(projectRootReal, manifest.roots.hl7v2.templates)` and verify its `fs.realpath` sits inside `projectRootReal`.
   - Dispatch to the worker with `srcDataType: "hl7v2"`, `srcData`, `template`, `templatesOverride`, `templateDirectory: templateDirReal`, `timezone`, and `debug`.
2. **GitHub project (`project.kind === "github"`):**
   - Validate `project.manifest` and require `hl7v2` in `families`.
   - In `src/lib/projects/convertProject.js`, load and cache in memory (LRU max `5` `repo@ref` entries, TTL `5` minutes, keyed by `${owner}/${repo}@${effectiveRef}:${templatesRoot}`) the `.liquid` and `.json` templates needed from GitHub:
     - Recursively walk `include` / `render` / `evaluate ... using` references starting from `body.template` and `body.templatesOverride` (using the exact partial path resolver rule from `liquid-converter.js`), fetching only referenced files via `readGithubFile` and caching each fetched file by `${owner}/${repo}@${ref}:${path}` so even a 914-file repo only fetches the ~1–65 partials the open template actually uses, and subsequent keystrokes hit memory in `0ms`!
   - Merge `{ ...cachedGithubPartials, ...(body.templatesOverride || {}) }` so open editor tabs override GitHub bytes, and dispatch to the worker with `strictOverridesOnly: true` (never falling back to `src/service-templates/`).

## 6. Page wiring (`template-editor.js` and `projects.js`)

In `convertData` (`src/static/js/template-editor.js`):

- If an active project is open (`getActiveProject()` from `projects.js` is non-null):
  - If the active project family is `'ccda'`, return without sending a request.
  - Otherwise post to `/api/v1/projects/convert?unusedSegments=true&invalidAccess=true&debug=true` with `reqBody.project = getActiveProject()` alongside `srcData`, `template`, and `templatesOverride`.
- If no project is open (Built-in mode): keep posting to `/api/v1/convert/hl7v2?unusedSegments=true&invalidAccess=true&debug=true` unchanged.

## 7. Tests

In `src/lib/projects/convertProject.spec.js` and `src/routes.spec.js`:

1. Create a local temp HL7v2 project containing `templates/Hl7v2/Root.liquid` (`{% include 'Resource/OnlyInProject' %}`) and `templates/Hl7v2/Resource/_OnlyInProject.liquid` (a partial that does **not** exist in `src/templates/Hl7v2/`). `POST /api/v1/projects/convert` returns `200` with the rendered resource; `POST /api/v1/convert/hl7v2` with the same root template fails because Built-in does not have `Resource/_OnlyInProject.liquid`.
2. Verify a local project missing `Resource/_MessageHeader.liquid` fails conversion rather than silently reading `src/service-templates/Hl7v2/Resource/_MessageHeader.liquid`.
3. Stub `fetch` for a GitHub project with `Root.liquid` → `Resource/_Custom.liquid`: confirm `POST /api/v1/projects/convert` fetches `Resource/_Custom.liquid` once, renders `200`, and on a second convert reuses the cache with `0` extra `fetch` calls.
4. Confirm open-tab `templatesOverride` wins over both local disk and cached GitHub partials, and runs `applyDotLiquidCompatTransforms`.

Then run `npm test` and `npm run eslint`.

## 8. Acceptance criteria

- Local and GitHub HL7v2 projects resolve all partials strictly from the open project + `templatesOverride`, never leaking `src/service-templates/`.
- `.liquid` entries in `templatesOverride` receive `applyDotLiquidCompatTransforms`.
- `POST /api/v1/convert/:srcDataType` behavior and performance are unchanged.
