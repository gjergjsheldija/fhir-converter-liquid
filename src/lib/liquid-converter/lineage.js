// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

// Result lineage for the opt-in debug convert (?debug=true): which include wrote a value in the
// FHIR result. Each row is {outputPath, template, sourcePath}.
//
// Templates emit JSON text, not objects, so there is no "assignment" to hook. Instead, while debug
// is on, liquid-converter.js records for every {% include %} the span of text it wrote into the
// shared output buffer (traceRender / recordLineageRender below). After the root render, buildLineage
// finds each string/number leaf of the final resource in that text and names the innermost include
// whose span contains it.
//
// sourcePath is left empty. The recorded debug scopes are snapshots of variable values taken when
// an include starts; they do not say which variable path the include read to write an output
// value, and matching on equal values would name a field by guesswork. Spec 04 requirement 5:
// record the template with an empty sourcePath instead.
//
// The browser mirrors lookupLineage in src/static/js/debug-hover.js (classic script, no imports).

export const MAX_LINEAGE_ROWS = 10000;
const MAX_LINEAGE_RENDERS = 5000;
const MAX_FALLBACK_SEARCHES = 200;
const MAX_FIELD_READS = 20000;
const MAX_DIRECT_SOURCE_PATHS = 3;

// Longest outputPath that equals `path` or is a prefix of it on a path-segment boundary.
export function lookupLineage(lineage, path) {
    if (!Array.isArray(lineage) || typeof path !== 'string') {
        return null;
    }
    let best = null;
    for (const row of lineage) {
        const p = row && row.outputPath;
        if (typeof p !== 'string' || p.length === 0) {
            continue;
        }
        if (path === p || path.startsWith(p + '.')) {
            if (!best || p.length > best.outputPath.length) {
                best = row;
            }
        }
    }
    return best;
}

// Records an HL7 segment/field access on the active debug collector for the current trace frame.
export function recordFieldRead(collector, path) {
    if (!collector || typeof path !== 'string' || path.length === 0) {
        return;
    }
    if (!collector.fieldReads) {
        collector.fieldReads = [];
    }
    if (collector.fieldReads.length >= MAX_FIELD_READS) {
        return;
    }
    collector.fieldReads.push({
        path: path,
        depth: collector._traceDepth || 0
    });
}

// Called by traceRender after an include finished writing to a shared emitter.
export function recordLineageRender(collector, template, emitter, start, end, sourcePath) {
    if (!collector.lineageRenders) {
        collector.lineageRenders = [];
    }
    if (collector.lineageRenders.length >= MAX_LINEAGE_RENDERS || end <= start) {
        return;
    }
    collector.lineageRenders.push({
        template: template,
        emitter: emitter,
        start: start,
        end: end,
        sourcePath: typeof sourcePath === 'string' ? sourcePath : ''
    });
}

// Wraps the generator returned by renderer.renderTemplates for one include. Output and result are
// untouched; it reads the emitter length and direct HL7 field reads before and after.
export function* traceRender(collector, template, emitter, inner) {
    const start = emitter.buffer.length;
    const myDepth = ((collector && collector._traceDepth) || 0) + 1;
    if (collector) {
        collector._traceDepth = myDepth;
    }
    const readStart = collector && Array.isArray(collector.fieldReads) ? collector.fieldReads.length : 0;
    let result;
    try {
        result = yield* inner;
    } finally {
        if (collector) {
            collector._traceDepth = myDepth - 1;
        }
    }
    let sourcePath = '';
    if (collector && Array.isArray(collector.fieldReads) && collector.fieldReads.length > readStart) {
        const distinct = [];
        const seen = new Set();
        for (let i = readStart; i < collector.fieldReads.length; i++) {
            const entry = collector.fieldReads[i];
            let path = null;
            if (typeof entry === 'string') {
                path = entry;
            } else if (entry && entry.depth === myDepth && typeof entry.path === 'string') {
                path = entry.path;
            }
            if (path && !seen.has(path)) {
                seen.add(path);
                distinct.push(path);
            }
        }
        if (distinct.length >= 1 && distinct.length <= MAX_DIRECT_SOURCE_PATHS) {
            sourcePath = distinct.join(', ');
        }
    }
    recordLineageRender(collector, template, emitter, start, emitter.buffer.length, sourcePath);
    return result;
}

function tokenFor(value) {
    return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

function isWordChar(ch) {
    return ch !== undefined && /[\w.-]/.test(ch);
}

// Index of `token` as a standalone JSON value in `text` at or after `from`, or -1.
function findValueToken(text, token, from, isString) {
    let at = text.indexOf(token, from);
    while (at !== -1) {
        const prev = text[at - 1];
        const end = at + token.length;
        let ok;
        if (isString) {
            ok = prev !== '\\';
            if (ok) {
                let i = end;
                while (i < text.length && /\s/.test(text[i])) {
                    i++;
                }
                ok = text[i] !== ':'; // followed by a colon: it is an object key, not a value
            }
        } else {
            ok = !isWordChar(prev) && prev !== '"' && !isWordChar(text[end]) && text[end] !== '"';
        }
        if (ok) {
            return at;
        }
        at = text.indexOf(token, at + 1);
    }
    return -1;
}

function collectLeaves(node, path, out) {
    if (out.length >= MAX_LINEAGE_ROWS) {
        return;
    }
    if (typeof node === 'string' || (typeof node === 'number' && Number.isFinite(node))) {
        out.push({path: path.join('.'), value: node});
    } else if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) {
            path.push(String(i));
            collectLeaves(node[i], path, out);
            path.pop();
        }
    } else if (node && typeof node === 'object') {
        for (const key of Object.keys(node)) {
            path.push(key);
            collectLeaves(node[key], path, out);
            path.pop();
        }
    }
}

// renders: records from recordLineageRender. rendered: the root render output string.
// resource: the post-processed FHIR resource. Returns [{outputPath, template, sourcePath}].
export function buildLineage(renders, rendered, resource) {
    if (!Array.isArray(renders) || typeof rendered !== 'string' || !resource) {
        return [];
    }
    // Only spans written to the root output buffer have offsets that mean something here.
    const spans = renders
        .filter((r) => r.emitter && r.emitter.buffer === rendered)
        .sort((a, b) => (a.end - a.start) - (b.end - b.start));
    if (spans.length === 0) {
        return [];
    }
    const leaves = [];
    collectLeaves(resource, [], leaves);
    const rows = [];
    let cursor = 0;
    let fallbackSearches = 0;
    for (const leaf of leaves) {
        const isString = typeof leaf.value === 'string';
        const token = tokenFor(leaf.value);
        let at = findValueToken(rendered, token, cursor, isString);
        if (at === -1 && fallbackSearches < MAX_FALLBACK_SEARCHES) {
            fallbackSearches++;
            at = findValueToken(rendered, token, 0, isString);
        } else if (at !== -1) {
            cursor = at + token.length;
        }
        if (at === -1) {
            continue;
        }
        const span = spans.find((s) => s.start <= at && at < s.end);
        if (!span) {
            continue;
        }
        rows.push({
            outputPath: leaf.path,
            template: span.template,
            sourcePath: typeof span.sourcePath === 'string' ? span.sourcePath : ''
        });
    }
    return rows;
}
