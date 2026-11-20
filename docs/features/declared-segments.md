# Declared segments

[Features](../features.md)

A local HL7 v2 project can name the segment ids it accepts. The file is `structures/segments.txt` at the project root, one id per line.

```text
# ADT A01
MSH
PID
PV1
```

Blank lines are ignored. A line whose first non-space character is `#` is a comment. Other lines are trimmed and kept as written. Comparison with the message is case-sensitive, so `pid` does not allow `PID`.

## When the check runs

The file is read for a local project conversion. A missing file turns the check off. An empty file turns it on and allows nothing, so every segment except `MSH` is reported.

The report is produced only when debug is on, and only for HL7 v2. It is `debugInfo.undeclaredSegments`: the distinct segment ids from the message that are not in the file, in the order of their first appearance. `MSH` is never reported. A repeated extra segment is listed once.

Conversion does not fail because a segment is missing from the list. The template still runs, and the FHIR result is unchanged. C-CDA projects and GitHub projects skip the check. The project CLI does not pass the list, so a command-line conversion does not report undeclared segments.
