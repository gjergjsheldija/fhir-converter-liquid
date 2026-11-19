// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

// Opt-in debug metadata for the Web UI hover inspector (?debug=true on
// POST /api/v1/convert/hl7v2). Two concerns live here:
//
//   1. serializeHl7v2Debug(srcData, trackedV2) -- a bounded, JSON-safe snapshot of the
//      parsed HL7v2 model (segments/fields/repeats/components/subcomponents + whether each
//      component was accessed during the render). It re-parses the raw message with a FRESH
//      parseHl7v2FieldModel for all values, and reads ONLY the non-marking members of the
//      tracked model for `accessed` flags: `fieldProxy.Components` and `component._accessed`
//      do NOT trip the access-tracking proxies' marking keys (Value / Subcomponents /
//      numeric index). `fieldProxy.Repeats` IS a marking read -- it is only safe because the
//      worker computes getConversionResultMetadata (the unusedSegments report) BEFORE calling
//      this function, and the tracked model is per-request (re-parsed every call), so any
//      marking read here cannot influence this response's unusedSegments.
//
//   2. createDebugCollector(srcData) -- a per-request collector stored on the CLS session
//      (key DEBUG_COLLECTOR). liquid-converter.js attaches a wrapper around
//      renderer.renderTemplates + a marker in the custom fs.readFileSync hook, so every
//      PARTIAL render ({% include %} and {% evaluate %}) records a bounded snapshot of its
//      child Context scope, keyed by the normalized template path (e.g.
//      "Resource/_MessageHeader.liquid"). The worker snapshots the ROOT scope itself
//      (scopes["__root__"]) because it builds the root Context manually (parse + Context +
//      renderer.renderTemplates, an exact mirror of Liquid#parseAndRender) when debug is
//      active.
//
// All scope serialization is strictly NON-MARKING: field values are derived from
// component._rawValue (never fieldProxy.Value), and component subcomponents are derived by
// splitting component._rawValue on the message's subcomponent separator (never
// componentProxy.Subcomponents). This guarantees partial scopes recorded MID-RENDER can
// never change the unusedSegments report of the in-flight conversion.

import {parseHl7v2FieldModel} from '../parsers/hl7v2/hl7v2FieldModel.js';

// CLS session key under which the per-request collector is stored. Exported so
// worker.js (writer) and liquid-converter.js (reader hooks) agree on one name.
export const DEBUG_COLLECTOR_KEY = 'DEBUG_COLLECTOR';

const MAX_DEPTH = 5;
const MAX_ARRAY_ITEMS = 50;
const MAX_SCOPE_KEYS = 32;
const MAX_PARTIALS = 100;
const MAX_INDEXED_KEYS = 64;

function isObject(v) {
    return v !== null && typeof v === 'object';
}

function isSegment(v) {
    // hl7v2FieldModel.js builds segments via `fields.slice()`, so Array.isArray(v) is true!
    return isObject(v) && Array.isArray(v.Fields) && typeof v.Value === 'string';
}

function isField(v) {
    // Field objects (built via `repeats[0].slice()`, incl. proxies) have Array.isArray(v) === true
    // and carry `.Components`; components carry `.Subcomponents` instead, segments carry `.Fields`.
    return isObject(v) && Array.isArray(v.Components) && !('Fields' in v) && !('Subcomponents' in v);
}

function isComponent(v) {
    return isObject(v) && Array.isArray(v.Subcomponents);
}

function getSubcomponentSeparator(model) {
    // The subcomponent separator is the 4th character of the MSH.2 (encoding characters)
    // value, per HL7v2 (MSH.1 is the field separator itself, so MSH.2 is the first
    // "real" header field). model.data[0].Fields[2] is the fresh (untracked) field object.
    try {
        const msh2 = model.data[0] && model.data[0].Fields && model.data[0].Fields[2];
        const value = msh2 && msh2.Value;
        if (typeof value === 'string' && value.length > 3) {
            return value[3];
        }
    } catch (e) {
        // fall through to the HL7v2 default
    }
    return '&';
}

// --- parsed-HL7v2 snapshot (values from a FRESH re-parse; accessed from the tracked model) -

function freshRepeatEntry(rep) {
    const components = [];
    const comps = rep.Components || [];
    for (let k = 1; k < comps.length; k++) {
        const c = comps[k];
        if (!c) {
            continue;
        }
        const subs = [];
        const subArr = c.Subcomponents || [];
        for (let s = 1; s < subArr.length; s++) {
            if (subArr[s] !== null && subArr[s] !== undefined) {
                subs.push(subArr[s]);
            }
        }
        components.push({index: k, value: c.Value, accessed: false, subcomponents: subs});
    }
    return {value: rep.Value, components: components};
}

function freshFieldEntry(field, index) {
    // Repeats are unpadded (index 0 = first repetition); atomic MSH.1/MSH.2 fields have
    // Repeats: [] -- in that case the field itself is the single instance to serialize.
    const repeats = (field.Repeats && field.Repeats.length > 0 ? field.Repeats : [field]).map(freshRepeatEntry);
    return {index: index, value: field.Value, accessed: false, repeats: repeats};
}

export function serializeHl7v2Debug(srcData, trackedV2) {
    const model = parseHl7v2FieldModel(srcData);
    const segments = [];
    for (let i = 0; i < model.data.length; i++) {
        const seg = model.data[i];
        const fields = [];
        const fieldArr = seg.Fields || [];
        for (let j = 1; j < fieldArr.length; j++) {
            const field = fieldArr[j];
            if (!field) {
                continue; // empty (null) field slots carry nothing to inspect
            }
            const entry = freshFieldEntry(field, j);

            // Merge access state from the tracked model. Repeat-0 components: non-marking
            // reads only. Repeats[i>=1]: reading trackedField.Repeats is a marking read,
            // which is only safe AFTER getConversionResultMetadata has run (see header).
            const trackedSeg = trackedV2 && trackedV2.data ? trackedV2.data[i] : null;
            const trackedField = trackedSeg && trackedSeg.Fields ? trackedSeg.Fields[j] : null;
            if (trackedField) {
                const trackedComps = trackedField.Components || [];
                entry.accessed = entry.repeats.length > 0
                    && entry.repeats[0].components.some((c) => {
                        const t = trackedComps[c.index];
                        return t && t._accessed === true;
                    });
                entry.repeats[0].components = entry.repeats[0].components.map((c) => {
                    const t = trackedComps[c.index];
                    return {index: c.index, value: c.value, accessed: t ? t._accessed === true : false, subcomponents: c.subcomponents};
                });
                if (entry.repeats.length > 1) {
                    const trackedRepeats = trackedField.Repeats || [];
                    for (let r = 1; r < entry.repeats.length && r < trackedRepeats.length; r++) {
                        const tCompArr = trackedRepeats[r] && trackedRepeats[r].Components ? trackedRepeats[r].Components : [];
                        entry.repeats[r].components = entry.repeats[r].components.map((c) => {
                            const t = tCompArr[c.index];
                            return {index: c.index, value: c.value, accessed: t ? t._accessed === true : false, subcomponents: c.subcomponents};
                        });
                    }
                }
            }
            fields.push(entry);
        }
        segments.push({line: i, name: model.meta[i], raw: seg.Value, fields: fields});
    }
    return {segments: segments};
}

// --- scope snapshot serializer (bounded, strictly non-marking) ----------------------------

function serializeComponent(comp, depth, subSep) {
    const raw = typeof comp._rawValue === 'string' ? comp._rawValue : null;
    const subcomponents = raw === null ? [] : (subSep ? raw.split(subSep) : [raw]);
    return {
        __kind: 'hl7Component',
        value: raw,
        accessed: comp._accessed === true,
        subcomponents: subcomponents
    };
}

function serializeField(field, depth, subSep) {
    // Non-marking: `.Components` and `._rawValue`/`._accessed` never trip the tracking
    // proxies; `.Value` on a field proxy WOULD mark repeat-0 components as accessed, so the
    // field value is derived from the (repeat-0) components instead.
    const components = {};
    const compArr = field.Components || [];
    let count = 0;
    for (let k = 1; k < compArr.length && count < MAX_INDEXED_KEYS; k++) {
        const c = compArr[k];
        if (!c) {
            continue;
        }
        components[String(k)] = serializeComponent(c, depth, subSep);
        count++;
    }
    let value = null;
    const parts = Object.keys(components).map((k) => components[k].value).filter((v) => v !== null);
    if (parts.length === 1) {
        value = parts[0];
    } else if (parts.length > 1) {
        value = parts.join('^');
    }
    return {__kind: 'hl7Field', value: value, components: components};
}

function serializeValue(value, depth, subSep) {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }
    if (depth > MAX_DEPTH) {
        return '<truncated>';
    }
    // Check HL7 array-backed wrappers BEFORE Array.isArray(value): hl7v2FieldModel
    // constructs segments, fields, and components from `.slice()`, so Array.isArray is
    // true for all three, and indexing `component[1]` as a generic array would trip the
    // numeric-slot Proxy trap in hl7v2AccessTracking.js.
    if (isSegment(value)) {
        const fields = {};
        const fieldArr = value.Fields || [];
        let count = 0;
        for (let j = 1; j < fieldArr.length && count < MAX_INDEXED_KEYS; j++) {
            if (!fieldArr[j]) {
                continue;
            }
            fields[String(j)] = serializeField(fieldArr[j], depth, subSep);
            count++;
        }
        return {__kind: 'hl7Segment', value: value.Value, fields: fields};
    }
    if (isField(value)) {
        return serializeField(value, depth, subSep);
    }
    if (isComponent(value)) {
        return serializeComponent(value, depth, subSep);
    }
    if (Array.isArray(value)) {
        const out = [];
        const n = Math.min(value.length, MAX_ARRAY_ITEMS);
        for (let i = 0; i < n; i++) {
            out.push(serializeValue(value[i], depth + 1, subSep));
        }
        if (value.length > n) {
            out.push('... ' + (value.length - n) + ' more');
        }
        return out;
    }
    // Plain object (e.g. a FHIR resource under construction, or a helper's return value).
    const out = {};
    const keys = Object.keys(value);
    for (let i = 0; i < keys.length && i < MAX_SCOPE_KEYS; i++) {
        out[keys[i]] = serializeValue(value[keys[i]], depth + 1, subSep);
    }
    return out;
}

// --- per-request collector ------------------------------------------------------------------

export function createDebugCollector(srcData) {
    const subSep = (() => {
        try {
            return getSubcomponentSeparator(parseHl7v2FieldModel(srcData));
        } catch (e) {
            return '&';
        }
    })();

    const collector = {
        pendingPartial: null,
        rootScope: null,
        partials: {},
        partialOrder: [],

        // Root scope snapshot, taken by the worker AFTER the root render completes
        // (so every {% assign %} in the root template is visible). `msg` and `hl7v2Data`
        // are pruned: they duplicate parsedHl7v2 and would dominate the payload.
        setRootScope(ctx) {
            const all = ctx && typeof ctx.getAll === 'function' ? ctx.getAll() : {};
            delete all.msg;
            delete all.hl7v2Data;
            this.rootScope = boundScopeValue(all, subSep);
        },

        // Called from the fs hook right before the partial's renderTemplates runs.
        markPartialLoaded(normalizedName) {
            this.pendingPartial = normalizedName;
        },

        takePendingPartial() {
            const name = this.pendingPartial;
            this.pendingPartial = null;
            return name;
        },

        // Called from the wrapped renderer.renderTemplates when a pending partial name was
        // taken. Re-renderings of an already-recorded partial bump callCount and refresh
        // lastScope instead of re-adding the key.
        recordPartialRender(name, ctx) {
            if (!name) {
                return;
            }
            const scope = this.boundScope(ctx);
            const existing = this.partials[name];
            if (existing) {
                existing.callCount++;
                existing.lastScope = scope;
            } else if (this.partialOrder.length < MAX_PARTIALS) {
                this.partials[name] = {
                    callCount: 1,
                    firstScope: scope,
                    lastScope: scope
                };
                this.partialOrder.push(name);
            }
        },

        // Bounded snapshot of a Context (root or partial): merge all scopes like
        // Context#getAll does, then serialize each top-level key (cap MAX_SCOPE_KEYS).
        boundScope(ctx) {
            return boundScopeValue(ctx && typeof ctx.getAll === 'function' ? ctx.getAll() : {}, subSep);
        },

        buildDebugInfo(durationMs, parsedHl7v2) {
            const scopes = {};
            if (this.rootScope) {
                scopes['__root__'] = this.rootScope;
            }
            for (const name of this.partialOrder) {
                scopes[name] = this.partials[name];
            }
            return {
                durationMs: durationMs,
                parsedHl7v2: parsedHl7v2,
                scopes: scopes
            };
        }
    };
    return collector;
}

function boundScopeValue(all, subSep) {
    const out = {};
    const keys = Object.keys(all);
    for (let i = 0; i < keys.length && i < MAX_SCOPE_KEYS; i++) {
        out[keys[i]] = serializeValue(all[keys[i]], 1, subSep);
    }
    return out;
}
