# Spec 13: Explain GitHub and Folder

**Status:** Done. Implemented in commit 2f3705f (`#github-help` and `#folder-help` exact-sentence paragraphs as first children of `#source-github` and `#source-folder` in `src/static/index.html`, `.source-help` CSS in `src/static/css/template-editor.css`; placeholders, browse request bodies, and token handling unchanged).

## 1. Goal

The GitHub and Folder forms say what to type before the user asks the server to list files. The requests themselves do not change.

## 2. Current behavior

`#source-github` contains `#github-repo` (placeholder `owner/repo`), `#github-token` (placeholder `Token, optional`, `type="password"`), and `#github-list`.

`#source-folder` contains `#folder-path` (placeholder `/path/to/folder`) and `#folder-list`.

`loadExternal` in `file-browser.js` POSTs to `/api/v1/browse/github` or `/api/v1/browse/folder`. The GitHub body is `{repo, path, token}`. The folder body is `{path}`. `openExternalFile` adds `file: true`. Do not change those bodies, URLs, or the click handlers.

The app is often run in Docker. A path typed here is read by the server process. A Mac path such as `/Users/me/templates` is not the path inside the container unless that directory is mounted there. The help text has to say that. Do not try to detect Docker in JavaScript.

The token is sent to this app in the POST body so the server can call GitHub. It is not written to `localStorage` by the current code. Do not start storing it.

## 3. Files you may edit

- `src/static/index.html`
- `src/static/css/template-editor.css`

Do not edit `file-browser.js` or server browse code.

## 4. Copy

As the first child of `#source-github`, before the repo input:

```html
<p class="source-help" id="github-help">Repository as owner/name. The token is optional. It is sent to this app so it can list private files. It is not stored on the server.</p>
```

As the first child of `#source-folder`, before the path input:

```html
<p class="source-help" id="folder-help">Path on the machine running this server. In Docker that is the path inside the container, not the path on your computer.</p>
```

Those two sentences are exact.

```css
.source-help {
    font-size: 12px;
    color: #667085;
    margin: 0;
}
```

The panels already use `display: flex` and `gap: 6px`, and they are `hidden` until that source is selected. A paragraph inside the panel shows and hides with the panel. Do not change `setBrowseSource`.

Placeholders stay `owner/repo`, `Token, optional`, and `/path/to/folder`.

## 5. How to check

1. Click GitHub. The help sentence is visible above the repo field. Click Built-in. The GitHub panel, including the help, is hidden.
2. Click Folder. The Docker sentence is visible above the path field.
3. List a repo. The request is still `POST /api/v1/browse/github` with `repo`, `path`, and `token`. List a folder. The request is still `POST /api/v1/browse/folder` with `path`.
4. Reload. The token field is empty. Nothing new was written to `localStorage`.

Then run `npm test` and `npm run eslint`.

## 6. Acceptance criteria

- GitHub and Folder each show the sentence in section 4, and only while that source is selected.
- Browse requests, placeholders, and token storage are unchanged.
