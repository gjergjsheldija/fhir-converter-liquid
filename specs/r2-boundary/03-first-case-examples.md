# Spec 03: First-Case Synthetic Examples

**Status:** Done (2026-11-27). Verified: `npm run examples:build` generates all 6 synthetic examples and `src/lib/customers/r2Examples.spec.js` passes (2/2, zero drift). Follow `AGENTS.md`, `specs/r2-boundary/00-order.md`, and `.agents/skills/spec-runner/SKILL.md`.

## 1. Goal

Provide concrete, reproducible, 100% synthetic HL7 v2 → FHIR input/output pairs under `docs/r2-contract/examples/` for one synthetic patient and one hospital stay, generated through the `customers/example-hospital` inbound pipeline so R2 can build and test against real service output without drift.

## 2. Current behavior

- `customers/example-hospital/` has `config.yaml` and `input/ADT_A01.liquid` (no custom inbound templates for `ADT_A08`, `MDM_T02`, or `ADT_A03`, which fall back to built-in `src/templates/Hl7v2/` templates because `defaults.fallbackToBuiltin: true`).
- There are no generated end-to-end R2 boundary example fixtures or drift checks.

## 3. Files you may edit

- `specs/r2-boundary/00-order.md`
- `specs/r2-boundary/03-first-case-examples.md`
- `specs/ORDER.md`
- `docs/r2-contract/examples/**` (`01-admit`, `02-update`, `03-document`, `04-discharge`, `05-duplicate`, `06-rejected`)
- `scripts/build-r2-examples.mjs`
- `src/lib/customers/r2Examples.spec.js`
- `package.json` (add `"examples:build"` script)

Never edit `src/templates/**`, `src/sample-data/**`, or `test/e2e-test/liquid-fixtures/**`.

## 4. Requirements

1. Six folders under `docs/r2-contract/examples/`, each with `input.hl7`, generated `output.json`, and a short `README.md`:
   - `01-admit`: `ADT^A01` for synthetic patient `MUSTER^MAX` (`SYN-MRN-0001`, visit `SYN-VISIT-1001`).
   - `02-update`: `ADT^A08` for the same patient and visit with one changed demographic field (address). Note fallback to built-in `ADT_A08.liquid`.
   - `03-document`: `MDM^T02` for the same visit carrying a small synthetic Base64 PDF (`OBX-5` `ED`) → `DocumentReference`. Note fallback to built-in `MDM_T02.liquid`.
   - `04-discharge`: `ADT^A03` for the same visit. Note fallback to built-in `ADT_A03.liquid`.
   - `05-duplicate`: `01-admit` re-sent with the same `MSH-10` (`SYN-MSG-0001`). Show the generated bundle and explain in `README.md`, based on conditional create keys, what R2 should end up with.
   - `06-rejected`: a malformed message (missing `MSH` and `PID-3`). Show the actual HTTP `400` FHIR `OperationOutcome` error response from the customer inbound route.
2. Add `scripts/build-r2-examples.mjs` and `"examples:build": "node scripts/build-r2-examples.mjs"` in `package.json` to regenerate every `output.json` deterministically from its `input.hl7`.
3. Add `src/lib/customers/r2Examples.spec.js` that runs `scripts/build-r2-examples.mjs --check` and fails if any committed `output.json` differs from regenerated output.

## 5. Validation

```sh
npm run examples:build
env NODE_ENV=testing AI_OPENAI_API_KEY=test-mock-key NODE_OPTIONS="--import ./test/mocks/register-templategenerate-loader.mjs" npx mocha --no-package --no-config src/lib/customers/r2Examples.spec.js --exit --timeout 10000
node scripts/test-summary.mjs
```

## 6. Acceptance criteria

- All 6 folders exist with synthetic `input.hl7`, generated `output.json`, and `README.md`.
- `03-document/output.json` contains a `DocumentReference` carrying the synthetic Base64 PDF.
- `06-rejected/output.json` contains the actual `OperationOutcome` error response.
- `r2Examples.spec.js` passes and fails if any committed `output.json` drifts.
- Zero immutable template/sample/fixture files modified.
