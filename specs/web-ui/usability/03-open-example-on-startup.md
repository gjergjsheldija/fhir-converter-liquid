# Spec 03: Open one example on startup

**Status:** Done. Implemented in commit eae6c60 (`didOpenStartupExample` guard plus startup-example block at the end of the inner success callback in `refreshFileBrowser` in `src/static/js/file-browser.js`; opens `hl7v2/ADT04-23.hl7` with `ADT_A04.liquid` once when both editors are empty).

## 1. Goal

A first visit shows a conversion immediately. When the message editor is empty and the only template is the empty `untitled` tab, load sample `hl7v2/ADT04-23.hl7` and template `ADT_A04.liquid`.

If the user already has message text, or the open template is not that empty untitled tab, load nothing.

## 2. Current behavior

`src/static/js/file-browser.js` `refreshFileBrowser()` loads `GET /api/v1/sample-data` and then `GET /api/v1/templates`, calls `applyTemplateList`, then `renderFileBrowser`. It runs once from `$(document).ready`.

`loadData(dataFile)` in `src/static/js/template-menu.js` fetches the sample, sets `dataEditor`, sets `#message-name` to the text after the first `/`, and calls `convertData(true)`.

`loadTemplate(templateFile)` calls `closeAllTemplates()` and then `addTab(templateFile, null)`. `closeAllTemplates()` returns true without `confirm` when every open template matches `currentTemplateReference`. The initial template is `{name: 'untitled', parent: null, data: ''}` and the reference is `untitled: ''`, so the first `loadTemplate` does not prompt.

Startup in `template-editor.js` calls `changeDataType('HL7V2')`, which clears both editors and leaves `untitled`. That call is synchronous and happens in the same ready cycle as `refreshFileBrowser()`. The file lists arrive later, on the AJAX callbacks. Autoload belongs in that success callback, after `applyTemplateList`.

The sample and template exist in the current built-in set. Confirmed on 17 Nov 2026: `GET /api/v1/sample-data` includes `hl7v2/ADT04-23.hl7`, and the template list includes `ADT_A04.liquid` after the `hl7v2/` prefix is stripped by `applyTemplateList`.

## 3. Files you may edit

- `src/static/js/file-browser.js`

Do not edit `template-menu.js` or `template-editor.js` in this spec. Call the existing `loadData` and `loadTemplate`.

## 4. Implementation

Add one guard at module scope in `file-browser.js`:

```javascript
var didOpenStartupExample = false;
```

At the end of the inner success callback in `refreshFileBrowser`, after `applyTemplateList` and `renderFileBrowser(sampleList.messages || [])`:

1. If `didOpenStartupExample` is true, return.
2. Set `didOpenStartupExample = true` before starting the loads, so a later refresh cannot load the example again.
3. Open the example only when all of these are true:
   - `dataEditor` exists and `dataEditor.getValue()` is `''`.
   - `activeTemplate` exists, `activeTemplate.name === 'untitled'`, and `activeTemplate.data === ''`.
   - `openTemplates.length === 1`.
   - The sample list contains an item whose `messageName` is exactly `hl7v2/ADT04-23.hl7`.
   - `templateNames` is an array and contains exactly the string `ADT_A04.liquid`.
4. When those checks pass:
   - Set `selectedSample = 'hl7v2/ADT04-23.hl7'`.
   - Set `selectedTemplate = 'ADT_A04.liquid'`.
   - Call `renderFileBrowser(sampleList.messages || [])` again so both rows have `is-selected`.
   - Call `loadData('hl7v2/ADT04-23.hl7')`.
   - Call `loadTemplate('ADT_A04.liquid')`.
5. When any check fails, do nothing else. Do not show an error for a missing example. The user may have typed already, or the files may not be installed.

`loadTemplate` is asynchronous. Do not wait for it and do not call it twice. `loadData` starts a conversion; the template change starts another. That is the same sequence as two user clicks. Leave it.

Do not read or write `localStorage` for this. Reloading an empty page opens the example again. Reloading after the user has edited is still an empty document, because the editors are not persisted. That means every fresh page load of an untouched editor opens the example. That is the intended behavior.

Do not remove the `untitled` tab before `loadTemplate`. `loadTemplate` already closes it.

## 5. How to check

Open `http://localhost:2019` in a fresh tab.

1. Without clicking, the message header becomes `ADT04-23.hl7`, the template header becomes `ADT_A04.liquid`, and the result header becomes `Converted`.
2. The sample row and the template row both have the class `is-selected`.
3. Type in the message, reload, and confirm the example replaces the typed text. This is expected, because the page does not persist editor text. Record it in your report. Do not add persistence in this spec.
4. If you can simulate a missing file by temporarily filtering it out in the check (do not ship that filter), the page stays on `untitled` and shows no error. Restore the code before finishing.
5. Click another sample after startup. The example does not load again.

Then run `npm test` and `npm run eslint`.

## 6. Acceptance criteria

- An empty startup loads exactly `hl7v2/ADT04-23.hl7` and `ADT_A04.liquid`, once.
- A startup that already has message text or a non-empty template does not call `loadData` or `loadTemplate`.
- A missing sample or a missing template skips the example and shows no new error.
- No other files change.
