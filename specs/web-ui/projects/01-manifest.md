# Spec 01: Project manifest

**Status:** Done (2026-11-18). Implemented in `src/lib/projects/manifest.js` and verified in `manifest.spec.js`.

## 1. Goal

One JSON document describes a project. Later specs create and open projects by calling this module. This spec does not add a route and does not change the page.

## 2. Current behavior

There is no project file. The page loads templates from `service-templates` through `GET /api/v1/templates` and samples from `src/sample-data` through `GET /api/v1/sample-data`. `src/lib/browse/sources.js` lists a GitHub repo or a folder one directory at a time. Nothing records a family, a baseline commit, or a startup sample.

`test/e2e-test/liquid-fixtures/UPSTREAM_VERSION.md` records the HL7 v2 pin as tag `v7.0`, commit `253307fe6063a42b024ef7dbeb6aae157f1c2f61`.

## 3. Files you may edit

- `src/lib/projects/manifest.js` (new)
- `src/lib/projects/manifest.spec.js` (new)

Do not add a route. Do not edit the page.

## 4. File name and shape

The manifest file name is exactly `fhir-converter.json`. It is UTF-8 JSON, object, no BOM.

Version 1 has this shape. Unknown extra keys are kept on read and written back unchanged. Missing required keys make `validateManifest` return an error string.

```json
{
  "manifestVersion": 1,
  "name": "Adt rules",
  "fhirVersion": "R4",
  "families": ["hl7v2"],
  "startup": {
    "family": "hl7v2",
    "sample": "samples/hl7v2/example.hl7",
    "template": "templates/Hl7v2/ADT_A04.liquid"
  },
  "roots": {
    "hl7v2": {
      "templates": "templates/Hl7v2",
      "samples": "samples/hl7v2"
    }
  }
}
```

`ccda` uses `roots.ccda.templates` = `templates/Ccda` and `roots.ccda.samples` = `samples/ccda`. A project may list one family or both, in the order `hl7v2` then `ccda`.

`startup.family` is one of `families`. `startup.sample` and `startup.template` are relative paths using `/`, with no leading slash, no empty segment, and no `..` segment.

`fhirVersion` is exactly `R4` in this version. Any other value is an error.

Optional on a family root:

```json
"baseline": {
  "repository": "https://github.com/microsoft/FHIR-Converter",
  "tag": "v7.0",
  "commit": "253307fe6063a42b024ef7dbeb6aae157f1c2f61"
}
```

When `baseline` is present, all three strings are required and non-empty. An empty starter omits `baseline`.

## 5. Module

Export these functions from `src/lib/projects/manifest.js`:

- `MANIFEST_FILE` is the string `fhir-converter.json`.
- `validateManifest(value)` returns `null` when the value matches section 4, or a single English sentence when it does not. Check, in this order: value is a plain object, `manifestVersion` is `1`, `name` is a non-empty string of at most 80 characters, `fhirVersion` is `R4`, `families` is a non-empty array of unique entries from `hl7v2` and `ccda` only, `roots` has exactly those families, each root's `templates` and `samples` are safe relative paths, `startup` matches section 4. A safe relative path matches `^[A-Za-z0-9._/-]+$`, does not start or end with `/`, and does not contain `..` or `//`.
- `detectFamilies(relativeDirectoryNames)` takes an array of relative directory paths using `/`. Return `['hl7v2']` when any entry is `templates/Hl7v2`, `Hl7v2`, or ends with `/Hl7v2`. Return `['ccda']` for `templates/Ccda`, `Ccda`, or a path ending in `/Ccda`. Return both, HL7 v2 first, when both match. Return `[]` otherwise. Do not stat the disk in this function.
- `emptyHl7v2Manifest(name)` and `emptyCcdaManifest(name)` return a valid manifest object. Paths are the ones in section 4. Startup sample and template are:
  - HL7 v2: `samples/hl7v2/example.hl7` and `templates/Hl7v2/Example.liquid`
  - C-CDA: `samples/ccda/example.xml` and `templates/Ccda/Example.liquid`
- `baselineHl7v2Manifest(name)` returns the HL7 v2 manifest plus the baseline object from section 4, with startup sample `samples/hl7v2/ADT04-23.hl7` and startup template `templates/Hl7v2/ADT_A04.liquid`.
- `readManifest(dir)` reads `path.join(dir, MANIFEST_FILE)`. Return `{ok: true, manifest}` on success. Return `{ok: false, error}` with a sentence when the file is missing, is not JSON, or fails validation. Do not throw for those three cases.
- `writeManifest(dir, manifest)` validates, creates `dir` if needed, and writes the JSON with a trailing newline and two-space indent. Throw when validation fails. This function may create the directory. It must not write any other file.

`name` is stored as given after trimming. Do not slug it here. Spec 02 slugs the directory name.

## 6. How to check

`src/lib/projects/manifest.spec.js` covers:

- A valid HL7 v2 manifest, a valid C-CDA manifest, and a manifest with both families pass.
- `manifestVersion: 2`, `fhirVersion: "R5"`, a family of `json`, a startup family that is not listed, and a path containing `..` each fail with a non-empty string.
- `detectFamilies(['templates/Hl7v2', 'notes'])` is `['hl7v2']`.
- `detectFamilies(['templates/Hl7v2', 'templates/Ccda'])` is `['hl7v2', 'ccda']`.
- `detectFamilies(['templates/Other'])` is `[]`.
- `readManifest` on a missing directory returns `ok: false` and does not throw.
- `writeManifest` then `readManifest` round-trips `emptyHl7v2Manifest('Adt rules')`, including an extra key `note` added before the write.
- `writeManifest` throws when the manifest is invalid, and does not leave a file.

Use `os.tmpdir()` plus a unique subdirectory. Delete that subdirectory in an `after` hook.

Then run `npm test` and `npm run eslint`.

## 7. Acceptance criteria

- The module exports every name in section 5.
- Invalid manifests never write a file.
- No route, page, template, or sample file changes.
