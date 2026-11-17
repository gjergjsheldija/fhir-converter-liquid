# Spec 15: Show the partials the open template includes

**Status:** Done. Implemented in commit d09cf04 (`#included-panel` with heading and chip list in `.template-area` in `src/static/index.html` plus the spec's CSS; `findIncludeRefs`, `resolveIncludeName`, `renderIncludedPanel`, and `findPartialNamesOnLine` in `src/static/js/template-editor.js` matching `{% include %}`, `{% render %}`, `{% evaluate … using '…' %}`, and `{{> name}` in source order with dedup by quoted name; the panel renders one chip per distinct target with resolved-file `title`/`data-template-name`, disabled chips for unresolved names, and `addTab(resolved, activeTemplate.name)` on click; the change handler and `changeTab` re-render it; the double-click handler now opens the match under the cursor; `getPartialTemplateNameNames`/`getPartialTemplateNameLocation` replaced; no `loadTemplate` call from the panel; verified against `ADT_A04.liquid` data: `Resource/MessageHeader` once → `Resource/_MessageHeader.liquid`, `ID/Bundle` → `ID/_Bundle.liquid`).

## 1. Goal

When a template is open, the names it includes are listed in the template pane. One click loads that partial into a closable tab. The user does not scroll the Partials folders to find `Resource/_MessageHeader.liquid` after reading `{% include 'Resource/MessageHeader' %}`.

Do not open every included file as a tab by itself. `ADT_A04.liquid` includes the same partial many times. A tab per reference covers the editor. The panel is the list. A click loads one file.

## 2. Current behavior

Includes in the bundled templates are Liquid tags, not `{{>` handles. `src/templates/Hl7v2/ADT_A04.liquid` line 1 is a filter. Line 19 is:

```text
{% evaluate bundleID using 'ID/Bundle' Data: firstSegments.MSH.10 -%}
```

Line 39 is:

```text
{% include 'Resource/MessageHeader' MSH: firstSegments.MSH, ID: messageHeaderId -%}
```

`getPartialTemplateNameLocation` in `src/static/js/template-editor.js` only searches for `{{>`. No bundled HL7v2 template contains `{{>`. The underline and the double-click opener never see `include`, `render`, or `evaluate`.

`templateNames` holds the file name after the `hl7v2/` prefix, as produced by `applyTemplateList` in `template-menu.js`. The file for the include above is `Resource/_MessageHeader.liquid`. The file for `'ID/Bundle'` is `ID/_Bundle.liquid`. That rename is the same rule as `resolve()` in `src/lib/liquid-converter/liquid-converter.js`:

- One path segment: append `.liquid`. `ADT_A04` would be `ADT_A04.liquid`.
- More than one segment: prefix `_` on the last segment and append `.liquid`.
- Exception: a path whose lower-case form ends with `codesystem/codesystem` or `valueset/valueset` appends `.json` on the last segment and does not add `_`.

`addTab(templateName, parentName)` in `editor-tabs.js` fetches `templateFileUrl(templateName)`, which is `/api/v1/templates/` plus the key prefix plus `templateName`. The cache key is the file name, so `addTab` must receive `Resource/_MessageHeader.liquid`, not `Resource/MessageHeader`. When `parentName` is set, the new tab has a close button. `loadTemplate` closes every open template. This spec must call `addTab`, not `loadTemplate`.

The template pane in `src/static/index.html` is `.template-area`: a header, `nav.template-tabs`, then `.template-editor`. There is no include list.

The file browser still has a Partials section. Leave it. This panel is a second, short list for the file that is open.

## 3. Files you may edit

- `src/static/index.html`
- `src/static/css/template-editor.css`
- `src/static/js/template-editor.js`
- `src/static/js/editor-tabs.js` (one call after the editor text is set)

Do not edit `*.liquid` files. Do not add an endpoint. Do not add a dependency.

## 4. Markup

Inside `.template-area`, after `nav.template-tabs` and before `.template-editor`, add:

```html
<div id="included-panel" hidden>
    <div id="included-heading">Included</div>
    <div id="included-list"></div>
</div>
```

CSS:

```css
#included-panel {
    flex: 0 0 auto;
    max-height: 96px;
    overflow: auto;
    padding: 4px 8px 8px;
    border-bottom: 1px solid #eef1f6;
}

#included-panel[hidden] {
    display: none;
}

#included-heading {
    font-size: 11px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #667085;
    margin-bottom: 4px;
}

#included-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}

.included-chip {
    border: 1px solid #e3e8ef;
    background: #fff;
    border-radius: 6px;
    padding: 2px 6px;
    font-size: 12px;
    text-align: left;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.included-chip[disabled] {
    color: #98a2b3;
    cursor: default;
}
```

The panel is `flex: 0 0 auto` so the CodeMirror region keeps the remaining height. If spec 01 has already set `.template-area` to a column with `min-height: 0`, keep that. This panel must not use `height: auto` on a CodeMirror node.

## 5. Find references in the active template

Add `findIncludeRefs(text)` in `template-editor.js`. It scans the whole template string and returns an array, in first-seen order, of:

```javascript
{quoted: "Resource/MessageHeader", index: 39}
```

`quoted` is the inside of the quotes, or the token after `{{>`. `index` is the index of that match in `text`, used only to keep source order.

Match all three forms. Use the global flag and do not stop at the first hit on a line.

1. `{% include '...'` and `{% render '...'`. Allow whitespace where Liquid allows it. Accept `-` immediately before `%}` later on the line; do not require it. The name is the single-quoted string. Pattern:

```javascript
/{%-?\s*(?:include|render)\s+'([^']+)'/g
```

2. `{% evaluate <identifier> using '...'`. Pattern:

```javascript
/{%-?\s*evaluate\s+[A-Za-z_][\w]*\s+using\s+'([^']+)'/g
```

3. `{{> name` with the name ending at whitespace or `}`. Pattern:

```javascript
/\{\{>\s*([^\s}]+)/g
```

Skip a match whose `quoted` is empty. Dedup by `quoted`. Keep the earliest index.

`ADT_A04.liquid` must produce both `ID/Bundle` and `Resource/MessageHeader` from the lines quoted in section 2. It must produce `Resource/MessageHeader` once even though that include occurs more than once.

## 6. Resolve a quoted name to a file

Add `resolveIncludeName(quoted)` in `template-editor.js`. It returns a `templateNames` entry or `null`.

1. If `templateNames` is not an array, return `null`.
2. If `templateNames` contains `quoted` exactly, return `quoted`.
3. Split `quoted` on `/`.
4. If there is one segment and `templateNames` contains `segment + ".liquid"`, return that.
5. If there is more than one segment:
   - Let `lower = quoted.toLowerCase()`.
   - If `lower` ends with `codesystem/codesystem` or `valueset/valueset`, the last segment becomes `last + ".json"`.
   - Otherwise the last segment becomes `"_" + last + ".liquid"`.
   - Join with `/`. If `templateNames` contains that string, return it.
6. Otherwise return `null`.

Worked checks:

| Quoted name | Resolved file |
| --- | --- |
| `Resource/MessageHeader` | `Resource/_MessageHeader.liquid` |
| `ID/Bundle` | `ID/_Bundle.liquid` |
| `Extensions/Patient/PatientExtension` | `Extensions/Patient/_PatientExtension.liquid` |
| `Resource/_MessageHeader.liquid` | `Resource/_MessageHeader.liquid` when that exact string is already in `templateNames` |

Do not read the disk. Do not guess a nearby file when the resolved name is absent.

## 7. Render the panel

Add `renderIncludedPanel()`:

1. Read `activeTemplate.data` when `activeTemplate` exists, otherwise `''`.
2. Build the ref list and resolve each name.
3. If the list is empty, set `#included-panel` to `hidden`, empty `#included-list`, and return.
4. Otherwise remove `hidden`. Set the heading text to `Included (N)` where N is the list length.
5. Empty `#included-list`. For each ref, append `<button type="button" class="included-chip">`.
   - The button text is `quoted`.
   - `title` is the resolved file name, or `Not in the template list` when resolve returns `null`.
   - `data-template-name` is the resolved file name when it exists.
   - When resolve returns `null`, set the `disabled` attribute. Do not give it a click handler.
6. A click on an enabled chip calls `addTab(resolvedName, activeTemplate.name)`. It does not call `loadTemplate`. It does not change the message editor.

Call `renderIncludedPanel()`:

- At the end of `changeTab` in `editor-tabs.js`, after `templateCodeEditor.setValue`.
- At the end of the template editor `change` handler in `template-editor.js`, after `activeTemplate.data` is updated. That keeps the list current while the user types an include. The handler already runs on every edit. Do not start a conversion from `renderIncludedPanel`.

Guard both calls with `typeof renderIncludedPanel === "function"` if you want the scripts to tolerate order. `template-editor.js` is loaded before `editor-tabs.js` is not the current order: `editor-tabs.js` is first, `template-editor.js` is later. `changeTab` runs only after a click, so `renderIncludedPanel` already exists. A direct call is enough. Do not move the script tags.

## 8. Double-click in the editor opens the same file

`underlinePartialTemplateNames` calls `getPartialTemplateNameLocation` once per line and underlines that one span. Replace that with a function `findPartialNamesOnLine(lineText)` that returns every `{start, end, name}` on that line.

`name` is the resolved file from section 6, not the quoted text. `start` and `end` are indexes in `lineText` covering the quoted name without the quotes, or the `{{>` name without the braces. The existing double-click handler compares `cursorPos.ch` to `start` and `end` and then calls `addTab(nameLocation.name, activeTemplate.name)`. That keeps working when `name` is the resolved file.

Mark every returned span with class `underline`. If a line has two includes, both are underlined.

`getPartialTemplateNameLocation(lineText)` may remain as a wrapper that returns the first result of `findPartialNamesOnLine`, or you may delete it if every caller is updated. The double-click handler must use the match that contains `cursorPos.ch`, not always the first match on the line. Change it to:

```javascript
var matches = findPartialNamesOnLine(lineText);
var nameLocation = matches.find(function (match) {
    return cursorPos.ch >= match.start && cursorPos.ch <= match.end;
});
```

A quoted name that does not resolve is not underlined and is not given a double-click. It still appears as a disabled chip.

Do not change the unused-segment marker. That runs on the message editor.

## 9. How to check

Open `http://localhost:2019` and open `ADT_A04.liquid`.

1. `#included-panel` is visible. The heading is `Included (N)` with N greater than 1.
2. A chip reads `Resource/MessageHeader`. Its `title` is `Resource/_MessageHeader.liquid`. The same chip is not repeated for every include of that file.
3. A chip reads `ID/Bundle`. Its `title` is `ID/_Bundle.liquid`.
4. Click `Resource/MessageHeader`. A new tab opens for `Resource/_MessageHeader.liquid`. The ADT_A04 tab is still there. The new tab has a close button. The message sample does not change.
5. Close that tab. The ADT_A04 text is unchanged.
6. Double-click the name inside `{% include 'Resource/MessageHeader' ... %}` in the editor. The same partial tab opens.
7. Double-click `{% evaluate bundleID using 'ID/Bundle' ... %}`. The `ID/_Bundle.liquid` tab opens.
8. An empty `untitled` template hides `#included-panel`.
9. The Partials section of the file browser is still there.

Then run `npm test` and `npm run eslint`.

## 10. Acceptance criteria

- The open template shows each distinct `include`, `render`, `evaluate using`, and `{{>` target once, in source order.
- An enabled chip and a double-click both call `addTab` with the resolved file name and the current template as parent.
- Nothing calls `loadTemplate` from this panel.
- Unresolved names are disabled chips and are not underlined.
- Included files are not opened until the user clicks or double-clicks.
- No `*.liquid` file and no server file is modified.
