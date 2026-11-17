# Spec 14: Autocomplete the library filters

**Status:** Done. Implemented in commit 6d6d452 (`GET /api/v1/helpers` in `src/routes.js` now returns `{name, description}` for every `external` filter from `src/lib/liquid-converter/liquid-helpers.js` with no `func` and no `note`; `src/routes.spec.js` asserts `get_segment_lists` is present, names/descriptions are strings, and no item has `func`; `src/static/js/hdc-hint.js` loads the list once via `loadLibraryFilters` from the ready handler in `src/static/js/template-editor.js`, offers library filter hint items after `|` (dedup by comparable text, first occurrence wins, `indexOf` prefix match), and appends `evaluate` to `liquidBlockKeywords`; the failed-request path leaves `libraryFilterKeywords` empty with no banner).

## 1. Goal

In the template editor, completion after a `|` includes the filters this app registers, including `get_segment_lists`. Completion after `{%` includes the custom tag `evaluate`.

The names come from the server list of registered filters. Do not copy the filter list into `hdc-hint.js` by hand. Adding a filter to `src/lib/liquid-converter/liquid-helpers.js` must make that name appear in autocomplete after a reload, with no second edit in the hint file.

The user-facing example is `get_segment_lists`. There is no filter named `get_segment_list`. Typing `get_segment_list` must still offer `get_segment_lists`, because the current matcher uses `indexOf`, not a full-string compare.

## 2. Current behavior

`src/static/js/hdc-hint.js` registers a CodeMirror hint helper named `anyword`. The template editor's mode is `application/json`. Ctrl-Space runs `autocomplete`, which calls `CodeMirror.showHint`. `node_modules/codemirror/addon/hint/show-hint.js` uses `CodeMirror.hint.anyword` when the mode has no hint helper. Do not change that wiring, the mode string, or `show-hint.js`.

The helper looks at the 16 characters before the token being typed:

| Text just before the token | Candidates |
| --- | --- |
| A `\|` then optional spaces (`filterHintRegexp`, `/\|\s*$/`) | `liquidFilterKeywords` only |
| `{%` then optional spaces (`tagHintRegexp`) | `liquidBlockKeywords` only |
| `{{` | loop keywords and variable names |
| `include` or `render` after `{%` | `templateNames` |

`liquidFilterKeywords` is a fixed Shopify list (`abs`, `append`, `split`, and the rest in that array). It does not include `get_segment_lists`, `get_first_segments`, `format_as_date_time`, or the other names in `external`.

`liquidBlockKeywords` does not include `evaluate`. Templates use `{% evaluate bundleID using 'ID/Bundle' ... %}`. That tag is registered in `src/lib/liquid-converter/liquid-converter.js` with `engine.registerTag("evaluate", evaluate)`.

The registered filters are the `external` array in `src/lib/liquid-converter/liquid-helpers.js`. Each item has `name`, `description`, and `func`. The names are:

- `generate_id_input`
- `generate_uuid`
- `get_first_segments`
- `get_segment_lists`
- `get_related_segment_list`
- `get_parent_segment`
- `has_segments`
- `split_data_by_segments`
- `add_hyphens_date`
- `format_as_date_time`
- `now`
- `date_add`
- `sign`
- `truncate_number`
- `divide`
- `get_property`
- `split`

`GET /api/v1/helpers` in `src/routes.js` returns `{helpers: [], note: "..."}`. `src/routes.spec.js` asserts status 200 and that `response.body.helpers` is an array. Keep `helpers` an array so that assertion still passes.

Hint candidates are strings. This line throws if a candidate is an object:

```javascript
candidates = candidates.filter(x => x.toLowerCase().indexOf(prefix) != -1);
```

`prefix` is `curLine.slice(start, end).toLowerCase()`. `hintAfterChars` already includes `_`, so `get_segment_lists` is one token.

## 3. Files you may edit

- `src/routes.js`
- `src/routes.spec.js`
- `src/static/js/hdc-hint.js`
- `src/static/js/template-editor.js` (one fetch call from the existing ready handler)

Do not edit `liquid-helpers.js`. Do not edit `*.liquid` files. Do not add a dependency.

## 4. Return the real filter list

In `src/routes.js`, import the filter array:

```javascript
import {external as libraryFilters} from "./lib/liquid-converter/liquid-helpers.js";
```

Replace the body of `GET /api/v1/helpers` with:

```javascript
app.get("/api/v1/helpers", function (req, res) {
    res.status(200).json({
        helpers: libraryFilters.map(function (filter) {
            return {
                name: filter.name,
                description: filter.description || ""
            };
        })
    });
});
```

Do not put `func` on the JSON. Do not keep the old `note` field. Update the swagger comment above the route so it says the array items are `{name, description}` for the filters registered by this server. Leave the path as `/api/v1/helpers`.

In `src/routes.spec.js`, keep the existing "array" assertion. Add one assertion in that same `expect` callback:

- `response.body.helpers` contains an object whose `name` is `get_segment_lists`.
- Every item has a string `name` and a string `description`.
- No item has a property named `func`.

## 5. Load the list once

In `hdc-hint.js`, add:

```javascript
var libraryFilterKeywords = [];
```

Add `loadLibraryFilters()` that `GET`s `/api/v1/helpers` with `$.getJSON`. On success, if `data.helpers` is an array, set `libraryFilterKeywords` to the items whose `name` is a non-empty string. Ignore items without a name. On error, leave `libraryFilterKeywords` as `[]`. Do not call `showConversionError`. Do not retry.

Call `loadLibraryFilters()` from the existing `$(document).ready` in `template-editor.js`, after the editors are created. Do not call it from `hdc-hint.js` at parse time. `hdc-hint.js` is loaded after `template-editor.js`, but its functions are global, and the ready handler in `template-editor.js` runs after all scripts are parsed. `loadLibraryFilters` exists by then.

## 6. Offer those names after a pipe

In the `filterHintRegexp` branch, push both lists:

```javascript
candidates.push(...liquidFilterKeywords);
candidates.push(...libraryFilterKeywords);
```

`libraryFilterKeywords` items are objects `{name, description}` from the server, or you may map them to hint items inside `loadLibraryFilters`. The hint list must end as CodeMirror items. Use this shape for a library filter, and keep Shopify names as plain strings:

```javascript
{
    text: name,
    displayText: description && description !== "tbd" ? name + " — " + description : name
}
```

`generate_id_input` has description `tbd`, so its `displayText` is `generate_id_input` with no suffix.

Before filter and sort, a candidate's comparable text is `typeof item === "string" ? item : item.text`. Use that for `toLowerCase()`, for `indexOf(prefix)`, and for `sort`. Do not call `toLowerCase` on the object.

`split` is in both lists. The existing `Set` dedup does not dedup objects against strings. Dedup by the comparable text, first occurrence wins. Shopify `split` may stay. The library `split` does not need a second row.

The prefix check stays `indexOf`, not "starts with". `get_segment_list` matches `get_segment_lists`. `segment` matches `get_segment_lists` and `get_first_segments`.

Do not change the other branches except the tag branch in the next section. Do not change `completeSingle: false`.

## 7. Offer `evaluate` after `{%`

Add the string `evaluate` to the `liquidBlockKeywords` array, in alphabetical order between `endunless` and `for` is not required. Append it to the array. The tag branch already pushes `liquidBlockKeywords`. No server round trip for this one name. Do not add `validate`. It is not registered in `liquid-converter.js`.

## 8. How to check

Restart the app so `routes.js` is loaded. Open `http://localhost:2019`, open `ADT_A04.liquid`, and click in the template editor.

1. `GET /api/v1/helpers` returns 200. `helpers` includes `{name: "get_segment_lists", description: "Extracts HL7 v2 segments"}`. No item has `func`.
2. On a new line, type `{% assign x = hl7v2Data | get_segment_list`. The hint list includes `get_segment_lists`. It does not include a row named `get_segment_list`.
3. On a new line, type `{% assign x = hl7v2Data | format_as`. The hint list includes `format_as_date_time` and its display text contains `Converts HL7v2/CDA datetime to FHIR datetime format`.
4. Type `{% eva`. The hint list includes `evaluate`.
5. Type `| abs`. The Shopify filter `abs` is still offered.
6. Ctrl-Space with the cursor inside `get_segment_lists` after a pipe still opens the list. Choosing a row inserts the `text` value, which is the filter name, not the description.
7. Stop the helpers route or block it in devtools. Reload. Typing `| abs` still offers `abs`. No error banner appears.

Then run `npm test` and `npm run eslint`. The helpers test must pass, including the new assertion.

## 9. Acceptance criteria

- `/api/v1/helpers` returns every `external` filter as `{name, description}` and does not return functions.
- After `|`, autocomplete lists those names plus the existing Shopify names.
- `get_segment_list` matches `get_segment_lists`.
- `{%` autocomplete lists `evaluate`.
- A failed helpers request leaves the Shopify list working and shows no banner.
- `liquid-helpers.js` and every `*.liquid` file are unchanged.
