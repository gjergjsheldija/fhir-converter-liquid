# Spec 19: Replace the Included chip tray with a grouped Includes popover and create-missing-include

**Status:** Done. Read `specs/web-ui/usability/00-order.md` first. Specs 01 through 18 are in the worktree.

## 1. Goal

1. Eliminate the multi-row wrapped `#included-panel` pill cloud that crowds the top of the Liquid editor (e.g. 62 pills on `ADT_A04.liquid`, 8 multi-line pills on `Resource/_MessageHeader.liquid`) and remove duplicate active-filename clutter above the tab bar.
2. Replace it with a single compact **`Includes (N) ▾`** control in the `.template-tabs` bar that opens an on-demand, filterable popover grouped by folder (`Resource`, `ID`, `DataType`, `Extensions`, `Reference`, `CodeSystem`).
3. Let the user **create a missing include on the spot**: writing `{% include 'Resource/MyCustomObs' %}` (or `render` / `evaluate ... using`) highlights the unresolved reference and lets the user create and open `Resource/_MyCustomObs.liquid` in a dirty editor tab with one click — either from the **`Includes ▾`** popover's `Missing` group or by double-clicking / `Cmd/Ctrl-Click`ing the reference in the editor.

## 2. Current behavior

1. **Duplicate filename & multi-row pill band in `.template-area` (`src/static/index.html` lines `107–131`):**
   - `.pane-header` displays `Template` plus `<span id="template-open-name">Resource/_MessageHeader.liquid</span>`, and immediately underneath `nav.template-tabs` displays the exact same active tab name `Resource/_MessageHeader.liquid ×`.
   - Below `nav.template-tabs`, `#included-panel` renders `#included-heading` (`INCLUDED (8)`) and `#included-list` full of wrapped `.included-chip` buttons (`DataType/HDMessageHeader_source`, `DataType/HDMessageHeader_destination`, `Extensions/DataAbsentReason`, etc.), permanently consuming up to `96px` above line 1 of the editor.
2. **Unresolved includes are dead ends (`src/static/js/template-editor.js` lines `436–519`):**
   - `resolveIncludeName(quoted)` returns `null` whenever the target file is not yet in `templateNames`.
   - `findPartialNamesOnLine(lineText)` skips unresolved references (`if (!file) continue;`), so double-clicking a newly typed `{% include 'Resource/MyObs' %}` does nothing, and in `#included-panel` the chip is rendered `disabled` with `title="Not in the template list"`.
   - Inline resolved includes use `.underline { border-bottom: 1px solid #080; }`, which draws a harsh bright-green underline across every string.

## 3. Files you may edit

- `src/static/index.html`
- `src/static/css/template-editor.css`
- `src/static/js/template-editor.js`
- `src/static/js/editor-tabs.js`

Do not edit vendored `*.liquid` files or server code.

## 4. Target partial path rule (`targetIncludeFileName`)

Add `targetIncludeFileName(quoted)` in `src/static/js/template-editor.js` implementing the deterministic path mapping used by `src/lib/liquid-converter/liquid-converter.js` `resolve()`, without requiring the file to exist in `templateNames` yet:

1. Trim `quoted`. Reject empty strings, paths starting or ending with `/`, paths containing `\`, `..`, or `//`, or characters outside `[A-Za-z0-9._/-]` → return `null`.
2. If `quoted` already ends with `.liquid` or `.json`, return `quoted`.
3. Split on `/`:
   - `1` segment (`Helper`): return `Helper.liquid`.
   - `> 1` segments:
     - If `quoted.toLowerCase()` ends with `codesystem/codesystem` or `valueset/valueset`, append `.json` to the last segment (`CodeSystem/CodeSystem.json`).
     - Otherwise prepend `_` (unless the last segment already starts with `_`) and append `.liquid` (`Resource/MyCustomObs` → `Resource/_MyCustomObs.liquid`; `Extensions/Patient/Note` → `Extensions/Patient/_Note.liquid`).

Update `resolveIncludeName(quoted)` to check `openTemplates` as well as `templateNames`: a partial is considered **existing** when `templateNames` contains the resolved path **or** `openTemplates` already has a tab with `name === resolvedPath`. Otherwise it is **missing** (creatable when `targetIncludeFileName(quoted)` is non-null).

 Add `openOrCreateInclude(quoted)` in `template-editor.js`:

1. If `resolveIncludeName(quoted)` returns `existingFile`:
   - Call `addTab(existingFile, activeTemplate ? activeTemplate.name : null)` (if `existingFile` is already in `openTemplates`, `addTab` switches to that tab without refetching from the server).
2. Else let `newFile = targetIncludeFileName(quoted)`:
   - If `!newFile`, `showConversionError('Invalid include name.')` and return.
   - Open a new closable dirty tab with `parent: activeTemplate ? activeTemplate.name : null`:
     Add an optional 4th parameter `parentName` to `openLocalTemplate(templateName, text, dirty, parentName)` in `src/static/js/editor-tabs.js` so when `parentName` is truthy, the new tab renders the `×` close button just like `addTab` does.
   - Call `openLocalTemplate(newFile, '', true, activeTemplate ? activeTemplate.name : null)` and focus `templateCodeEditor`.

## 5. Compact `Includes ▾` bar & grouped popover (replaces `#included-panel`)

1. **Header & tab bar layout (`src/static/index.html` and `template-editor.css`):**
   - Hide `#template-open-name` visually when `nav.template-tabs` is visible (keep `<span id="template-open-name" class="sr-only">` updated for screen readers and tests so existing selectors reading `#template-open-name` still work without repeating the filename twice above the code).
   - Remove the multi-row `#included-panel` block from between `nav.template-tabs` and `.template-editor`.
   - Turn `nav.template-tabs` into a single compact flex bar (`display: flex; align-items: center; border-bottom: 1px solid #eef1f6; padding-right: 8px; position: relative;`):
     - Left (`flex: 1 1 auto; min-width: 0; overflow-x: auto; flex-wrap: nowrap; border-bottom: 0;`): `#template-tabs`.
     - Right (`flex: 0 0 auto; margin-left: 8px; position: relative;`):
       ```html
       <div id="includes-menu-wrap" hidden>
           <button type="button" id="includes-menu-button" class="btn btn-sm includes-trigger" aria-haspopup="true" aria-expanded="false" aria-controls="includes-popover">
               <span id="includes-menu-label">Includes (0)</span>
               <span aria-hidden="true">▾</span>
           </button>
           <div id="includes-popover" role="region" aria-label="Included partials" hidden>
               <input id="includes-filter" class="form-control form-control-sm" type="text" placeholder="Filter includes…" aria-label="Filter includes">
               <div id="includes-groups"></div>
           </div>
       </div>
       ```
2. **Trigger label & grouped popover rendering (`renderIncludedPanel` in `template-editor.js`):**
   - When `findIncludeRefs(text)` is empty, set `hidden` on `#includes-menu-wrap` and close `#includes-popover`.
   - When non-empty, show `#includes-menu-wrap`. Let `total = refs.length` and `missingCount` = items where `resolveIncludeName(quoted) === null` and `targetIncludeFileName(quoted) !== null`.
   - Label `#includes-menu-label`:
     - `missingCount === 0`: `Includes (N)`
     - `missingCount > 0`: `Includes (N · M new)`
   - Inside `#includes-popover` (`position: absolute; right: 0; top: calc(100% + 4px); z-index: 30; width: 320px; max-height: 320px; overflow: auto; background: #fff; border: 1px solid #e3e8ef; border-radius: 10px; box-shadow: 0 8px 24px rgba(16, 24, 40, 0.12); padding: 8px;`):
     - Show `#includes-filter` when `total > 6`, hide it when `total <= 6`.
     - If any items are missing, render a **`Missing — click to create`** group first. Each row is a button showing `+ Create <targetFile>` (subtitle/badge `<quoted>`), calling `openOrCreateInclude(item.quoted)` and closing the popover.
     - Group existing items by their top folder (`ID`, `Resource`, `DataType`, `Extensions`, `Reference`, `CodeSystem`, or `Root` when there is no `/`). Under each group heading (`DataType (5)`), render clean single-line buttons showing the short name after the first `/` (`HDMessageHeader_source`, `STCoding`, `CWECode`) with `title` set to the full resolved file (`DataType/_HDMessageHeader_source.liquid`). Clicking a row calls `openOrCreateInclude(item.quoted)` and closes the popover.
   - Clicking `#includes-menu-button` toggles `#includes-popover` and `aria-expanded` (focusing `#includes-filter` when visible). Clicking outside `#includes-menu-wrap` or pressing `Escape` closes `#includes-popover`.

## 6. Cleaner inline editor marks & click-to-open / click-to-create

1. Update `findPartialNamesOnLine(lineText)` so it returns `{ start, end, quoted, name, exists }` for **both** existing (`exists: true`, `name: resolvedFile`) and creatable missing (`exists: false`, `name: targetFile`) references, skipping only invalid paths (`targetFile === null`).
2. In `underlinePartialTemplateNames`:
   - Existing partials use class `include-link`: `border-bottom: 1px dotted rgba(8, 116, 67, 0.55); cursor: pointer;` (hover intensifies to solid `#087443`), replacing the harsh `#080` solid line.
   - Missing creatable partials use class `include-missing`: `border-bottom: 1px dashed #d97706; cursor: pointer;`.
3. On `dblclick` **or** `mousedown` with `event.metaKey || event.ctrlKey` on a marked partial span in `templateCodeEditor`, call `openOrCreateInclude(match.quoted)` (preventing text selection jump on `Cmd/Ctrl-Click`).

## 7. How to check

1. Open `http://localhost:2019` with `ADT_A04.liquid`. The multi-row chip box above line 1 is gone; line 1 starts directly below the tab bar, and the right side of the tab bar shows `Includes (62) ▾`.
2. Click `Includes (62) ▾`. The popover opens with `#includes-filter` and folder groups (`ID`, `Resource`, `Reference`, `Extensions`). Type `messageheader` in `#includes-filter`, click `MessageHeader` under `Resource`, and confirm `Resource/_MessageHeader.liquid` opens in a closable tab and the popover closes.
3. On `Resource/_MessageHeader.liquid`, confirm the filename is not visibly duplicated right above the tab, and the tab bar shows `Includes (8) ▾`.
4. In `ADT_A04.liquid`, type `{% include 'Resource/CustomVital' -%}` on a new line.
   - `'Resource/CustomVital'` gets the dashed `.include-missing` underline.
   - The trigger updates to `Includes (63 · 1 new) ▾`.
   - Either `Cmd/Ctrl-Click` (or double-click) `'Resource/CustomVital'` in the editor, or open `Includes ▾` and click `+ Create Resource/_CustomVital.liquid`.
   - Confirm a new closable dirty tab `Resource/_CustomVital.liquid` opens in the editor with the blue `.tab-dirty` dot, and returning to `ADT_A04.liquid` now marks `'Resource/CustomVital'` as an existing `.include-link`.

Then run `npm test` and `npm run eslint`.

## 8. Acceptance criteria

- Zero vertical space is taken by wrapped include chips above the code editor; all includes live in the `Includes (N) ▾` tab-bar popover and inline links.
- Existing includes are grouped by folder with short readable labels and filter search when `> 6`.
- Typing an `include`, `render`, or `evaluate using` target that does not exist highlights it as `.include-missing` and allows creating and loading the properly named partial (`Folder/_Name.liquid` or `Name.liquid`) in one action from both the editor and the popover.
- No vendored `*.liquid` file on disk is modified unless the user explicitly clicks `Save`.
