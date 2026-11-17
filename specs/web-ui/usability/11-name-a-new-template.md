# Spec 11: Name a new template in the header

**Status:** Done. Implemented in commit 68b4f09 (`#new-template-form` input plus Create/Cancel in the template pane header in `src/static/index.html` with the spec's CSS in `src/static/css/template-editor.css`; `src/static/js/template-editor.js` now opens the form from New, cancels on Cancel/Escape — clearing the conversion error only if it is one of the three name errors — creates on Create/Enter, and `createNewTemplate` reads `#new-template-name` with the same four validation rules and `.liquid` suffix, no `window.prompt` remaining).

## 1. Goal

New asks for the template name in the template header. The validation stays the validation in `createNewTemplate` today. This spec does not open included partials. Spec 15 owns that panel and the double-click opener. Do not add a second one here.

## 2. Current behavior

`#new-template-button` calls `createNewTemplate`. That function uses `window.prompt('Template name')`.

The rules, in order, are:

1. Cancel, `prompt` returns `null`: return, no error.
2. Trim. Empty: `showConversionError('Enter a template name.')` and return.
3. If the name does not end with `.liquid`, append `.liquid`.
4. If the name contains `..`, contains `\`, or starts with `/`: `showConversionError('Invalid template name.')` and return.
5. If `templateNames` contains the name, or any `openTemplates` entry has that name: `showConversionError('A template with that name already exists.')` and return.
6. Otherwise `hideConversionError()` and `openLocalTemplate(name, '', true)`.

`openLocalTemplate` with `dirty === true` sets `currentTemplateReference[name]` to `null`, so the new tab is dirty. Spec 10 shows the dot and the solid Save button from that. Do not pass `false`.

## 3. Files you may edit

- `src/static/index.html`
- `src/static/css/template-editor.css`
- `src/static/js/template-editor.js`

Do not edit `editor-tabs.js`, `hdc-hint.js`, or `getPartialTemplateNameLocation`. Do not add `#included-panel`. That is spec 15.

## 4. Markup

In the template pane header, immediately after `#new-template-button`, add:

```html
<span id="new-template-form" hidden>
    <input id="new-template-name" class="form-control form-control-sm" type="text" placeholder="Name, .liquid optional" aria-label="Template name">
    <button type="button" class="btn btn-sm btn-dark" id="new-template-create">Create</button>
    <button type="button" class="btn btn-sm btn-outline-dark" id="new-template-cancel">Cancel</button>
</span>
```

```css
#new-template-form {
    display: inline-flex;
    align-items: center;
    gap: 4px;
}

#new-template-form[hidden] {
    display: none;
}

#new-template-name {
    width: 180px;
}
```

The form sits in the header row. Generate and Save stay visible. Do not hide them while the form is open.

## 5. Behavior

`#new-template-button` no longer calls `createNewTemplate` directly. It removes `hidden` from `#new-template-form`, hides `#new-template-button`, clears the input, and focuses the input.

`#new-template-cancel` and Escape while the input is focused reverse that: hide the form, clear the input, show the New button, and call `hideConversionError()` only if the visible `#conversion-error` text is `Enter a template name.`, `Invalid template name.`, or `A template with that name already exists.` Do not hide a conversion error that says something else.

`#new-template-create` and Enter in the input call `createNewTemplate`. Enter calls `preventDefault` so the page does not submit a form. There is no `<form>` element.

Rewrite `createNewTemplate` so it reads `$('#new-template-name').val()` instead of `window.prompt`. There is no `null` cancel value from the input. An empty trim still shows `Enter a template name.` and leaves the form open.

On each validation error, leave the form open and leave the typed text in the input.

On success, after `openLocalTemplate`, hide the form, clear the input, and show the New button.

Keep every validation rule in section 2, including the automatic `.liquid` suffix. `notes` becomes `notes.liquid`. `notes.liquid` stays `notes.liquid`. `../x.liquid` is invalid. `Resource/Note.liquid` is a legal name: it contains a single `/`, which the current checks allow. Do not add a new ban on `/`.

Do not call `window.prompt` anywhere in `template-editor.js` after this change.

Spec 10 owns the Save button classes and `.tab-dirty`. A successful create goes through `openLocalTemplate(name, '', true)`, so the new tab is dirty. Do not set the Save classes yourself in this spec.

## 6. How to check

1. Click New. A prompt dialog does not appear. The input is focused and New is hidden.
2. Click Cancel. The input hides and New returns. No tab was added.
3. Press Escape with the input focused. Same as Cancel.
4. Create with an empty input. `#conversion-error` says `Enter a template name.` The form stays open.
5. Enter `My Note`. A tab `My Note.liquid` opens, the form closes, and the template editor is empty. If spec 10 is present, that tab shows the dirty dot and Save is solid.
6. Click New again and enter `My Note`. The error is `A template with that name already exists.` The existing tab stays.
7. Enter `../secret`. The error is `Invalid template name.`
8. Double-click behavior in the template editor is unchanged from before this spec.

Then run `npm test` and `npm run eslint`.

## 7. Acceptance criteria

- New uses the header input. `window.prompt` is not called.
- The four validation outcomes and the `.liquid` suffix match section 2.
- Success opens an empty dirty tab through `openLocalTemplate` and closes the form.
- This change does not add an include list, a chip, or a new click handler for `{% include %}`.
