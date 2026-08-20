// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

// Ports Microsoft's DotLiquid-native access tracking (Hl7v2Component.cs / Hl7v2Field.cs's
// `Drop.this[object index]` indexer, which sets IsAccessed=true as a side effect of every
// property read) to liquidjs, which has no equivalent language feature. Uses ES6 Proxy `get`
// traps instead -- verified directly against liquidjs's parseAndRender that both dot-path
// (`field.Value`) and array-index (`arr[0].Value`) access patterns are reliably intercepted.
//
// Report shape intentionally does NOT match upstream's UnusedHl7v2Component (which uses
// character Start/End offsets); it matches this project's own established API contract instead
// (index-based, see src/routes.spec.js) -- only the underlying "is this unused" determination is
// ported from upstream, not the wire format.

const ACCESSIBLE_COMPONENT_KEYS = new Set(['Value', 'Subcomponents']);
const ACCESSIBLE_FIELD_KEYS = new Set(['Value', 'Repeats']);

function isIndexKey(prop) {
    return typeof prop === 'string' && /^\d+$/.test(prop);
}

function trackComponent(component) {
    if (component === null || component === undefined) return component;
    component._accessed = false;
    // Capture the raw value now, off the plain (not-yet-proxied) object, so
    // buildUnusedSegmentsReport can read it back later without going through the `get` trap
    // below -- reading `.Value` there would itself count as an access and mark every reported
    // (i.e. still-unused) component as accessed as a side effect of merely reporting it.
    component._rawValue = component.Value;
    return new Proxy(component, {
        get(target, prop, receiver) {
            if (ACCESSIBLE_COMPONENT_KEYS.has(prop) || isIndexKey(prop)) {
                target._accessed = true;
            }
            return Reflect.get(target, prop, receiver);
        }
    });
}

// Wraps every component reachable from `instance` -- an array-like field-instance object
// (hl7v2FieldModel.js's buildFieldInstance/buildAtomicField output) that has its own numeric
// slots 0..N AND a separate `.Components` array holding the SAME element references, only at
// construction time (`instance = components.slice()` is a reference copy into a brand-new
// array object, not the same array as `.Components`). Mutates both arrays' numeric slots in
// place -- rather than reassigning the `.Components` property to a new array -- so every
// existing alias to the original component objects (including ones this function doesn't know
// about directly) ends up resolving to the same tracked proxy. Real templates read fields via
// plain numeric index (segmentFilters.getFirstSegments returns the raw segment/field objects,
// and templates do `firstSegments.MSH.4.1`), not only through `.Components`, so both paths must
// reach the identical proxy instance for tracking to have any effect on real conversions.
function trackInstanceComponents(instance) {
    const tracked = instance.Components.map(trackComponent);
    for (let k = 0; k < tracked.length; k++) {
        instance.Components[k] = tracked[k];
        instance[k] = tracked[k];
    }
    return tracked;
}

function trackField(field) {
    if (field === null || field === undefined) return field;

    // `field`, `field.Repeats[0]`, and `field.Components` are three separate array objects in
    // hl7v2FieldModel.js's construction (each built via an independent array.slice() call that
    // only copies element REFERENCES at that moment) -- except `field.Components` and
    // `field.Repeats[0].Components` ARE the same object (assigned by reference in buildField),
    // so tracking through field.Repeats[0] (via trackInstanceComponents) already updates
    // field.Components too. field's own numeric slots are a genuinely separate array and need
    // their own explicit sync. Atomic MSH.1/MSH.2 fields have no Repeats at all, so `field`
    // itself is the only "instance" to track in that case.
    const hasRepeats = field.Repeats.length > 0;
    const trackedComponents = hasRepeats
        ? trackInstanceComponents(field.Repeats[0])
        : trackInstanceComponents(field);

    for (let k = 0; k < trackedComponents.length; k++) {
        field[k] = trackedComponents[k];
    }

    // Further repetitions (i >= 1) hold genuinely independent HL7 data with their own
    // Components array, not shared with field/field.Repeats[0] -- track each one separately.
    for (let i = 1; i < field.Repeats.length; i++) {
        trackInstanceComponents(field.Repeats[i]);
    }

    return new Proxy(field, {
        get(target, prop, receiver) {
            if (ACCESSIBLE_FIELD_KEYS.has(prop)) {
                for (const c of trackedComponents) {
                    if (c !== null && c !== undefined) c._accessed = true;
                }
            }
            return Reflect.get(target, prop, receiver);
        }
    });
}

export function trackAccess(parsedModel) {
    const data = parsedModel.data.map((segment) => {
        // segment.Fields is a separate array object from `segment` itself (same construction
        // pattern as above: segment = fields.slice()), so both need their numeric slots synced
        // to the same tracked field proxy -- getFirstSegments returns `segment` directly and
        // real templates index into it by plain field number (`firstSegments.MSH.7`).
        for (let j = 0; j < segment.Fields.length; j++) {
            const trackedField = trackField(segment.Fields[j]);
            segment.Fields[j] = trackedField;
            segment[j] = trackedField;
        }
        return segment;
    });
    return { meta: parsedModel.meta, data };
}

export function buildUnusedSegmentsReport(trackedModel) {
    const report = [];
    for (let i = 0; i < trackedModel.data.length; i++) {
        const segmentType = trackedModel.meta[i];
        const segment = trackedModel.data[i];
        const unusedFields = [];

        for (let j = 0; j < segment.Fields.length; j++) {
            // Field 0 is the segment name itself (e.g. PID's own Field 0 has Value "PID", per
            // hl7v2FieldModel.js's doc comment) -- not a real, addressable HL7 field any
            // template could read, so it's always treated as accessed. Matches upstream's
            // universal `j > 0` gate in Hl7v2TraceInfo.CreateTraceInfo (applies to every segment
            // type, not just MSH).
            if (j === 0) continue;
            // Field separator (MSH.1) and encoding characters (MSH.2) are treated as accessed
            // too, matching upstream's explicit MSH-specific skip in the same method.
            if (i === 0 && j <= 2) continue;

            const field = segment.Fields[j];
            if (!field) continue;

            const unusedComponents = [];
            for (let k = 0; k < field.Components.length; k++) {
                const component = field.Components[k];
                if (component && component._accessed === false) {
                    // Read the pre-captured raw value (see trackComponent), not `.Value` through
                    // the tracking proxy -- that read would itself flip `_accessed` to true.
                    unusedComponents.push({ index: k, value: component._rawValue });
                }
            }
            if (unusedComponents.length > 0) {
                unusedFields.push({ index: j, component: unusedComponents });
            }
        }

        if (unusedFields.length > 0) {
            report.push({ type: segmentType, line: i, field: unusedFields });
        }
    }
    return report;
}
