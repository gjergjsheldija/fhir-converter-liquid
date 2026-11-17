# Spec 12: Split settings into editor and FHIR server

**Status:** Done. Implemented in commit 5af1a4d (settings modal body in `src/static/index.html` now two `settings-group` fieldsets, `Editor` with the timezone help sentence and `FHIR server` with the storage help sentence and the five unchanged FHIR controls; `<hr>`/`<h5>` removed; API docs link moved to the navbar as `#api-docs-link`; `#settings-save-button` is `btn btn-dark`; `.settings-group` CSS added in `src/static/css/template-editor.css`; all input ids and localStorage keys unchanged).

## 1. Goal

Settings has two labeled groups: how the editor behaves, and where Send posts. The timezone field says what to type. The FHIR group says the values stay in this browser. API docs moves to the navbar. Save looks like a button.

The stored keys do not change.

## 2. Current behavior

`#settings-modal` in `index.html` is one body: Dark mode, Convert while typing, Timezone with placeholder `+0000`, a horizontal rule, an `h5` "FHIR server", Base URL, Authentication, Token, Username, Password, then `<a href="/api-docs">API docs</a>`. The footer button is `btn btn-default` with label `Save` and `data-dismiss="modal"`.

`show.bs.modal` copies `currentEditorSettings` into those inputs. Save writes back:

- `darkMode`
- `convertWhileTyping`
- `timezone` from the input, not trimmed today
- `fhirBaseUrl` trimmed
- `fhirAuth`, `fhirToken`, `fhirUsername`, `fhirPassword`

`setSettings` stores the object in `localStorage` under `fhirConverterSettings`. `showFhirAuthFields` shows `#settings-fhir-token-row` for `bearer` and the username and password rows for `basic`. None hides all three. Keep that.

The navbar is the brand text, `#convert-button`, and `#settings-open`. There is no API docs link in the navbar.

## 3. Files you may edit

- `src/static/index.html`
- `src/static/css/template-editor.css`

Do not edit `template-editor.js`. Do not rename an input id. Do not add or remove a `localStorage` key.

## 4. Navbar

After `#settings-open`, add:

```html
<a class="btn btn-outline-dark navbar-btn ml-2" id="api-docs-link" href="/api-docs">API docs</a>
```

Remove the `<a href="/api-docs">API docs</a>` from the modal body.

## 5. Modal body

Replace the contents of `.modal-body` with two fieldsets. Keep every existing input id.

```html
<fieldset class="settings-group">
    <legend>Editor</legend>
    <div class="form-check">
        <input class="form-check-input" type="checkbox" id="settings-dark-mode">
        <label class="form-check-label" for="settings-dark-mode">Dark mode</label>
    </div>
    <div class="form-check">
        <input class="form-check-input" type="checkbox" id="settings-convert-while-typing" checked>
        <label class="form-check-label" for="settings-convert-while-typing">Convert while typing</label>
    </div>
    <div class="form-group mt-3">
        <label for="settings-timezone">Timezone</label>
        <input type="text" class="form-control" id="settings-timezone" placeholder="+0000">
        <small class="form-text text-muted" id="settings-timezone-help">Offset sent with each conversion. Example: +0200. Leave empty to use the server default.</small>
    </div>
</fieldset>
<fieldset class="settings-group">
    <legend>FHIR server</legend>
    <small class="form-text text-muted" id="settings-fhir-help">Used only when you click Send. Stored in this browser.</small>
    <!-- Base URL, Authentication, Token, Username, and Password groups, unchanged, including their ids and the hidden rows -->
</fieldset>
```

Copy the five FHIR controls from the current modal without changing their ids, labels, placeholders, `autocomplete`, or option values. Token, username, and password rows keep the ids `settings-fhir-token-row`, `settings-fhir-user-row`, and `settings-fhir-password-row`.

```css
.settings-group {
    border: 0;
    padding: 0;
    margin: 0 0 16px;
}

.settings-group legend {
    font-size: 14px;
    font-weight: 650;
    margin: 0 0 8px;
    padding: 0;
}
```

Remove the `<hr>` and the `<h5>FHIR server</h5>`. The legend replaces the heading.

## 6. Save button

Change `#settings-save-button` from `btn btn-default` to `btn btn-dark`. Keep the label `Save`, the id, and `data-dismiss="modal"`.

`setColorTheme` already swaps `btn-dark` and `btn-light` on this button. Leave that function alone. In light mode the button is dark. In dark mode the existing theme code turns it light. That is acceptable for this spec.

## 7. How to check

1. The navbar has an API docs link. It goes to `/api-docs`. The settings body has no API docs link.
2. Settings shows the legend `Editor` and the legend `FHIR server`. Timezone help reads `Offset sent with each conversion. Example: +0200. Leave empty to use the server default.` FHIR help reads `Used only when you click Send. Stored in this browser.`
3. Authentication `None` hides token, username, and password. `Bearer token` shows token only. `Basic` shows username and password.
4. Set timezone to `+0200`, base URL to `https://example.test/fhir`, click Save, reload, and reopen Settings. Both values are still there. `localStorage` key `fhirConverterSettings` still parses as one JSON object with the same keys as before this change.
5. Dark mode and Convert while typing still save and still take effect. Dark mode still calls the existing theme function. Convert while typing still gates `convertData`.
6. The Save button is visibly a button, with class `btn-dark` in light mode.

Then run `npm test` and `npm run eslint`.

## 8. Acceptance criteria

- The modal is two fieldsets, Editor and FHIR server, with the help sentences in section 5.
- API docs is in the navbar and not in the modal.
- Input ids and stored keys are unchanged.
- Auth rows still show and hide as they do now.
