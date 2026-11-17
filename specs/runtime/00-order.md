# Runtime specs

These specs cover Node.js runtime, worker-thread, and test-harness behavior. They do not change web UI markup or Liquid conversion semantics.

## Rules

1. Implement one numbered spec per change.
2. Edit only the files listed in the selected spec.
3. Do not edit `*.liquid` files, sample messages, or expected JSON fixtures.
4. Run `npm test`, `npm run eslint`, and `git diff --check`, and report exact counts.
5. Do not commit unless the user explicitly asks.

## Order

| Spec | Status | File | What it changes |
| --- | --- | --- | --- |
| 01 | Done | `01-migrate-to-node-26.md` | Node 26 (`>=26 <27`), mocha 12.0.3, `--import` loader hook, Docker `node:26-alpine`, CI matrix `[26]`. |
| 02 | Done | `02-worker-pool-and-loader-cleanup.md` | Guard `WorkerPool` against `0` reported CPUs (`os.cpus().length === 0`) and migrate the test loader from deprecated `module.register()` to `module.registerHooks()`. |
