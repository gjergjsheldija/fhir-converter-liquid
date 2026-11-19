# Integration specs

These specs add files an external engine can import. They do not add a TCP listener to this server.

## Rules

1. Implement one numbered spec per change.
2. Edit only the files listed in the selected spec.
3. Do not edit `*.liquid` files, sample messages, or expected JSON fixtures.
4. Do not add a dependency.
5. Do not commit unless the user explicitly asks.

## Order

| Spec | Status | File | What it changes |
| --- | --- | --- | --- |
| 01 | Done | `01-oie-hl7v2-channel.md` | Open Integration Engine channel XML and README. No TCP listener in this server. |
