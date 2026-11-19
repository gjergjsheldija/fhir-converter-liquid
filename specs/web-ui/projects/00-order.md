# Project specs

These specs add a project as the thing the page opens. A project is a folder or a GitHub repo with a type, Liquid templates, and sample messages.

Implement `specs/runtime/02`, `specs/web-ui/usability/` (`01` through `20`), `specs/web-ui/theme/` (`01` through `04`), and `specs/web-ui/editor/` (`01` through `05`) before starting this folder.

## Rules for every spec

1. Implement one numbered spec, then stop. Do not start the next spec in the same change.
2. Read this file, then the spec you are implementing, then the files that spec names. The spec's "Current behavior" section is the baseline. If the worktree no longer matches that baseline, stop and report the difference. Do not invent a new design.
3. Edit only the files listed in that spec.
4. Do not add a dependency. Do not add a test framework. Tests stay on mocha, in the files the spec names.
5. Do not edit `src/templates/**`, `src/service-templates/**`, `src/sample-data/**`, `test/e2e-test/liquid-fixtures/**`, or any other vendored `*.liquid`, sample message, or expected JSON. Specs that copy those bytes into a new project directory read them and write the copy somewhere else.
6. Keep `POST /api/v1/convert/:srcDataType` untouched for Built-in mode and API callers. Spec 09 adds `POST /api/v1/projects/convert` so project conversions resolve partials from the open project.
7. Preserve behavior added by earlier specs (`usability/`, `theme/`, `editor/`, and earlier specs in this folder).
8. A C-CDA project stores files. This server converts HL7 v2 only. Do not add a C-CDA parser in these specs.
9. Do not commit unless the user explicitly asks.

## Terms

- **Project.** A directory, or a GitHub repo, whose root contains `fhir-converter.json`.
- **Family.** `hl7v2` or `ccda`. The family chooses the parser, the template root, and the sample root.
- **Baseline.** The pinned Microsoft FHIR Converter tree already in this repo: tag `v7.0`, commit `253307fe6063a42b024ef7dbeb6aae157f1c2f61`, recorded in `test/e2e-test/liquid-fixtures/UPSTREAM_VERSION.md`.
- **Empty starter.** A new project with one root template and one synthetic sample. No Microsoft files.
- **Baseline starter.** A new HL7 v2 project whose `templates/Hl7v2/` is a byte copy of `src/templates/Hl7v2/`, plus four sample files named in spec 03.

## Order

Specs 01–11 are implemented.

| Spec | Status | File | What it changes |
| --- | --- | --- | --- |
| 01 | Done (2026-11-18) | `01-manifest.md` | Read, write, and validate `fhir-converter.json`. No HTTP route and no page change. |
| 02 | Done (2026-11-18) | `02-create-empty-hl7v2.md` | `POST /api/v1/projects` creates an empty HL7 v2 project on disk. |
| 03 | Done (2026-11-18) | `03-create-baseline-hl7v2.md` | The same route can copy the pinned HL7 v2 template pack and four samples. |
| 04 | Done (2026-11-18) | `04-create-empty-ccda.md` | The same route can create an empty C-CDA project. A C-CDA baseline copy is refused. |
| 05 | Done (2026-11-18) | `05-open-local-project.md` | `POST /api/v1/projects/open` reads a local project, or detects families and waits for confirmation. |
| 06 | Done (2026-11-18) | `06-open-github-project.md` | `POST /api/v1/projects/open-github` does the same for a GitHub repo at a branch, tag, or commit. |
| 07 | Done (2026-11-18) | `07-new-and-open-dialog.md` | The page offers New project and Open project dialogs before the file list. |
| 08 | Done (2026-11-18) | `08-open-startup-case.md` | Opening a project lists its files (via Git Trees on GitHub), opens its startup pair cleanly, and routes partial tabs to the project. |
| 09 | Done (2026-11-18) | `09-convert-from-open-project.md` | `POST /api/v1/projects/convert` resolves `{% include %}` and `{% evaluate %}` partials from the open local or GitHub project instead of the server's built-in tree. |
| 10 | Done (2026-11-18) | `10-save-into-the-open-project.md` | Save writes templates (and user-saved samples) into the open local project; GitHub projects report read-only; Built-in mode stays unchanged. |
| 11 | Done (2026-11-18) | `11-add-official-hl7v2-samples.md` | A button copies the 139 official HL7 v2 samples into the open local project. |

## Out of this folder

Git commit, push, and pull request stay out. Creating a GitHub repo through the API stays out. Implementation Guide validation and a C-CDA parser stay out.
