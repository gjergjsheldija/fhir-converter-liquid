// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

// Rich HL7v2 field/component/repeat object model for the Liquid conversion pipeline,
// mirroring Microsoft.Health.Fhir.Liquid.Converter.Parsers.Hl7v2DataParser exactly
// (see ParseFields/ParseComponents/ParseSubcomponents in that class). This is a
// SEPARATE representation from parseHL7v2()'s plain nested-array output -- Liquid
// templates access fields as `Segment.N.Value`, `Segment.N.C.Value` (component),
// `Segment.N.Repeats`, none of which the flat array model exposes.
//
// Indexing rules (verified against upstream source, not guessed):
// - Fields: index 0 = the segment name itself as a Field object (e.g. Field 0 of MSH
//   has Value "MSH"); index N (N>=1) = HL7 field N. For MSH specifically, the raw
//   pipe-split never yields a token for the field-separator character itself (HL7
//   field 1, conventionally "|"), so the parser synthesizes it explicitly and follows
//   with the encoding-characters token as field 2 -- after that adjustment, `Fields[N]`
//   equals conventional field N for every segment type, MSH included.
// - Components: index 0 = null padding ("to keep consistent indexes with the HL7 v2
//   spec"), index N (N>=1) = component N. Same padding trick for Subcomponents.
// - Repeats: NOT padded -- index 0 is the first repetition. A field's own top-level
//   Value/Components always mirror Repeats[0], so unrepeated fields work identically
//   whether accessed directly or via `.Repeats[0]`.
// - Field.Value is the RAW WHOLE-FIELD TEXT (repetition separators included, if any) -- it is
//   NOT the same as Field.Repeats[0].Value for a field with more than one repetition. Only
//   Components mirrors Repeats[0]; Value does not. Verified against Hl7v2DataParser.ParseFields.

import { Escape } from '../../inputProcessor/specialCharProcessor.js';
import { Unescape } from './hl7EscapeSequence.js';
import { parseHL7v2 } from './hl7v2.js';

function normalizeText(value, fieldSeparator, componentSeparator, subcomponentSeparator, repetitionSeparator) {
    return Escape(Unescape(value, fieldSeparator, componentSeparator, subcomponentSeparator, repetitionSeparator));
}

function buildSubcomponents(text, seps) {
    var subcomponents = [null];
    var raw = text.split(seps.subcomponentSeparator);
    for (var s = 0; s < raw.length; s++) {
        subcomponents.push(normalizeText(raw[s], seps.fieldSeparator, seps.componentSeparator, seps.subcomponentSeparator, seps.repetitionSeparator));
    }
    return subcomponents;
}

function buildComponent(text, seps) {
    var subcomponents = buildSubcomponents(text, seps);
    var component = subcomponents.slice();
    component.Value = normalizeText(text, seps.fieldSeparator, seps.componentSeparator, seps.subcomponentSeparator, seps.repetitionSeparator);
    component.Subcomponents = subcomponents;
    return component;
}

function buildComponents(text, seps) {
    var components = [null];
    var raw = text.split(seps.componentSeparator);
    for (var c = 0; c < raw.length; c++) {
        components.push(raw[c].length ? buildComponent(raw[c], seps) : null);
    }
    return components;
}

// A single repetition's worth of a field: Value + 1-indexed Components (no Repeats of its own).
function buildFieldInstance(text, seps) {
    var components = buildComponents(text, seps);
    var instance = components.slice();
    instance.Value = normalizeText(text, seps.fieldSeparator, seps.componentSeparator, seps.subcomponentSeparator, seps.repetitionSeparator);
    instance.Components = components;
    return instance;
}

// A full field: Value is the raw whole-field text (repetition separators included, matching
// upstream's Hl7v2Field constructor call in ParseFields -- Value is set once, directly from the
// raw field text, and never overwritten; only Components gets reassigned to mirror Repeats[0]).
function buildField(text, seps) {
    var repeatsRaw = text.split(seps.repetitionSeparator);
    var repeats = repeatsRaw.map(function (rt) { return buildFieldInstance(rt, seps); });
    var field = repeats[0].slice();
    field.Value = normalizeText(text, seps.fieldSeparator, seps.componentSeparator, seps.subcomponentSeparator, seps.repetitionSeparator);
    field.Components = repeats[0].Components;
    field.Repeats = repeats;
    return field;
}

// MSH.1 (field separator) and MSH.2 (encoding characters) are never split into
// components/subcomponents/repeats, even though their literal text contains the
// separator characters themselves (e.g. "^~\&" contains the repetition separator
// "~" -- splitting it would corrupt it). Matches Hl7v2DataParser's explicit,
// unsplit construction for these two fields.
function buildAtomicField(text) {
    var subcomponents = [null, text];
    var component = subcomponents.slice();
    component.Value = text;
    component.Subcomponents = subcomponents;

    var components = [null, component];
    var field = components.slice();
    field.Value = text;
    field.Components = components;
    field.Repeats = [];
    return field;
}

function buildFieldsForSegment(fieldsRaw, seps, isHeaderSegment) {
    var fields = [];
    for (var f = 0; f < fieldsRaw.length; f++) {
        if (isHeaderSegment && f === 1) {
            // MSH.1 (the field separator itself, never present as a raw split token)
            fields.push(buildAtomicField(seps.fieldSeparator));
            // MSH.2 (the encoding characters token, e.g. "^~\&")
            fields.push(buildAtomicField(fieldsRaw[f]));
        } else if (fieldsRaw[f] && fieldsRaw[f].length) {
            fields.push(buildField(fieldsRaw[f], seps));
        } else {
            fields.push(null);
        }
    }
    return fields;
}

/**
 * Parses an HL7v2 message into the rich Field/Component/Repeats object model
 * Liquid templates expect (`.Value`, `.Components`, `.Repeats`). Reuses
 * parseHL7v2() purely for its existing header validation (throws the same errors on
 * malformed input); this function's own segment/field construction is independent.
 *
 * Returns { meta: [segmentName, ...], data: [Segment, ...] } -- same top-level shape
 * as parseHL7v2()'s `.v2`, so it's a drop-in replacement for callers that only care
 * about segment name/array lookups (get_first_segments, get_segment_lists, etc. never
 * inspect a segment's internal shape, only its identity and position).
 */
export function parseHl7v2FieldModel(msg) {
    if (msg.charCodeAt(0) === 0xFEFF) {
        msg = msg.slice(1);
    }

    parseHL7v2(msg); // validates and throws on malformed input; result intentionally discarded

    // Matches upstream's Hl7v2DataUtility.SplitMessageToSegments: any of \r\n, \r, or \n is a
    // valid segment terminator (bare \r is the traditional native HL7v2/MLLP wire-format one),
    // and consecutive/trailing separators produce no empty segments.
    var segments = msg.split(/\r\n|\r|\n/).filter(function (s) { return s.length > 0; });
    var seps = {
        fieldSeparator: segments[0][3],
        componentSeparator: segments[0][4],
        repetitionSeparator: segments[0][5],
        subcomponentSeparator: segments[0][7]
    };

    var meta = [];
    var data = [];

    for (var i = 0; i < segments.length; i++) {
        var fieldsRaw = segments[i].split(seps.fieldSeparator);
        if (!fieldsRaw[0].length) {
            continue; // matches parseHL7v2's own trailing-empty-line skip
        }

        var isHeaderSegment = (i === 0);
        var fields = buildFieldsForSegment(fieldsRaw, seps, isHeaderSegment);

        var segment = fields.slice();
        segment.Value = normalizeText(segments[i], seps.fieldSeparator, seps.componentSeparator, seps.subcomponentSeparator, seps.repetitionSeparator);
        segment.Fields = fields;

        meta.push(fields[0] ? fields[0].Value : '');
        data.push(segment);
    }

    return { meta: meta, data: data };
}
