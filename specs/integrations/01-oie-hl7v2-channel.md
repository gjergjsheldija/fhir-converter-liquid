# Spec 01: Open Integration Engine channel for HL7 v2 to FHIR

**Status:** Done (2026-11-19). `integrations/oie/` channel XML and README added; focused test 4 passing, `node scripts/test-summary.mjs` 646 passing / 0 unexpected failures, eslint and `git diff --check` clean.

## 1. Goal

Add an Open Integration Engine channel file and a short README. The channel describes a TCP listener in OIE and an HTTP POST to this converter. The README shows the ACK whose MSA-2 is the inbound MSH-10. This server still has no TCP listener.

## 2. Current behavior

- There is no `integrations/` directory.
- `POST /api/v1/convert/hl7v2` in `src/routes.js` accepts a JSON body `{ srcData, template }` and returns the conversion result. It does not open a socket.
- `xml2js` `0.5.0` is already a dependency. Do not add another XML parser.
- Nothing in `src/` listens for MLLP or HL7 v2 TCP.

If a TCP or MLLP listener already exists under `src/`, stop and report the mismatch.

## 3. Files you may edit

- `integrations/oie/hl7v2-to-fhir.xml` (create)
- `integrations/oie/README.md` (create)
- `test/integrations/oie-channel.spec.js` (create)
- This spec's `**Status:**` line, the row in `specs/integrations/00-order.md`, and a bullet in `specs/ORDER.md`

Do not edit `src/**`, `package.json`, templates, samples, or official fixtures. Do not add a dependency. Do not add a listener, a port, or a new route.

## 4. Requirements

1. `integrations/oie/hl7v2-to-fhir.xml` is well-formed XML with this shape:
   - Root element `channel`.
   - Child `name` whose text is `hl7v2-to-fhir`.
   - A `sourceConnector` whose `transportName` text is `TCP Listener`.
   - A destination `connector` whose `transportName` text is `HTTP Sender`, with `host` `127.0.0.1`, `port` `2019`, `method` `post`, and `path` `/api/v1/convert/hl7v2`.
   - The destination description or a comment states that the POST body is JSON `{"srcData":"<raw HL7 v2>","template":"<root template>"}`.
2. `integrations/oie/README.md` says this Node server does not listen on TCP. It says OIE receives the HL7 v2 message and posts it to `http://127.0.0.1:2019/api/v1/convert/hl7v2`. It shows a two-segment ACK example whose MSA-2 value is the same control id as the inbound MSH-10, and it names the field `MSH-10`.
3. `test/integrations/oie-channel.spec.js` parses the XML with `xml2js` and asserts the name, the TCP Listener source, and the HTTP host, port, method, and path. It reads the README and asserts that it contains `MSH-10` and `MSA|AA|`. It does not open a socket and does not start the server.

## 5. Validation

```sh
npx mocha --no-package --no-config test/integrations/oie-channel.spec.js --exit --timeout 10000
node scripts/test-summary.mjs
```

The summary must show 0 unexpected failures. Official classification stays 132 pass / 0 count / 0 content. ESLint and `git diff --check` must pass. If the sandbox reports concurrency 0, rerun `node scripts/test-summary.mjs` outside the sandbox.

## 6. Acceptance criteria

- `integrations/oie/hl7v2-to-fhir.xml` parses as XML and names the TCP source and the convert HTTP destination.
- The README shows the ACK path with MSH-10.
- No TCP listener was added to this server.
- No Liquid template, sample, or official fixture was modified.
- Status, `specs/integrations/00-order.md`, and `specs/ORDER.md` say Done with the date.

## 7. Git

Branch from current `main`: `feat/integrations-01-oie-channel`. One commit, then a normal merge into `main` (no rebase, no amend). Push with `gh auth switch --user gjergjsheldija`, then `git push origin main`, then `gh auth switch --user gjergjsheldija-recare`. Do not force-push. Do not commit `docs/mappings/`, `opencode.json`, `relative_test.mjs`, or `scripts/omlx-swap.mjs`. Do not update git config and do not skip hooks. Include `specs/integrations/00-order.md` and this spec file in the commit.
