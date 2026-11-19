# Spec 07: New project and Open project

**Status:** Done (2026-11-18). New project and Open project dialogs implemented in `src/static/index.html` and `src/static/js/projects.js`.

## 1. Goal

The page can create an HL7 v2 or C-CDA project, or open a local or GitHub project, before it shows that project's files. Built-in templates remain available.

## 2. Current behavior

- `src/static/index.html` has a file browser whose `.file-browser-title` row contains `<span class="file-browser-title-text">Files</span>` and `#file-browser-collapse` (from `usability/17`), followed by Built-in, GitHub, and Folder browse switches.
- The navbar has Convert, Debug, Settings, and API docs.
- `window.icon(id)` from `src/static/js/icons.js` (`theme/04`) renders inline `16×16` SVG symbols including `icon-hl7` and `icon-ccda`.
- The create and open routes from specs 02–06 exist.

## 3. Files you may edit

- `src/static/index.html`
- `src/static/js/projects.js` (new)
- `src/static/css/template-editor.css`

Do not change convert, save, or the built-in file list in this spec. Opening a project sets `localStorage` key `fhirConverterProject`. Spec 08 reads it.

## 4. Navbar and file-browser header

1. In `#navbar`, after `.navbar-brand` and before `#convert-button`, add:
   - `New project`, id `new-project-open` (`btn btn-outline-dark btn-sm navbar-btn ml-2`)
   - `Open project`, id `open-project-open` (`btn btn-outline-dark btn-sm navbar-btn ml-2`)
   Style both with the quiet chrome button tokens (`--surface`, `--text`, `--border`, `--hover`).
2. Inside `.file-browser-title`, keep `#file-browser-collapse` at the far right (`margin-left: auto`), replace/update `.file-browser-title-text` as `#project-label` (default text `Built-in`), and place a compact `Built-in` reset button (`id="project-use-builtin"`, `hidden` whenever no project is stored) before `#file-browser-collapse`.

## 5. New project dialog

A Bootstrap modal, id `new-project-modal`, title `New project`.

Two family cards inside, implemented as radio buttons with visible labels, name `new-project-family`:

- `HL7 v2`, value `hl7v2`, checked by default, preceded by `icon('icon-hl7')` when `typeof icon === 'function'`. Text under the label: `Pipe-delimited messages. Templates start from the Microsoft pack or from one empty example.`
- `C-CDA`, value `ccda`, preceded by `icon('icon-ccda')` when `typeof icon === 'function'`. Text: `XML documents. This server stores the project. Conversion is not available yet.`

Starting point, radio name `new-project-start`:

- For HL7 v2: `Microsoft baseline` (`baseline`, checked by default: `Copies the pinned v7.0 template pack and four sample messages.`) and `Empty example` (`empty`: `One synthetic ADT message and one Patient template.`).
- For C-CDA: only `Empty example` is enabled. `Microsoft baseline` is disabled (`C-CDA baseline is not installed on this server.`).

Fields:

- `Project name`, id `new-project-name`, text, required.
- `Folder on this server`, id `new-project-parent`, text, placeholder `Absolute path. The project folder is created inside it.`
- Help line, id `new-project-help`: `In Docker this is a path inside the container. The folder must sit outside this server's templates.`
- Error banner inside the modal, id `new-project-error`, class `project-modal-error`, `hidden` by default (uses `--danger-text` and `--danger-bg`).
- Primary button `Create`, id `new-project-create` (`background: var(--accent); color: var(--accent-text)`).

On Create, POST `/api/v1/projects` with `name`, `parentPath`, `family`, and `startingPoint`. Disable the button and set its label to `Creating…` until the response.

- `201`: close the modal, store `{ "kind": "local", "path": "<path>", "manifest": <manifest> }` under `fhirConverterProject`, show `#project-use-builtin`, and set `#project-label` to `<manifest.name> · HL7 v2` (or `C-CDA`, or `HL7 v2, C-CDA`).
- Error: show `error.message` in `#new-project-error`. Never call `alert`.

Switching the family radio updates which starting points are enabled without clearing the name or path.

## 6. Open project dialog

A modal, id `open-project-modal`, title `Open project`.

Two radios, name `open-project-kind`: `Folder` (`local`, default) and `GitHub` (`github`).

- Folder field: `Path`, id `open-project-path`, placeholder `Absolute path to the project`.
- GitHub fields (`hidden` until GitHub is selected):
  - `Repository`, id `open-project-repo`, placeholder `owner/repo`
  - `Ref`, id `open-project-ref`, placeholder `Branch, tag, or commit. Empty uses the default branch.`
  - `Token`, id `open-project-token`, `type="password"`, placeholder `Optional`
  - Help line, id `open-project-github-help`, exact text: `The token is saved in this browser and sent to this app to read a private repo. It is not stored on the server.`
- Error banner inside the modal, id `open-project-error`, class `project-modal-error`, `hidden` by default.
- Primary button `Open`, id `open-project-go`.

Folder posts `/api/v1/projects/open`. GitHub posts `/api/v1/projects/open-github` with `repo`, `ref`, and `token`.

When `opened` is `true`, close the modal, show `#project-use-builtin`, update `#project-label`, and store under `fhirConverterProject`:

- Local: `{ "kind": "local", "path", "manifest" }`
- GitHub: `{ "kind": "github", "repo", "ref", "token", "manifest" }`

When `needsConfirm` is `true`, replace the form step inside the modal with the sentence `This project has no manifest file.` and one checked disabled checkbox per entry in `detected` (`HL7 v2` with `icon-hl7`, `C-CDA` with `icon-ccda`), plus button `Use these templates` (`id="open-project-confirm"`) and a `Back` button. `Use these templates` posts the same body plus `confirmFamilies: detected`. On success, store the project and close the modal.

Clicking `#project-use-builtin` removes `fhirConverterProject`, hides `#project-use-builtin`, and sets `#project-label` to `Built-in`.

Do not switch the file list yet in this spec; Spec 08 wires project file loading.

## 7. How to check

Manual against `http://127.0.0.1:2019` using a temp directory under `/tmp`:

1. Create an empty HL7 v2 project, a baseline HL7 v2 project, and an empty C-CDA project from `#new-project-modal`. Confirm files on disk, `#project-label`, family icons, and dark-theme styling.
2. Open a folder with `Hl7v2/` and no manifest from `#open-project-modal`. Confirm the confirmation step appears and writes `fhir-converter.json` only after `Use these templates`.
3. Confirm `#file-browser-collapse` still collapses and expands the sidebar cleanly.
4. Click `Built-in` and confirm `#project-label` resets to `Built-in`.

Then run `npm test` and `npm run eslint`.

## 8. Acceptance criteria

- All create and open flows from specs 02–06 work from the two modals without `alert`/`prompt`.
- `#file-browser-collapse`, dark-mode tokens, and family icons (`icon-hl7`, `icon-ccda`) work cleanly.
- Built-in mode remains intact.
