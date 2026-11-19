# Spec 05: Open a local project

**Status:** Done (2026-11-18). Implemented in `src/lib/projects/openProject.js` and `POST /api/v1/projects/open`.

## 1. Goal

The server can open a folder that is already a project, and can detect an HL7 v2 or C-CDA tree that has no manifest yet. Detection does not write until the caller confirms the families.

## 2. Current behavior

`POST /api/v1/browse/folder` lists any directory the server can read. It does not look for `fhir-converter.json`. Spec 01's `readManifest` and `detectFamilies` exist. Create from specs 02–04 writes a manifest.

## 3. Files you may edit

- `src/lib/projects/openProject.js` (new)
- `src/lib/projects/openProject.spec.js` (new)
- `src/routes.js`
- `src/routes.spec.js`

## 4. Request

`POST /api/v1/projects/open` with JSON `{ "path": "/absolute/project" }`.

`path` is absolute and an existing directory. Otherwise use the same 400 and 404 sentences as spec 02.

When `fhir-converter.json` exists:

- Valid manifest: 200 `{ "opened": true, "path": "<resolved>", "manifest": { } }`.
- Invalid manifest: 400 with the sentence from `readManifest`. Do not rewrite the file.

When the manifest is missing:

1. Walk the directory with `fs.readdir`, recursive, `withFileTypes`. Skip directories named `.git` and `node_modules`. Collect relative directory paths using `/`.
2. Call `detectFamilies` on that list.
3. When the result is empty, return 404 `No HL7 v2 or C-CDA templates found.`
4. When the result is not empty, return 200:

```json
{
  "opened": false,
  "needsConfirm": true,
  "path": "/resolved",
  "detected": ["hl7v2"]
}
```

Do not write a manifest on that response.

A second request confirms:

```json
{
  "path": "/absolute/project",
  "confirmFamilies": ["hl7v2"]
}
```

`confirmFamilies` must be the same set as a fresh `detectFamilies` of that directory, same order not required. Any other set returns 400 `Those families do not match this folder.` and writes nothing.

On a matching confirm, write a manifest with `writeManifest`:

- `name` is the basename of the resolved path.
- `families` is the detected list, HL7 v2 first when both are present.
- Roots use `templates/Hl7v2`, `samples/hl7v2`, `templates/Ccda`, and `samples/ccda` for the families that were detected. Do not move existing template files in this spec. The detected folders may be `Hl7v2` at the root or `templates/Hl7v2`. Record the path that was actually found, preferring `templates/Hl7v2` when both exist. Same rule for Ccda.
- Samples path is `samples/hl7v2` or `samples/ccda` even when that directory does not exist yet. Create the samples directory. Do not create template files.
- `startup.family` is the first detected family.
- `startup.template` is the first of these files that exists under the template root, using the root-relative Liquid name the manifest stores as a path under that root:
  - HL7 v2: `ADT_A04.liquid`, then `ADT_A01.liquid`, then the first `*.liquid` file directly in the template root, sorted by name.
  - C-CDA: `CCD.liquid`, then `Example.liquid`, then the first `*.liquid` file directly in the template root, sorted by name.
- `startup.sample` is the first file directly in the samples directory, sorted by name. When the samples directory is empty, leave the samples directory empty and set `startup.sample` to `samples/hl7v2/.gitkeep` or `samples/ccda/.gitkeep` and write that empty file. A `.gitkeep` sample is a placeholder, not a message.

Response 200 `{ "opened": true, "path", "manifest" }`.

Opening a path inside `BASE_TEMPLATE_FILES_LOCATION` or `TEMPLATE_FILES_LOCATION` returns 400 `Open a copy of the templates, not the server tree.` The built-in tree is not a project.

## 5. Tests

Use temp directories.

- A folder produced by spec 02 opens with `opened: true` and the same startup template.
- A folder with only `Hl7v2/ADT_A04.liquid` and no manifest returns `needsConfirm: true` and `detected: ["hl7v2"]`, and does not create `fhir-converter.json`.
- Confirming that folder writes a manifest whose template root is `Hl7v2` (the path that exists) and whose startup template is `Hl7v2/ADT_A04.liquid`.
- Confirming `["ccda"]` for that folder returns 400 and still does not write.
- A folder with no template directories returns 404.
- A valid manifest with an extra key still opens, and the file bytes are unchanged.

Then run `npm test` and `npm run eslint`.

## 6. Acceptance criteria

- A missing manifest never writes until `confirmFamilies` matches detection.
- The server template directories cannot be opened as a project.
- Browse folder from `src/lib/browse/sources.js` is unchanged.
