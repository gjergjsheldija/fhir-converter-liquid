# Spec 09: Archive the OIE message under MSH-10

**Status:** Blocked (2026-11-20). The channel XML has no MSH-10 expression. The only variable is `${message.encodedData}` on the HTTP Sender. The ACK with MSA-2 is described in the README and is not a channel mapping. Do not invent a File Writer expression. A later spec must add the control-id mapping to the channel before this archive can reuse it.

## 1. Goal

The Open Integration Engine channel still receives HL7 v2, posts it to this server, and ACKs with the inbound MSH-10 in MSA-2. It also writes the raw message to a file whose name is that control id. This server does not gain a TCP listener.

## 2. Current behavior

- `integrations/oie/hl7v2-to-fhir.xml` has a TCP Listener source and an HTTP Sender destination to `http://127.0.0.1:2019/api/v1/convert/hl7v2`.
- `integrations/oie/README.md` shows the ACK. It does not archive the message.
- `test/integrations/oie-channel.spec.js` parses the channel with `xml2js` and asserts the destination URL and the ACK mapping.
- No code under `src/` listens on TCP.

If the channel already has a file destination, stop and report its path.

## 3. Files you may edit

- `integrations/oie/hl7v2-to-fhir.xml`
- `integrations/oie/README.md`
- `test/integrations/oie-channel.spec.js`
- This spec's `**Status:**` line, the row in `specs/gap/00-order.md`, and the bullet in `specs/ORDER.md`

Do not edit `src/**`. Do not add a dependency. Do not add a TCP listener.

## 4. Requirements

1. Add a File Writer destination. The directory is `archive` relative to the OIE data directory. The file name is the inbound MSH-10 plus `.hl7`. Use the channel's existing message-variable syntax for MSH-10; the same expression the ACK uses for MSA-2 is the one to reuse. Do not invent a second control-id mapping.
2. The HTTP Sender and the ACK behavior stay. The File Writer does not replace them.
3. The README shows the archive path and states that this Node server still does not listen on TCP.
4. The existing test still passes. Extend it to assert a file destination whose name contains the same control-id expression as MSA-2, and to assert that no file under `src/` is part of this change.
5. If the current channel XML has no variable for MSH-10 that a File Writer can use, stop and report the destination XML. Do not guess a new expression.

## 5. Validation

```sh
npx mocha --no-package --no-config test/integrations/oie-channel.spec.js --exit --timeout 10000
node scripts/test-summary.mjs
```

Official classification stays 132 pass / 0 count / 0 content. ESLint and `git diff --check` must pass.

## 6. Acceptance criteria

- The channel still posts to `/api/v1/convert/hl7v2` and still puts MSH-10 in MSA-2.
- A file destination writes `archive/<MSH-10>.hl7`.
- No file under `src/` changed.
- Status, `specs/gap/00-order.md`, and `specs/ORDER.md` say Done with the date.

## 7. Git

Branch from current `main`: `feat/gap-09-oie-archive`. One commit, then merge into `main`. Push with `gh auth switch --user gjergjsheldija`, then `git push origin main`, then `gh auth switch --user gjergjsheldija-recare`. Do not force-push.
