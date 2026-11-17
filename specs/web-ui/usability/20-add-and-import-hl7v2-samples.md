# Spec 20: Add, import, drag-and-drop, and save HL7v2 sample messages

**Status:** Done (2026-11-17). Implement this file only. Read `specs/web-ui/usability/00-order.md` first. Specs 01 through 19 are in the worktree.

## 1. Goal

Give users a fast, safe way to bring their own HL7v2 messages into the workspace without ever modifying the immutable vendored `src/sample-data/hl7v2/` tree:

1. **Quick scratch drop / paste:** Dragging a `.hl7` / `.txt` / `.msg` file onto the **Message** pane loads it straight into `dataEditor` and converts immediately without writing to disk.
2. **Save current message as a sample (`Save sample`):** Save the text currently in `dataEditor` into the `Samples` list, pre-filling a sensible filename derived from `MSH-9` and `MSH-10` (for example `ADT_A04-MSG00001.hl7`).
3. **Import files (`Import…` or drop onto `Samples`):** Import one or multiple `.hl7` / `.txt` / `.msg` files from the user's computer directly into the `Samples` list.
4. **Synthetic starter (`New`):** Generate a clean synthetic `DOE^JANE` HL7v2 message matching the active template's `MSH-9` type (for example `ORU_R01.liquid` → `MSH|...|ORU^R01|...`) so healthcare developers can test without pasting PHI.

## 2. Current behavior and immutability rule

- `GET /api/v1/sample-data` and `GET /api/v1/sample-data/:type/:file` in `src/routes.js` read `SAMPLE_DATA_LOCATION` (`src/sample-data/`) via `messageCache`.
- There is no `PUT` or `POST` route for sample messages and no UI button to add, import, or save a sample.
- **Immutability constraint (`AGENTS.md`):** Bundled files under `src/sample-data/hl7v2/` are immutable in git. User-saved samples in Built-in mode must write to a separate gitignored runtime directory `src/service-samples/` (`USER_SAMPLE_DATA_LOCATION` in `src/lib/constants/constants.js`), overlaid on top of read-only `SAMPLE_DATA_LOCATION` when listing and reading samples, and never touching `src/sample-data/`.

## 3. Files you may edit

- `.gitignore` (add `src/service-samples/`)
- `src/lib/constants/constants.js` (export `USER_SAMPLE_DATA_LOCATION`)
- `src/routes.js`
- `src/routes.spec.js`
- `src/static/index.html`
- `src/static/css/template-editor.css`
- `src/static/js/file-browser.js`
- `src/static/js/template-editor.js`

Do **not** edit, add, or delete any file under `src/sample-data/` or `src/templates/`.

## 4. Server routes (`src/routes.js`)

1. **`GET /api/v1/sample-data`:**
   - Merge entries from read-only `SAMPLE_DATA_LOCATION` and `USER_SAMPLE_DATA_LOCATION` (if the directory exists). User samples carry `"source": "user"`, bundled samples carry `"source": "builtin"`. Keep `messageName` format (`"hl7v2/Filename.hl7"`) so all existing callers and tests stay compatible. If both contain the same relative name, list it once with `"source": "user"`.
2. **`GET /api/v1/sample-data/:type/:file`:**
   - Validate `:type` (`hl7v2`) and `:file` (single safe filename matching `^[A-Za-z0-9._-]+$`, no `..`, no `/`). Check `USER_SAMPLE_DATA_LOCATION` first, then `SAMPLE_DATA_LOCATION`.
3. **`PUT /api/v1/sample-data/hl7v2/:file` (`text/plain` body, max `2_000_000` bytes):**
   - Validate `:file`: safe single filename; append `.hl7` if no extension is present; only `.hl7`, `.txt`, or `.msg` allowed (otherwise `400` `Sample file must end in .hl7, .txt, or .msg.`).
   - Reject empty/whitespace-only body with `400` `Sample message cannot be empty.`
   - Refuse overwriting a bundled file name that exists in `SAMPLE_DATA_LOCATION/hl7v2/` with `409` `Cannot overwrite a built-in sample. Save under a new file name.`
   - Write UTF-8 bytes to `join(USER_SAMPLE_DATA_LOCATION, 'hl7v2', fileName)`, creating parent directories as needed. Return `200` `{ "ok": true, "messageName": "hl7v2/" + fileName, "source": "user" }`.
4. **`DELETE /api/v1/sample-data/hl7v2/:file`:**
   - Delete only from `USER_SAMPLE_DATA_LOCATION/hl7v2/:file`. If the file exists only in `SAMPLE_DATA_LOCATION`, return `403` `Built-in samples cannot be deleted.` Missing file returns `404`.

When `app.setConstants(c)` runs in tests, accept optional `c.USER_SAMPLE_DATA_LOCATION` so unit/route tests run against `os.tmpdir()` and leave no files behind.

## 5. UI workflows

1. **Message pane header controls (`src/static/index.html` inside `.msg-area .pane-header`):**
   At the right end (`ml-auto`) of `.msg-area .pane-header`, add:
   - `New sample` (`#new-sample-button`, `btn btn-sm btn-outline-dark`): generates a clean synthetic 4-segment HL7v2 message (`MSH`, `EVN` when ADT, `PID` with `DOE^JANE`, `PV1` / `ORC`+`OBR`+`OBX` for `ORU`/`ORM`/`OML`, `RXA` for `VXU`, `SCH` for `SIU`) inferred from the active template name (`ADT_A04.liquid` → `ADT^A04`, fallback `ADT^A04`), loads it into `dataEditor`, sets `#message-name` to `synthetic-<TYPE_EVENT>.hl7 (unsaved)`, and converts.
   - `Import…` (`#import-sample-button`, `btn btn-sm btn-outline-dark`) + hidden `<input type="file" id="import-sample-input" accept=".hl7,.txt,.msg" multiple hidden>`: selecting 1 file loads it into `dataEditor` and saves it via `PUT /api/v1/sample-data/hl7v2/:file` (auto-renaming with `-2` if a built-in sample shares that name); selecting multiple files uploads all of them, refreshes `Samples`, and loads the first one.
   - `Save sample` (`#save-sample-button`, `btn btn-sm btn-outline-dark`): opens an inline name input `#save-sample-form` in `.msg-area .pane-header` (same inline pattern as Spec 11's `#new-template-form`, no `window.prompt`!), pre-filled from `MSH-9` + `MSH-10` of `dataEditor.getValue()` (e.g. `ADT_A04-MSG00001.hl7`), `PUT`s `/api/v1/sample-data/hl7v2/:file`, refreshes the sidebar, selects the new sample row, and runs Spec 05's `highlightMatchingTemplate`.
2. **Drag and drop:**
   - Dropping a file onto `.msg-area` highlights `.msg-area.is-drop-target`, reads the file in the browser via `FileReader.readAsText`, puts it into `dataEditor`, sets `#message-name` to `<file.name> (unsaved)`, and runs `convertData(true)` **without** saving to disk.
   - Dropping one or more files onto `#file-browser` highlights `#file-browser.is-drop-target`, saves each via `PUT /api/v1/sample-data/hl7v2/:file`, refreshes the `Samples` list, and opens the first dropped file.
3. **Delete user sample:**
   - Sample rows with `source === 'user'` show a quiet `×` remove action (or context delete button, `aria-label="Remove <name>"`) that confirms and calls `DELETE /api/v1/sample-data/hl7v2/:file`. Built-in samples have no delete button.

## 6. Tests and verification

In `src/routes.spec.js` (using a temp `USER_SAMPLE_DATA_LOCATION` via `app.setConstants`):

- `PUT /api/v1/sample-data/hl7v2/custom-adt.hl7` returns `200`, appears in `GET /api/v1/sample-data` with `source: "user"`, and is readable via `GET /api/v1/sample-data/hl7v2/custom-adt.hl7`.
- `PUT` attempting to overwrite a built-in sample (`ADT04-23.hl7`) returns `409` and leaves `src/sample-data/hl7v2/ADT04-23.hl7` untouched.
- `PUT` with `../escape.hl7` or empty body returns `400`.
- `DELETE` on `custom-adt.hl7` returns `200`; `DELETE` on `ADT04-23.hl7` returns `403`.

Manual check on `http://localhost:2019` (after restarting the server), followed by `npm test`, `npm run eslint`, and `git status --short` confirming zero changes in `src/sample-data/`.

## 7. Acceptance criteria

- Users can create a synthetic sample, paste and `Save sample`, `Import…` multiple `.hl7` files, drag-and-drop onto `Message` (scratch) or `Files` (saved), and remove user-added samples.
- `src/sample-data/hl7v2/` is never written to or modified; built-in collisions return `409` or auto-suffix on import.
