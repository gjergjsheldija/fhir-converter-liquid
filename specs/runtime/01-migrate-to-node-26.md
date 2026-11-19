# Spec: Migrate the runtime to Node 26

**Status:** Implemented 2026-11-17 — open item: nyc coverage table is empty on Node 26 (pre-existing nyc 15 issue; §2/§7 forbid upgrading nyc). Deviations: §5 snippet's `pathToFileURL("./")` parent could not resolve the hook → `import.meta.url`; `mocha-junit-reporter` removed from `mocha.config.json` after the §4 stop condition (user-approved 2026-11-17); `mocha-multi-reporters` locked to 1.5.2 (within the declared `^1.5.1` range) because 1.5.1 cannot load under mocha 12. Implement this file only.

This is not a web UI spec. Do not implement anything under `specs/web-ui/`. Do not edit `*.liquid` files, sample messages, or expected JSON.

## 1. Goal

The app, the tests, and the Docker images run on Node 26. Node 26 is the current LTS line. This was checked on 17 Nov 2026 with `node -v` reporting `v26.13.0`.

`npm test` must start mocha. Today it does not, on this Node.

## 2. The failure, already reproduced

`package.json` has `"type": "module"`. The test script runs mocha 10.1.0:

```text
nyc node node_modules/mocha/bin/_mocha --reporter-options configFile=mocha.config.json --exit --timeout 10000
```

On Node 26.13.0 that process exits 1 before any spec loads:

```text
file://.../node_modules/yargs/yargs:3
const {applyExtends, cjsPlatformShim, Parser, Yargs, processArgv} = require('./build/index.cjs')
                                                                    ^
ReferenceError: require is not defined in ES module scope
Node.js v26.13.0
```

Cause, checked in the installed tree and on the npm registry:

- mocha 10.1.0 depends on yargs 16.2.0.
- yargs 16.2.0 has `"type": "module"` and an export `"./yargs"` whose `require` target is the extensionless file `./yargs`.
- That file calls `require()`.
- Node 26 loads that file through `loadESMFromCJS` because the package type is module, so `require` is not defined.

mocha 11 is not the fix. mocha 11.1.0 through 11.8.0 depend on yargs `^17.7.2`, and yargs 17.7.2 still exports `./yargs` to that same extensionless file.

mocha 12.0.3 does not depend on yargs. Its engines field is `^20.19.0 || >=22.12.0`, which includes Node 26 and excludes Node 18. Its only bin is `bin/mocha.js`. The `_mocha` bin is gone.

`nyc` 15.1.0 prints `15.1.0` on Node 26.13.0. `eslint` 8.20.0 prints `v8.20.0`. Do not upgrade either of those unless the command in section 8 crashes inside that tool.

## 3. Files you may edit

- `package.json`
- `package-lock.json`
- `Dockerfile`
- `.github/workflows/ci.yml`
- `README.md` (the Node badge only)
- `.node-version` (new file, one line)
- `test/mocks/templategenerate-loader.mjs`
- one new file `test/mocks/register-templategenerate-loader.mjs`
- comments in `src/routes.spec.js` that still say `--experimental-loader`, so they name the hook that actually runs

Do not edit application source under `src/lib/` except those comments. Do not add a dependency other than the mocha upgrade in section 4.

## 4. Upgrade mocha

In `package.json`, set the devDependency to the exact version `12.0.3`. Run `npm install` so `package-lock.json` updates. Do not hand-edit the lockfile.

Change both `test` and `test:generate` so they no longer execute `node_modules/mocha/bin/_mocha`. That path will not exist.

`bin/mocha.js` in mocha 12.0.3 is a wrapper. It parses argv, and when the argv contains Node flags it spawns a child. The npm scripts must not pass Node flags as mocha arguments. `--experimental-loader` moves to section 5 and must not remain in `NODE_OPTIONS` in a form that mocha treats as a reason to spawn. Coverage has to be collected from the same process nyc started. After the change, `npm test` must still print an nyc text table that includes files under `src/`. If the table is empty, mocha spawned a child and this step is not done. Read `node_modules/mocha/bin/mocha.js` and call `main()` in-process. The supported invocation is:

```text
nyc node node_modules/mocha/bin/mocha.js --reporter-options configFile=mocha.config.json --exit --timeout 10000
```

Use that if, and only if, the coverage table lists `src/` files. Keep `--exit` and `--timeout 10000`. Keep `NODE_ENV=testing` and `AI_OPENAI_API_KEY=test-mock-key`.

If mocha 12.0.3 refuses the existing `mocha` block in `package.json` (`mocha-multi-reporters`, `spec`, `slow`, `reporterOptions`), change only the keys mocha 12 rejects. The run must still print the spec reporter and must still write the junit file mocha writes today when that reporter is enabled. Do not delete `mocha-junit-reporter` or `mocha-multi-reporters` unless mocha 12 cannot load them. If they cannot load, stop and report the error. Do not replace the reporter stack with a different product.

## 5. Replace the loader flag

Node 26.13.0 still accepts `--experimental-loader` and prints:

```text
ExperimentalWarning: `--experimental-loader` may be removed in the future; instead use `register()`
```

Remove `--experimental-loader` from `NODE_OPTIONS` in `test` and `test:generate`.

Add `test/mocks/register-templategenerate-loader.mjs`:

```javascript
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./templategenerate-loader.mjs", pathToFileURL("./"));
```

Set `NODE_OPTIONS` to `--import ./test/mocks/register-templategenerate-loader.mjs` in both scripts.

Keep the redirect behavior of `templategenerate-loader.mjs`:

- A specifier that ends with `lib/ai/generateTemplate.js` loads `test/mocks/templategenerate-stub.mjs`.
- The test's import of the stub and the handler's dynamic import are the same module instance. `stub.__resetState()` in a test must change what the route handler sees.
- On a failed redirect, do not fall through to the real `generateTemplate.js` during `npm test`. The generate tests must not call a network AI API.

The hook in the file today is the old `resolve` / `load` shape, including `shortCircuit: true`. If `register()` on Node 26.13 rejects that shape, update the hook to the `register()` hook shape Node 26 documents. Preserve the URL remap. Delete the unused `appendFileSync` import only if you touch the file for the hook change. Do not write a loader log file.

Update the comments in `src/routes.spec.js` around the `POST /api/v1/templategenerate` block so they name `--import` and `register-templategenerate-loader.mjs` instead of `--experimental-loader`.

## 6. Pin Node 26

`package.json` `engines.node` is `>=18`. Set it to `>=26 <27`.

Add `.node-version` containing exactly:

```text
26
```

No extra lines.

`Dockerfile` uses `node:18-alpine` for `runner` and for `dev`. Change both to `node:26-alpine`. The `tester` stage stays `FROM dev`. Do not fix the `GIT_TAG` `sed` typo in the dev stage. It is not this migration.

`.github/workflows/ci.yml` matrix is `node-version: [18, 20, 22]`. Replace it with `[26]`. One job. Keep `npm ci`, `npm run eslint`, and `npm test`.

In `README.md`, change the Node badge from `node-%3E%3D18` to `node-26`. Leave the rest of the README alone.

## 7. What you must not do

- Do not patch `node_modules/yargs`.
- Do not add an npm override that aliases yargs.
- Do not keep Node 18 in CI. mocha 12.0.3 will not run there.
- Do not upgrade eslint, nyc, liquidjs, or antlr4 as part of making the suite green.
- Do not change conversion output to make a fixture pass.
- A failure inside `test/e2e-test/util/compare.js` on `Bundle.entry` is the known template-compat mismatch. Record the count. Do not edit templates or expected JSON to reduce it.

## 8. How to check

Run on Node 26. `node -v` must print `v26.*`.

```sh
node -v
npm test
npm run eslint
```

`npm test` must get past mocha startup. The yargs `require is not defined` error must be gone. The Node process must not print `ExperimentalWarning: --experimental-loader`.

The generate tests in `src/routes.spec.js` must pass, which is the check that the loader still redirects `generateTemplate.js` to the stub.

Then:

```sh
docker build --target tester .
```

The tester stage must use Node 26. `node -v` inside that build is enough to prove the base image. The build runs `npm test`. Report its pass and fail counts separately from the host run if they differ.

## 9. Acceptance criteria

- `engines.node` is `>=26 <27`, `.node-version` is `26`, both Docker stages use `node:26-alpine`, and CI tests Node 26 only.
- mocha is exactly 12.0.3, and `npm test` does not load yargs 16.
- The test script does not use `_mocha` or `--experimental-loader`.
- nyc still reports coverage for `src/`.
- The generate tests pass without a live AI call.
- `npm run eslint` exits 0.
- Pre-existing `Bundle.entry` fixture mismatches are reported and left unchanged.

## 10. Context note

After the commands in section 8, update the Node 26 sentence in `.agents/skills/fhir-template-compat/PROJECT_CONTEXT.md`. Replace the claim that the suite must be run under Node 20 because Node 26 breaks mocha and yargs. State the mocha version now in use and the Node version you ran. Do not rewrite the rest of that file.
