# Spec 02: Guard WorkerPool concurrency and replace deprecated `module.register()`

**Status:** Done (2026-11-17). WorkerPool now defaults to 1 worker for `size = 0` (new unit test), both call sites pass `Math.max(1, os.cpus().length)`, and the test loader uses synchronous `module.registerHooks()` — `npm test` shows 361 passing / 109 known baseline failures, zero `module.register()` deprecation warnings, eslint and `git diff --check` exit 0.

## 1. Goal

Fix two runtime and test-harness issues found after the Node 26 migration:

1. Prevent `WorkerPool` from initializing with `0` worker threads in sandboxed shells or constrained containers where `os.cpus()` returns `[]`.
2. Replace `module.register()` with synchronous `module.registerHooks()` in the `templategenerate` test mock and remove dead logging imports so `npm test` runs on Node 26 without `DeprecationWarning: module.register() is deprecated`.

## 2. Current behavior

1. **Zero-worker hang when `os.cpus()` is empty:**
   - `src/routes.js` (line `47`) and `src/lib/message-broker/messaging-service.js` (line `11`) both instantiate `new WorkerPool("./src/lib/workers/worker.js", os.cpus().length)`.
   - `src/lib/workers/workerPool.js` loops `for (var i = 0; i < size; i++)`, leaving `this._workers = []` when `size` is `0`. On `exec()`, `this._rrIndex++ % 0` evaluates to `NaN`, `this._workers[NaN]` throws inside the `Promise` executor, and HTTP callers hang until mocha's `10000ms` timeout (`149` test timeouts in sandboxed environments, plus `Expected concurrency to be a number from 1 and up, got 0`).
2. **Deprecated `module.register()` and dead code in the test loader:**
   - `test/mocks/register-templategenerate-loader.mjs` calls `register("./templategenerate-loader.mjs", import.meta.url)` from `node:module`. On Node v26.13.0, every test run prints:
     `DeprecationWarning: module.register() is deprecated; use module.registerHooks()`
   - `test/mocks/templategenerate-loader.mjs` still contains unused `import { appendFileSync } from 'fs';` and `const log = '/tmp/loader_log.txt';`.

## 3. Files you may edit

- `src/lib/workers/workerPool.js`
- `src/lib/workers/workerPool.spec.js`
- `src/routes.js`
- `src/lib/message-broker/messaging-service.js`
- `test/mocks/register-templategenerate-loader.mjs`
- `test/mocks/templategenerate-loader.mjs`
- `src/routes.spec.js` (comment accuracy only, if referencing `register()` vs `registerHooks()`)

Do not add dependencies. Do not edit `*.liquid` files, sample messages, or expected JSON.

## 4. WorkerPool minimum concurrency

1. In `src/lib/workers/workerPool.js`, normalize `size` in `constructor(filename, size)`:
   ```javascript
   const workerCount = Math.max(1, Math.floor(Number(size)) || 1);
   ```
   and create `workerCount` workers in the loop.
2. In `src/routes.js` and `src/lib/message-broker/messaging-service.js`, pass `Math.max(1, os.cpus().length)` to `new WorkerPool(...)` so the intent is explicit at both call sites.
3. In `src/lib/workers/workerPool.spec.js`, add a unit test confirming `new WorkerPool(testWorkerFileName, 0)` spawns `1` worker, resolves `await pool.exec({TestOnly: 'msg1'})` to `'b'`, and cleans up with `pool.destroy()`.

## 5. Migrate the test mock hook to `module.registerHooks()`

Node 26 provides `registerHooks({ resolve, load })` in `node:module` with synchronous hooks `(specifier, context, nextResolve)` and `(url, context, nextLoad)`.

1. In `test/mocks/templategenerate-loader.mjs`:
   - Remove the unused `appendFileSync` import and `const log = '/tmp/loader_log.txt'`.
   - Export synchronous `resolve(specifier, context, nextResolve)` and `load(url, context, nextLoad)` functions (drop `async` so they satisfy `registerHooks` synchronous contract while preserving the exact `stubUrl` redirect and `{ ...context, shortCircuit: true }` behavior).
2. In `test/mocks/register-templategenerate-loader.mjs`:
   ```javascript
   import { registerHooks } from "node:module";
   import { resolve, load } from "./templategenerate-loader.mjs";

   registerHooks({ resolve, load });
   ```
3. Verify that importing `src/lib/ai/generateTemplate.js` and `test/mocks/templategenerate-stub.mjs` still returns the identical module instance (`===`), so `stub.__resetState()` controls what `POST /api/v1/templategenerate` sees without any network call.

## 6. How to check

Run:

```sh
npm run test:generate
npm test
npm run eslint
git diff --check
```

1. `npm run test:generate` passes every `POST /api/v1/templategenerate` and `src/routes.spec.js` test, with zero `DeprecationWarning: module.register()` output and zero `10000ms` route timeouts even in a sandboxed shell.
2. `src/lib/workers/workerPool.spec.js` passes, including the `size = 0` test.
3. `npm test` completes without timeouts and prints the real compatibility pass/fail counts.
4. `npm run eslint` and `git diff --check` exit `0`.

## 7. Acceptance criteria

- `new WorkerPool(file, 0)` creates `1` worker and processes tasks without hanging.
- Both `routes.js` and `messaging-service.js` use `Math.max(1, os.cpus().length)`.
- `npm test` and `npm run test:generate` emit no `module.register()` deprecation warning, and `templategenerate` tests still share one stub instance with `routes.js`.
- Unused `appendFileSync` and `/tmp/loader_log.txt` are removed from `templategenerate-loader.mjs`.
