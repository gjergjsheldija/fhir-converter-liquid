# Spec 06: Open a GitHub project

**Status:** Done (2026-11-18). Implemented in `src/lib/browse/sources.js`, `src/lib/projects/openGithubProject.js`, and `POST /api/v1/projects/open-github`.

## 1. Goal

The server can read a project that lives on GitHub: the manifest when it exists, or a family detection that waits for confirmation. This spec does not create a repo, commit, or push.

## 2. Current behavior

`src/lib/browse/sources.js` `parseGithubRepo` accepts `owner/repo` or a `github.com` URL. `githubContentsUrl` calls `GET /repos/{owner}/{repo}/contents/{path}` with no `ref`. `readGithubFile` base64-decodes one file, at most 2_000_000 bytes. `listGithub` lists one directory.

The contents API returns one directory, not a recursive tree. The default branch is used when `ref` is omitted.

## 3. Files you may edit

- `src/lib/browse/sources.js`
- `src/lib/projects/openGithubProject.js` (new)
- `src/lib/projects/openGithubProject.spec.js` (new)
- `src/routes.js`
- `src/routes.spec.js`

Keep the existing browse functions working. Tests that hit the network must stub `fetch`. Do not call GitHub from the test run.

## 4. Ref

Extend `githubContentsUrl(owner, repo, path, ref)`. When `ref` is a non-empty string, append `?ref=` plus `encodeURIComponent(ref)`. When `ref` is empty or omitted, omit the query, which is today's URL.

`ref` may be a branch name, a tag, or a commit. Reject a `ref` that contains a space, a newline, or `..`. Return null from `githubContentsUrl` for those, and let the caller throw 400 `Invalid ref.`

Pass `ref` through `listGithub` and `readGithubFile` as an optional last argument. Existing callers that omit it stay on the default branch.

## 5. Request

`POST /api/v1/projects/open-github` with JSON:

```json
{
  "repo": "owner/rules",
  "ref": "main",
  "token": ""
}
```

`repo` uses `parseGithubRepo`. A bad repo is 400 `Enter a GitHub repo as owner/repo or a github.com URL.` `token` is optional and is sent only as the Authorization header, the same way browse does. Do not log the token. Do not write the token to disk.

`ref` may be `""` or omitted.

Steps:

1. `readGithubFile(repo, "fhir-converter.json", token, ref)`.
2. When the file exists, parse it and `validateManifest`. Success is 200 `{ "opened": true, "repo": "owner/rules", "ref": "<ref or empty>", "manifest": {} }`. Invalid JSON or an invalid manifest is 400 with the validation sentence. Do not write to GitHub.
3. When the file is 404, list the repo root. Look at entry names. If a directory `templates` exists, list `templates` too. Build the relative directory list from those two listings only. Do not walk the whole repo.
4. `detectFamilies` on that list. Empty detection is 404 `No HL7 v2 or C-CDA templates found.`
5. Otherwise 200 `{ "opened": false, "needsConfirm": true, "repo", "ref", "detected": ["hl7v2"] }`. Do not commit a manifest.

Confirm is a second post with `confirmFamilies`. The set must match a fresh detection. On match, build the same manifest spec 05 would write, using the repo name's basename as `name` (`rules` from `owner/rules`). Response 200 `{ "opened": true, "wroteManifest": false, "repo", "ref", "manifest" }`. `wroteManifest` is false because this spec does not commit. The caller holds the manifest. Spec 07 stores it in the browser.

A GitHub 401 or 403 becomes 400 `GitHub request failed with status N.` The existing browse error text stays for browse. This route uses that same sentence.

## 6. Tests

Stub `fetch` in `openGithubProject.spec.js`.

- A contents response for `fhir-converter.json` with a valid empty HL7 v2 manifest returns `opened: true`.
- A 404 on the manifest, then a root listing that includes `{ "name": "templates", "type": "dir" }`, then a templates listing that includes `{ "name": "Hl7v2", "type": "dir" }`, returns `needsConfirm: true` and `detected: ["hl7v2"]`.
- The request URL for `ref: "feature/adt"` contains `ref=feature%2Fadt`.
- `ref: "a b"` returns 400 and does not call `fetch`.
- Confirming the detected family returns `wroteManifest: false` and a manifest whose `name` is the repo name.

Then run `npm test` and `npm run eslint`.

## 7. Acceptance criteria

- Opening GitHub never creates a commit.
- Browse without a `ref` still calls the contents URL with no query string.
- A token is not written to a file and not included in a thrown Error message.
