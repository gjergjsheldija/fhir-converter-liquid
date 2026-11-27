# Spec 05: Sequence Diagrams & Ownership Flows

**Status:** Done (2026-11-27). Deliverable `docs/r2-contract/flows.md` created with top-level ownership overview + 5 Mermaid sequence diagrams aligned with `docs/r2-contract/mapper-to-r2.md` and current code. No code changes.

## 1. Goal

Provide visual Mermaid sequence diagrams (`docs/r2-contract/flows.md`) showing hop ownership (Interop vs R2) and end-to-end message flows across HIS (simulator), Interop gateway, Mapper (this service), and R2 bundle API, clearly marking proposed steps with `(proposed)`.

## 2. Current behavior

- `docs/r2-contract/mapper-to-r2.md` defines Today vs Proposed HTTP/FHIR boundary behavior.
- No visual ownership or sequence flow diagrams exist under `docs/r2-contract/`.

## 3. Files you may edit

- `specs/r2-boundary/00-order.md`
- `specs/r2-boundary/05-sequence-diagrams.md`
- `specs/ORDER.md`
- `docs/r2-contract/flows.md`

No code changes.

## 4. Requirements

`docs/r2-contract/flows.md` must include:
1. Top-level overview diagram showing ownership of each hop (Hospital/HIS, Interop team vs R2 team; Mapper runs in R2 cluster, stateless, no broker).
2. Sequence diagram 1 — **Success**: HL7 v2 → Interop gateway → Mapper (`customerId` in route, `X-Request-Id`/`traceparent`) → R2 transaction → `transaction-response` → HTTP 200 → ACK `AA`.
3. Sequence diagram 2 — **Duplicate**: same `MSH-10` again → `Idempotency-Key` (proposed) + conditional create matches → 0 new resources → HTTP 200 → ACK `AA`.
4. Sequence diagram 3 — **Rejected**: R2 returns `422` → Mapper returns `OperationOutcome` → Interop gateway sends terminal NACK (`AE`) and does not retry (noting Today collapses R2 `422` to HTTP `400`).
5. Sequence diagram 4 — **R2 unavailable**: `5xx` / timeout → retry ownership (mapper vs gateway, open question), backoff, and what happens after the gateway's 14-day retention window (open question, `R2-1968`).
6. Sequence diagram 5 — **Outbound (later phase, proposed)**: R2 → Mapper `/outbound` with `customerId` and full FHIR payload → `MDM^T02` → Interop gateway → HIS → `MSA` ACK (`R2-1969`).
7. Mark all proposed steps with `(proposed)` and verify Mermaid syntax/rendering if `mmdc` or an equivalent tool is available (or report if unavailable).

## 5. Validation

- Check `mmdc` availability; render or syntax-check all Mermaid blocks.
- `git diff --check`
- Full validation (`node scripts/test-summary.mjs`) after all specs in this batch.

## 6. Acceptance criteria

- `docs/r2-contract/flows.md` contains the ownership overview + all 5 sequence diagrams with `(proposed)` markers and open questions aligned with `docs/r2-contract/mapper-to-r2.md`.
- Status updated in this spec, `specs/r2-boundary/00-order.md`, and `specs/ORDER.md`.
