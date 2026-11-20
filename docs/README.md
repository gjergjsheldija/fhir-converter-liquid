# Documentation

This FHIR Converter uses **Liquid templates** for HL7v2 to FHIR R4 conversion.

## Contents

* [Converting data](convert-data-concept.md) - Conceptual guide for data conversion
* [API summary](api-summary.md) - Available REST API endpoints
* [Web UI summary](web-ui-summary.md) - Browser-based template editor
* [Features](features.md) - C-CDA projects, validate, conditional send, site pack, the project CLI, and the OIE channel
* [HL7v2 field maps](field-maps.md) - One table per message, plus a FHIR ConceptMap, with an ADT A47 sample

## Templates

The converter ships with Microsoft's open-source Liquid templates for HL7v2 message types (ADT, ORM, ORU, etc.) in `src/templates/Hl7v2/`.

Liquid template syntax: https://shopify.github.io/liquid/
