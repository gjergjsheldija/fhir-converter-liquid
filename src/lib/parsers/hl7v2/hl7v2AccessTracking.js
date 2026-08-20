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
    return new Proxy(component, {
        get(target, prop, receiver) {
            if (ACCESSIBLE_COMPONENT_KEYS.has(prop) || isIndexKey(prop)) {
                target._accessed = true;
            }
            return Reflect.get(target, prop, receiver);
        }
    });
}

function trackField(field) {
    if (field === null || field === undefined) return field;

    // Wrap this field's own Components (the same array Repeats[0] points to -- matches
    // upstream's `field.Components = Repeats[0].Components` reference-sharing) and every
    // repetition's own Components too.
    const trackedComponents = field.Components.map(trackComponent);
    field.Components = trackedComponents;
    field.Repeats = field.Repeats.map((repeat, i) => {
        const wrapped = repeat.slice();
        wrapped.Value = repeat.Value;
        wrapped.Components = (i === 0) ? trackedComponents : repeat.Components.map(trackComponent);
        return wrapped;
    });

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
        segment.Fields = segment.Fields.map(trackField);
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
            // Field separator (MSH.1) and encoding characters (MSH.2) are treated as accessed,
            // matching upstream's explicit skip in Hl7v2TraceInfo.CreateTraceInfo.
            if (i === 0 && j <= 2) continue;

            const field = segment.Fields[j];
            if (!field) continue;

            const unusedComponents = [];
            for (let k = 0; k < field.Components.length; k++) {
                const component = field.Components[k];
                if (component && component._accessed === false) {
                    unusedComponents.push({ index: k, value: component.Value });
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
