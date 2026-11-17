# Spec 09: Name the conversion result, and confirm Copy and Send

**Status:** Done. Implemented in commit 60ecb55 (`conversionStatusLabel(resource)` in `src/static/js/template-editor.js` used on the convert success path and in `runGenerateTemplate` when a `fhirResource` fills the result editor, and the copy handler showing `Copied` for 2000ms and restoring the previous status only if it is still `Copied`; `sendToFhir` and spec 08's error callback are unchanged).

## 1. Goal

After a successful conversion, the result header says what was produced. Copy briefly says `Copied`. Send says `Sent` until the next conversion. A send failure does not clear the JSON.

## 2. Current behavior

On convert success, `template-editor.js` sets `#conversion-status` to the exact string `Converted`.

The copy button writes `outputCode.getValue()` with `navigator.clipboard.writeText`. Success changes nothing in the header. Failure calls `showConversionError('Could not copy the result.')`.

`sendToFhir` sets the status to `Sending…`, then `Sent` on HTTP success, or `Failed` plus `showConversionError` on failure. It does not clear the result. Keep that.

`runGenerateTemplate` sets the status to `Converted` when generation returns a resource. This spec changes that success label only when it also assigns `outputCode`. Use the same label helper so a generated Bundle is described the same way as a converted Bundle.

Spec 08 owns `#result-error` and clearing the result on convert failure. Do not change that error callback in this spec. If `#result-error` or `hideResultError` is missing, stop and report that spec 08 is not in the worktree.

## 3. Files you may edit

- `src/static/js/template-editor.js`

## 4. Status text

Add `conversionStatusLabel(resource)`:

1. If `resource` is an object, `resource.resourceType === 'Bundle'`, and `Array.isArray(resource.entry)`:
   - `entry.length === 1` returns `Converted · Bundle · 1 resource`
   - any other length, including 0, returns `Converted · Bundle · N resources` with N as a decimal number
2. Else if `resource` is an object and `typeof resource.resourceType === 'string'` and the string is non-empty, return `Converted · ` plus that string.
3. Else return `Converted`.

The separator is the one character `·` (U+00B7) with a space on each side. Do not use a hyphen, a slash, or an emoji.

On convert success, replace `$('#conversion-status').text('Converted')` with:

```javascript
$('#conversion-status').text(conversionStatusLabel(data.fhirResource));
```

In `runGenerateTemplate`, when `data.fhirResource !== undefined` and the result editor is set, set the status with `conversionStatusLabel(data.fhirResource)` instead of `Converted`. When `data.fhirResource` is `undefined`, set the status to `Converted`.

## 5. Copy

On a successful `writeText`, read the current `#conversion-status` text into `previous`. Set the status to `Copied`. After 2000ms, if the status text is still exactly `Copied`, set it back to `previous`. If a conversion changed the status during those two seconds, do not overwrite that newer text.

Do not change the failure branch. It still calls `showConversionError('Could not copy the result.')` and does not set the status to `Copied`.

Copying an empty result still copies the empty string and still shows `Copied`.

## 6. Send

Leave the success status as `Sent`. Do not append the resource type. The next convert request already sets `Converting…` before the request, which replaces `Sent`.

On send failure, keep `#conversion-status` as `Failed` and keep `showConversionError`. Do not call `outputCode.setValue('')`. Do not call `showResultError`.

When the FHIR base URL is missing or the result is not JSON, `sendToFhir` already calls `showConversionError` and returns before `Sending…`. Leave those two early returns as they are. Do not set the status to `Failed` for those two cases. The result JSON is still the last conversion.

## 7. How to check

1. Convert `ADT04-23.hl7` with `ADT_A04.liquid`. The status is `Converted · Bundle · N resources`, and N equals `JSON.parse(outputCode.getValue()).entry.length`.
2. Put a template that returns one Patient, if you have one. The status is `Converted · Patient`. If you do not have one, skip that check and say so.
3. Click Copy. The status becomes `Copied`, the clipboard contains the result text, and about two seconds later the Bundle label returns.
4. Start a conversion while `Copied` is showing. The status becomes `Converting…` and does not flip back to `Copied` when the timer fires.
5. Click Send with no FHIR base URL. `#conversion-error` says `Set a FHIR server in Settings.` The result JSON is still there. The status is not `Failed`.
6. Break the template so conversion fails. Spec 08 still clears the result and fills `#result-error`. This spec does not put `Converted ·` on that failure.

Then run `npm test` and `npm run eslint`.

## 8. Acceptance criteria

- A Bundle success label includes the entry count and the word `resource` or `resources`.
- Any other resource success label includes `resourceType`.
- Copy shows `Copied` for two seconds and then restores the previous status unless a newer status replaced it.
- Send success stays `Sent` until the next conversion. Send failure does not clear the result.
- Spec 08's failure path is unchanged.
