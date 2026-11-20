# Spec 03: Unmapped codes after the site pack

**Status:** Not started (2026-11-20). Follow `.agents/skills/spec-runner/SKILL.md`, `.agents/skills/test-baseline/SKILL.md`, and `AGENTS.md`. Do not start another gap spec in this change.

## 1. Goal

A local project conversion still rewrites Codings and identifier systems from the site pack. It also returns the Codings that no ConceptMap group matched, so an author can see which local codes are missing. The FHIR resource itself is unchanged aside from the rewrites the site pack already performs.

## 2. Current behavior

- `applySitePack` in `src/lib/projects/sitePack.js` returns a deep copy. A matching Coding gets `group.target` and the first target code. A non-matching Coding is left as it was. Nothing records that miss.
- `POST /api/v1/projects/convert` replaces `fhirResource` with that copy for a local project on status 200. GitHub results are unchanged.
- `identifiers.json` is unrelated to this list.

If the convert response already includes an unmapped list, stop and report the field name.

## 3. Files you may edit

- `src/lib/projects/sitePack.js` and `src/lib/projects/sitePack.spec.js`
- `src/routes.js` for `POST /api/v1/projects/convert` only, to attach the list
- `src/static/js/debug-drawer.js` to show the list in the Diagnostics panel
- This spec's `**Status:**` line, the row in `specs/gap/00-order.md`, and the bullet in `specs/ORDER.md`

Do not edit Liquid templates. Do not add a dependency. Do not change GitHub conversion. Do not write the list into the FHIR resource.

## 4. Requirements

1. `applySitePack` still returns the rewritten resource. Add `collectUnmapped(resource, pack)`, which walks the original resource before rewriting. A Coding is the same shape the site pack already uses: a plain object with string `system` and string `code` and no `resourceType`. Include it when no group matches. Return an array of `{system, code, path}` where `path` is a dot path from the resource root. The same system and code at two paths are two rows.
2. A pack with no ConceptMaps returns every Coding. A missing pack returns an empty array. Do not list identifiers.
3. The route, for a local project and status 200, sets `resultMsg.unmapped` to that array computed from the resource before `applySitePack`. GitHub responses omit `unmapped`. The FHIR resource is still the rewritten copy.
4. The Diagnostics panel lists `system | code` and the path when `unmapped` is present and non-empty. An empty array shows **No unmapped codes**. A response without the property leaves the panel as it is today.
5. Unit tests cover one mapped Coding, one unmapped Coding, and a pack with no maps. Assert the rewritten resource has no `unmapped` property.

## 5. Validation

```sh
npx mocha --no-package --no-config src/lib/projects/sitePack.spec.js --exit --timeout 10000
node scripts/test-summary.mjs
```

Official classification stays 132 pass / 0 count / 0 content. ESLint and `git diff --check` must pass.

## 6. Acceptance criteria

- Mapped Codings still change. Unmapped Codings stay in the resource and appear in `unmapped`.
- GitHub conversion is unchanged.
- Status, `specs/gap/00-order.md`, and `specs/ORDER.md` say Done with the date.

## 7. Git

Branch from current `main`: `feat/gap-03-unmapped-codes`. One commit, then merge into `main`. Push with `gh auth switch --user gjergjsheldija`, then `git push origin main`, then `gh auth switch --user gjergjsheldija-recare`. Do not force-push.
