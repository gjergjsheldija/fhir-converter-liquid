# Result lineage

[Features](../features.md)

With debug on, a conversion records which `{% include %}` wrote each string or number in the FHIR result. Click that value in the result pane. The tooltip names the include.

![Clicking resourceType names the MessageHeader include](../images/result-lineage.png)

In that picture the click is `entry.0.resource.resourceType`, and the include is `Resource/_MessageHeader.liquid`.

## What is recorded

Templates write JSON text. While debug is on, the engine records the span of output written by each include. After the root template finishes, each string and number in the final resource is found in that text. The row keeps the innermost include whose span contains the value.

A row is `{outputPath, template, sourcePath}`. `outputPath` is the path in the FHIR result, such as `entry.0.resource.resourceType`. `template` is the include file. `sourcePath` is always empty.

The empty source path is deliberate. Debug scopes snapshot variable values when an include starts. They do not record which variable the include read. Matching a FHIR value to an HL7 field because the two strings are equal would guess, and that guess was wrong for almost every value that was tried. The tooltip therefore says **Template:** and the file name. It does not say which HL7 field or CDA node the value came from.

Clicking a value that no row covers shows **No source recorded**. The lookup uses the longest recorded path that is equal to the clicked path or is a prefix of it on a dot boundary.

## What debug off does

Debug off omits `debugInfo`, including `lineage`. The FHIR resource is the same either way. Lineage is not a property of the resource, and it is not sent to a FHIR server.
