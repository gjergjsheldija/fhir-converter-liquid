/* eslint-disable no-undef, no-unused-vars */

/**
 * Debug hover inspector (opt-in via ?debug=true on the convert endpoint).
 *
 * - Template editor: hovering a variable or dotted HL7v2 path (e.g.
 *   `bundleID`, `firstSegments.MSH.10`, `firstSegments.PID.5.1.Value`) shows the
 *   runtime value captured during the latest conversion. Resolution walks the
 *   active template's partial scope first (when the open tab is an included
 *   partial), then the root scope, then the parsed message snapshot.
 * - Message editor: hovering a character in the HL7v2 message shows the exact
 *   `SEG-F[.C]` coordinate, the decoded value, the equivalent Liquid expression
 *   and a Read/Unused badge taken from the latest conversion's access tracking.
 *
 * Data source: `window.latestDebugInfo`, maintained by template-editor.js after
 * every convert call and broadcast via the `fhir:debug-updated` jQuery event
 * (Spec 05's bottom drawer subscribes to the same event).
 */
(function () {
    'use strict';

    var HOVER_DEBOUNCE_MS = 180;
    var LEAVE_GRACE_MS = 150;
    var COPY_RESET_MS = 1200;
    var TOKEN_RE = /[A-Za-z_][\w]*(?:\.[A-Za-z0-9_]+)*/;
    var LIQUID_KEYWORDS = {
        assign: 1, capture: 1, if: 1, else: 1, endif: 1, unless: 1, endunless: 1,
        for: 1, endfor: 1, in: 1, include: 1, evaluate: 1, using: 1, with: 1,
        case: 1, endcase: 1, when: 1, raw: 1, endraw: 1, cycle: 1, break: 1,
        continue: 1, true: 1, false: 1, null: 1, nil: 1, and: 1, or: 1, not: 1
    };
    var MAX_LIST_ITEMS = 12;

    var tooltip = null;
    var hoverState = null; // { editorKey, cm, token }
    var hoverTimer = null;
    var leaveTimer = null;
    var copyTimer = null;

    function debugInfo() {
        return window.latestDebugInfo || null;
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // --- tooltip element -------------------------------------------------------------

    function ensureTooltip() {
        if (tooltip) {
            return tooltip;
        }
        tooltip = document.createElement('div');
        tooltip.id = 'debug-hover-tooltip';
        tooltip.setAttribute('hidden', '');
        document.body.appendChild(tooltip);
        tooltip.addEventListener('mouseenter', function () {
            if (leaveTimer) {
                clearTimeout(leaveTimer);
                leaveTimer = null;
            }
        });
        tooltip.addEventListener('mouseleave', function () {
            hideTooltip(0);
        });
        return tooltip;
    }

    function showTooltip(x, y) {
        var el = ensureTooltip();
        if (el.hasAttribute('hidden')) {
            el.removeAttribute('hidden');
        }
        var width = el.offsetWidth;
        var height = el.offsetHeight;
        var left = x + 14;
        var top = y + 16;
        if (left + width > window.innerWidth - 8) {
            left = Math.max(8, x - width - 14);
        }
        if (top + height > window.innerHeight - 8) {
            top = Math.max(8, y - height - 16);
        }
        el.style.left = left + 'px';
        el.style.top = top + 'px';
    }

    function hideTooltip(graceMs) {
        if (leaveTimer) {
            clearTimeout(leaveTimer);
            leaveTimer = null;
        }
        if (hoverTimer) {
            clearTimeout(hoverTimer);
            hoverTimer = null;
        }
        hoverState = null;
        if (tooltip && !tooltip.hasAttribute('hidden')) {
            if (graceMs > 0) {
                leaveTimer = setTimeout(function () {
                    leaveTimer = null;
                    if (tooltip) {
                        tooltip.setAttribute('hidden', '');
                    }
                }, graceMs);
            } else {
                tooltip.setAttribute('hidden', '');
            }
        }
    }

    function setCopyLabel(button) {
        if (copyTimer) {
            clearTimeout(copyTimer);
            copyTimer = null;
        }
        button.textContent = 'Copied';
        copyTimer = setTimeout(function () {
            copyTimer = null;
            if (button) {
                button.textContent = 'Copy';
            }
        }, COPY_RESET_MS);
    }

    function scalarText(value) {
        if (value === null || value === undefined) {
            return 'null (empty / unset)';
        }
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            return typeof value === 'string' ? JSON.stringify(value) : String(value);
        }
        return null; // non-scalar
    }

    // --- dotted-path resolution --------------------------------------------------------

    function isPlainObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    // Resolve one path part against a value. HL7-aware: numeric parts index into
    // segment.fields / field.components; Value/Components/Repeats map onto the
    // snapshot's lowercase keys (templates use the PascalCase runtime names).
    function stepValue(value, part, ctx) {
        if (value === null || value === undefined) {
            return {resolved: false, value: undefined};
        }
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            return {resolved: false, value: undefined};
        }
        if (Array.isArray(value)) {
            if (/^\d+$/.test(part) && value[Number(part)] !== undefined) {
                return {resolved: true, value: value[Number(part)]};
            }
            return {resolved: false, value: undefined};
        }
        if (part === 'value' || part === 'Value') {
            if ('value' in value || 'Value' in value) {
                return {resolved: true, value: ('value' in value) ? value.value : value.Value};
            }
            return {resolved: false, value: undefined};
        }
        if (part === 'components' || part === 'Components') {
            if (value.__kind === 'hl7Field' && value.components) {
                return {resolved: true, value: value.components};
            }
            return {resolved: false, value: undefined};
        }
        if (part === 'fields' || part === 'Fields') {
            if (value.__kind === 'hl7Segment' && value.fields) {
                return {resolved: true, value: value.fields};
            }
            return {resolved: false, value: undefined};
        }
        if (part === 'repeats' || part === 'Repeats') {
            if (value.__kind === 'hl7Field') {
                if (value.repeats) {
                    return {resolved: true, value: value.repeats};
                }
                var fallback = lookupRepeatsInParsed(value, ctx);
                if (fallback !== undefined) {
                    return {resolved: true, value: fallback};
                }
            }
            return {resolved: false, value: undefined};
        }
        if (value.__kind === 'hl7Segment' || value.__kind === 'hl7Field') {
            if (/^\d+$/.test(part)) {
                var container = value.__kind === 'hl7Segment' ? value.fields : value.components;
                if (container && container[part]) {
                    if (value.__kind === 'hl7Segment') {
                        ctx.segmentRaw = value.value;
                        ctx.fieldIndex = Number(part);
                    } else {
                        ctx.componentIndex = Number(part);
                    }
                    return {resolved: true, value: container[part]};
                }
            }
            return {resolved: false, value: undefined};
        }
        if (part in value) {
            return {resolved: true, value: value[part]};
        }
        return {resolved: false, value: undefined};
    }

    // The scope snapshot omits field repetitions; recover them from the parsed
    // message snapshot using the segment/field coordinates tracked during the walk.
    function lookupRepeatsInParsed(fieldNode, ctx) {
        var info = debugInfo();
        var segments = info && info.parsedHl7v2 && info.parsedHl7v2.segments;
        if (!segments || ctx.segmentRaw === undefined || ctx.fieldIndex === undefined) {
            return undefined;
        }
        var segment = null;
        for (var i = 0; i < segments.length; i++) {
            if (segments[i].raw === ctx.segmentRaw) {
                segment = segments[i];
                break;
            }
        }
        if (!segment) {
            return undefined;
        }
        for (var f = 0; f < segment.fields.length; f++) {
            if (segment.fields[f].index === ctx.fieldIndex) {
                return segment.fields[f].repeats;
            }
        }
        return undefined;
    }

    // Walk `parts` from `root`. Returns {value, complete} for the longest
    // resolvable prefix (complete === true when every part resolved).
    function walkParts(root, parts) {
        var value = root;
        var ctx = {segmentRaw: undefined, fieldIndex: undefined, componentIndex: undefined};
        var complete = true;
        for (var i = 0; i < parts.length; i++) {
            var step = stepValue(value, parts[i], ctx);
            if (!step.resolved) {
                complete = false;
                break;
            }
            value = step.value;
        }
        return {value: value, complete: complete};
    }

    function scopeChain() {
        var info = debugInfo();
        var scopes = (info && info.scopes) || {};
        var chain = [];
        if (typeof activeTemplate !== 'undefined' && activeTemplate && scopes[activeTemplate.name]) {
            chain.push({name: activeTemplate.name, scope: scopes[activeTemplate.name].lastScope, partial: scopes[activeTemplate.name]});
        }
        if (scopes.__root__) {
            chain.push({name: '__root__', scope: scopes.__root__, partial: null});
        }
        return {info: info, chain: chain};
    }

    function parsedFirstSegment(info, segmentName) {
        var segments = info && info.parsedHl7v2 && info.parsedHl7v2.segments;
        if (!segments) {
            return null;
        }
        for (var i = 0; i < segments.length; i++) {
            if (segments[i].name === segmentName) {
                return segments[i];
            }
        }
        return null;
    }

    function parsedWalk(segment, parts) {
        // parts are numeric (field, [component, [subcomponent]]); returns the leaf
        // entry plus a coordinate string like "MSH.10" / "PID.5.1".
        var node = segment;
        var coord = segment.name;
        var kind = 'segment';
        var i;
        for (i = 0; i < parts.length; i++) {
            var n = Number(parts[i]);
            if (kind === 'segment') {
                var field = null;
                for (var f = 0; f < node.fields.length; f++) {
                    if (node.fields[f].index === n) {
                        field = node.fields[f];
                        break;
                    }
                }
                if (!field) {
                    return null;
                }
                coord += '.' + n;
                node = field;
                kind = 'field';
            } else if (kind === 'field') {
                var repeat0 = node.repeats && node.repeats[0];
                var comp = null;
                if (repeat0) {
                    for (var c = 0; c < repeat0.components.length; c++) {
                        if (repeat0.components[c].index === n) {
                            comp = repeat0.components[c];
                            break;
                        }
                    }
                }
                if (!comp) {
                    return null;
                }
                coord += '.' + n;
                node = comp;
                kind = 'component';
            } else {
                var sub = node.subcomponents[n - 1];
                if (sub === undefined) {
                    return null;
                }
                coord += '.' + n;
                node = {value: sub, accessed: node.accessed};
            }
        }
        return {node: node, coord: coord, kind: kind};
    }

    // Resolve a dotted token: partial scope -> root scope (HL7-aware), then a
    // parsed-message fallback for bare `SEG.F[.C[.S]]` paths.
    function resolveTemplateToken(token) {
        var parts = token.split('.');
        var result = scopeChain();
        var info = result.info;
        if (info && result.chain.length > 0) {
            for (var s = 0; s < result.chain.length; s++) {
                var scope = result.chain[s];
                var walked = walkParts(scope.scope, parts);
                if (walked.complete) {
                    return {
                        value: walked.value,
                        scopeLabel: scope.name === '__root__'
                            ? (typeof activeTemplate !== 'undefined' && activeTemplate ? activeTemplate.name : '__root__')
                            : scope.name,
                        partial: scope.partial
                    };
                }
                // Partial scope missed: keep walking; the next chain entry (root)
                // may still resolve the full token.
            }
        }
        if (info && parts.length >= 2 && /^[A-Z][A-Z0-9_]*$/.test(parts[0]) && parts.slice(1).every(function (p) {
            return /^\d+$/.test(p);
        })) {
            var segment = parsedFirstSegment(info, parts[0]);
            var walkedParsed = segment && parsedWalk(segment, parts.slice(1));
            if (walkedParsed) {
                return {value: walkedParsed.node, scopeLabel: 'parsed message', partial: null, coord: walkedParsed.coord, kind: walkedParsed.kind};
            }
        }
        return null;
    }

    window.resolveDebugExpression = resolveTemplateToken;

    // --- template editor hover ---------------------------------------------------------

    function findToken(lineText, ch) {
        var offset = 0;
        while (offset < lineText.length) {
            var match = TOKEN_RE.exec(lineText.slice(offset));
            if (!match) {
                return null;
            }
            var start = offset + match.index;
            var end = start + match[0].length;
            if (start <= ch && ch < end) {
                return match[0];
            }
            offset = end;
        }
        return null;
    }

    function isIgnoredTemplateToken(token, cm, pos) {
        if (LIQUID_KEYWORDS[token.split('.')[0]]) {
            return true;
        }
        var type = cm.getTokenTypeAt(pos);
        return type !== null && type.indexOf('comment') !== -1;
    }

    function listEntries(container) {
        var keys = Object.keys(container);
        var rows = [];
        for (var i = 0; i < keys.length && rows.length < MAX_LIST_ITEMS; i++) {
            var key = keys[i];
            var entry = container[key];
            if (entry === null || entry === undefined) {
                continue;
            }
            var label = typeof entry === 'object' && 'value' in entry ? entry.value : entry;
            if (label === null || label === undefined || label === '') {
                continue;
            }
            rows.push({key: key, text: scalarText(label)});
        }
        return rows;
    }

    function valueHtml(value) {
        var scalar = scalarText(value);
        if (scalar !== null) {
            return '<div class="debug-hover-value">' + escapeHtml(scalar) + '</div>';
        }
        if (Array.isArray(value)) {
            var items = [];
            for (var j = 0; j < value.length && items.length < MAX_LIST_ITEMS; j++) {
                var item = scalarText(value[j]);
                items.push(item === null ? '{…}' : item);
            }
            return '<div class="debug-hover-value">' + escapeHtml('[' + items.join(', ') + ']' + (value.length > MAX_LIST_ITEMS ? ', …' : '')) + '</div>';
        }
        if (!isPlainObject(value)) {
            return '<div class="debug-hover-value">{…}</div>';
        }
        if (value.__kind === 'hl7Segment' || value.__kind === 'hl7Field' || value.__kind === 'hl7Component') {
            var rows = '';
            var base = scalarText(value.value);
            if (base !== null) {
                rows += '<div class="debug-hover-row"><span class="debug-hover-key">value</span><span>' + escapeHtml(base) + '</span></div>';
            } else {
                rows += '<div class="debug-hover-row"><span class="debug-hover-key">value</span><span class="debug-hover-null">null (empty / unset)</span></div>';
            }
            var entries = null;
            if (value.__kind === 'hl7Segment' && value.fields) {
                entries = listEntries(value.fields);
            } else if (value.__kind === 'hl7Field' && value.components) {
                entries = listEntries(value.components);
            }
            if (entries && entries.length > 0) {
                rows += entries.map(function (r) {
                    return '<div class="debug-hover-row"><span class="debug-hover-key">.' + escapeHtml(r.key) + '</span><span>' + escapeHtml(r.text) + '</span></div>';
                }).join('');
            }
            return '<div class="debug-hover-list">' + rows + '</div>';
        }
        var keys = Object.keys(value);
        var plainRows = '';
        var rowCount = 0;
        for (var i = 0; i < keys.length && rowCount < MAX_LIST_ITEMS; i++) {
            var scalarEntry = scalarText(value[keys[i]]);
            if (scalarEntry === null) {
                continue;
            }
            rowCount++;
            plainRows += '<div class="debug-hover-row"><span class="debug-hover-key">' + escapeHtml(keys[i]) + '</span><span>' + escapeHtml(scalarEntry) + '</span></div>';
        }
        if (plainRows) {
            return '<div class="debug-hover-list">' + plainRows + '</div>';
        }
        return '<div class="debug-hover-value">{…}</div>';
    }

    function partialCallLabel(partial) {
        if (!partial || typeof partial.callCount !== 'number') {
            return '';
        }
        return ' · call ' + partial.callCount;
    }

    function handleTemplateHover(cm, pos, x, y) {
        var lineText = cm.getLine(pos.line);
        if (pos.ch > lineText.length) {
            hideTooltip(0);
            return;
        }
        var token = findToken(lineText, pos.ch);
        if (!token || isIgnoredTemplateToken(token, cm, pos)) {
            hideTooltip(0);
            return;
        }
        var resolved = resolveTemplateToken(token);
        var el = ensureTooltip();
        var header = escapeHtml(token);
        if (!resolved) {
            el.innerHTML =
                '<div class="debug-hover-header">' + header +
                '<span class="debug-hover-badge debug-hover-badge-muted">no debug data</span></div>' +
                '<div class="debug-hover-value">null (empty / unset)</div>';
            showTooltip(x, y);
            hoverState = {editorKey: 'template', cm: cm, token: token};
            return;
        }
        var scopeLabel = escapeHtml(resolved.scopeLabel || 'scope');
        var badge = '<span class="debug-hover-badge">' + scopeLabel + partialCallLabel(resolved.partial) + '</span>';
        var copyText = scalarText(resolved.value);
        var valueBlock = valueHtml(resolved.value);
        el.innerHTML =
            '<div class="debug-hover-header">' + header + ' ' + badge +
            '<button type="button" class="debug-hover-copy">Copy</button></div>' +
            valueBlock;
        showTooltip(x, y);
        var copyButton = el.querySelector('.debug-hover-copy');
        copyButton.addEventListener('click', function () {
            var text = copyText !== null ? copyText : token;
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).catch(function () {});
            }
            setCopyLabel(copyButton);
        });
        hoverState = {editorKey: 'template', cm: cm, token: token};
    }

    // --- C-CDA message hover -----------------------------------------------------------
    // Same body as src/lib/parsers/ccda/ccdaHover.js (ccdaHover.spec.js checks they match).
    function ccdaHoverAt(documentText, line, ch) {
        var text = typeof documentText === 'string' ? documentText : '';
        var n = text.length;

        function decode(raw) {
            return raw.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, function (all, body) {
                if (body === 'amp') {
                    return '&';
                }
                if (body === 'lt') {
                    return '<';
                }
                if (body === 'gt') {
                    return '>';
                }
                if (body === 'quot') {
                    return '"';
                }
                if (body === 'apos') {
                    return "'";
                }
                var code = body.charAt(1) === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
                return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : all;
            });
        }

        function isSpace(c) {
            return c === ' ' || c === '\t' || c === '\n' || c === '\r';
        }

        // Offset of the character under (line, ch). Lines split like CodeMirror: \r\n, \n or \r.
        var offset = 0;
        var lineStart = 0;
        for (var l = 0; l < line; l++) {
            var m = /\r\n|\n|\r/g;
            m.lastIndex = lineStart;
            var found = m.exec(text);
            if (!found) {
                return null;
            }
            lineStart = found.index + found[0].length;
        }
        offset = lineStart + ch;
        if (ch < 0 || offset >= n) {
            return null;
        }

        // --- build the element tree (lenient: an editor document is often half typed) ---
        var elements = [];
        var root = null;
        var stack = [];
        var i = 0;
        while (i < n) {
            if (text.charAt(i) !== '<') {
                var textEnd = text.indexOf('<', i);
                if (textEnd === -1) {
                    textEnd = n;
                }
                var raw = text.slice(i, textEnd);
                if (stack.length > 0 && raw.trim().length > 0) {
                    stack[stack.length - 1].texts.push({start: i, end: textEnd, value: decode(raw)});
                }
                i = textEnd;
                continue;
            }
            var end;
            if (text.startsWith('<!--', i)) {
                end = text.indexOf('-->', i + 4);
                i = end === -1 ? n : end + 3;
            } else if (text.startsWith('<?', i)) {
                end = text.indexOf('?>', i + 2);
                i = end === -1 ? n : end + 2;
            } else if (text.startsWith('<![CDATA[', i)) {
                end = text.indexOf(']]>', i + 9);
                var cdataEnd = end === -1 ? n : end;
                var cdata = text.slice(i + 9, cdataEnd);
                if (stack.length > 0 && cdata.trim().length > 0) {
                    stack[stack.length - 1].texts.push({start: i, end: end === -1 ? n : end + 3, value: cdata});
                }
                i = end === -1 ? n : end + 3;
            } else if (text.startsWith('<!', i)) {
                end = text.indexOf('>', i + 2);
                i = end === -1 ? n : end + 1;
            } else if (text.startsWith('</', i)) {
                end = text.indexOf('>', i + 2);
                var closeEnd = end === -1 ? n : end + 1;
                var closeName = text.slice(i + 2, closeEnd - (end === -1 ? 0 : 1)).trim();
                for (var s = stack.length - 1; s >= 0; s--) {
                    if (stack[s].name === closeName) {
                        stack[s].closeStart = i;
                        stack[s].closeEnd = closeEnd;
                        stack.length = s;
                        break;
                    }
                }
                i = closeEnd;
            } else {
                var p = i + 1;
                while (p < n && !isSpace(text.charAt(p)) && text.charAt(p) !== '/' && text.charAt(p) !== '>') {
                    p++;
                }
                var element = {
                    name: text.slice(i + 1, p),
                    parent: stack.length > 0 ? stack[stack.length - 1] : null,
                    children: [],
                    attrs: [],
                    texts: [],
                    tagStart: i,
                    nameEnd: p,
                    tagEnd: n,
                    closeStart: -1,
                    closeEnd: -1
                };
                var selfClosing = false;
                while (p < n) {
                    while (p < n && isSpace(text.charAt(p))) {
                        p++;
                    }
                    if (p >= n) {
                        break;
                    }
                    var c = text.charAt(p);
                    if (c === '>') {
                        p++;
                        break;
                    }
                    if (c === '/') {
                        if (text.charAt(p + 1) === '>') {
                            selfClosing = true;
                            p += 2;
                            break;
                        }
                        p++;
                        continue;
                    }
                    var attrStart = p;
                    while (p < n && !isSpace(text.charAt(p)) && text.charAt(p) !== '=' && text.charAt(p) !== '>' && text.charAt(p) !== '/') {
                        p++;
                    }
                    var attrName = text.slice(attrStart, p);
                    var attrEnd = p;
                    var attrValue = '';
                    while (p < n && isSpace(text.charAt(p))) {
                        p++;
                    }
                    if (text.charAt(p) === '=') {
                        p++;
                        while (p < n && isSpace(text.charAt(p))) {
                            p++;
                        }
                        var quote = text.charAt(p);
                        var valueStart = p;
                        var valueEnd;
                        if (quote === '"' || quote === "'") {
                            valueStart = p + 1;
                            valueEnd = text.indexOf(quote, valueStart);
                            if (valueEnd === -1) {
                                valueEnd = n;
                            }
                            p = Math.min(valueEnd + 1, n);
                        } else {
                            while (p < n && !isSpace(text.charAt(p)) && text.charAt(p) !== '>') {
                                p++;
                            }
                            valueEnd = p;
                        }
                        attrValue = decode(text.slice(valueStart, valueEnd));
                        attrEnd = p;
                    }
                    element.attrs.push({name: attrName, start: attrStart, end: attrEnd, value: attrValue});
                }
                element.tagEnd = p;
                elements.push(element);
                if (element.parent) {
                    element.parent.children.push(element);
                } else if (!root) {
                    root = element;
                }
                if (!selfClosing) {
                    stack.push(element);
                }
                i = p;
            }
        }
        if (!root) {
            return null;
        }

        function pathOf(element) {
            var segments = [];
            for (var node = element; node; node = node.parent) {
                var segment = node.name.replace(':', '_');
                if (node.parent) {
                    var same = node.parent.children.filter(function (sibling) {
                        return sibling.name === node.name;
                    });
                    if (same.length > 1) {
                        segment += '[' + same.indexOf(node) + ']';
                    }
                }
                segments.unshift(segment);
            }
            return 'msg.' + segments.join('.');
        }

        // --- locate the cursor ---
        for (var e = 0; e < elements.length; e++) {
            var el = elements[e];
            if (offset >= el.tagStart && offset < el.tagEnd) {
                for (var a = 0; a < el.attrs.length; a++) {
                    if (offset >= el.attrs[a].start && offset < el.attrs[a].end) {
                        return {path: pathOf(el) + '.' + el.attrs[a].name, value: el.attrs[a].value};
                    }
                }
                return offset < el.nameEnd ? {path: pathOf(el), value: null} : null;
            }
            if (el.closeStart !== -1 && offset >= el.closeStart && offset < el.closeEnd) {
                return {path: pathOf(el), value: null};
            }
            for (var t = 0; t < el.texts.length; t++) {
                if (offset >= el.texts[t].start && offset < el.texts[t].end) {
                    return {
                        path: pathOf(el) + '._' + (el.texts.length > 1 ? '[' + t + ']' : ''),
                        value: el.texts[t].value
                    };
                }
            }
        }
        return null;
    }
    // end ccdaHoverAt

    // --- message editor hover ----------------------------------------------------------

    function handleCcdaMessageHover(cm, pos, x, y) {
        var hit = pos.ch <= cm.getLine(pos.line).length ? ccdaHoverAt(cm.getValue(), pos.line, pos.ch) : null;
        if (!hit) {
            hideTooltip(0);
            return;
        }
        var valueDisplay = hit.value === null ? '' : (hit.value === '' ? 'null (empty / unset)' : JSON.stringify(hit.value));
        var el = ensureTooltip();
        el.innerHTML =
            '<div class="debug-hover-header">' + escapeHtml(hit.path) + ' ' +
            '<button type="button" class="debug-hover-copy">Copy</button></div>' +
            (valueDisplay ? '<div class="debug-hover-value">' + escapeHtml(valueDisplay) + '</div>' : '');
        showTooltip(x, y);
        var copyButton = el.querySelector('.debug-hover-copy');
        copyButton.addEventListener('click', function () {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(hit.path).catch(function () {});
            }
            setCopyLabel(copyButton);
        });
        hoverState = {editorKey: 'data', cm: cm, token: hit.path};
    }

    function handleMessageHover(cm, pos, x, y) {
        if (cm.getOption('mode') === 'xml') {
            handleCcdaMessageHover(cm, pos, x, y);
            return;
        }
        var raw = cm.getLine(pos.line);
        if (raw.length === 0) {
            hideTooltip(0);
            return;
        }
        var info = debugInfo();
        // Separators always come from line 0 (MSH: | at index 3, ^ at index 4), not the hovered line.
        var mshLine = cm.getLine(0) || '';
        var fieldSep = mshLine.length > 3 ? mshLine.charAt(3) : '|';
        var compSep = mshLine.length > 4 ? mshLine.charAt(4) : '^';
        var isHeader = pos.line === 0;
        // Standard HL7 field N is pipe token (N - offset): MSH-1 (the separator
        // itself) has no token of its own, so MSH tokens are shifted back by one
        // (same rule as the unused-segment marking in template-editor.js).
        var offset = isHeader ? 1 : 0;

        // The pointer sits in the token after the (count-1)th separator before pos.ch.
        var sepCount = 0;
        for (var j = 0; j < pos.ch && j < raw.length; j++) {
            if (raw.charAt(j) === fieldSep) {
                sepCount++;
            }
        }
        if (sepCount >= raw.split(fieldSep).length) {
            hideTooltip(0); // pointer in the right-hand margin
            return;
        }
        var start = raw.lastIndexOf(fieldSep, pos.ch - 1) + 1;
        var end = raw.indexOf(fieldSep, pos.ch);
        if (end === -1) {
            end = raw.length;
        }
        var token = raw.substring(start, end);
        var fieldIndex = sepCount + offset;
        var nameEnd = raw.indexOf(fieldSep);
        var segmentName = raw.substring(0, nameEnd === -1 ? raw.length : nameEnd);
        var coord = segmentName + '-' + fieldIndex;
        var compIndex = null;
        var valueText = token;
        if (token.length > 0 && compSep && token.indexOf(compSep) !== -1) {
            var rel = pos.ch - start; // pointer position inside the token
            var compCount = 0;
            for (var c = 0; c < rel; c++) {
                if (token.charAt(c) === compSep) {
                    compCount++;
                }
            }
            compIndex = compCount + 1;
            var compStartPos = compCount === 0 ? 0 : token.lastIndexOf(compSep, rel - 1) + 1;
            var compEndPos = token.indexOf(compSep, compStartPos);
            if (compEndPos === -1) {
                compEndPos = token.length;
            }
            valueText = token.substring(compStartPos, compEndPos);
            coord += '.' + compIndex;
        }
        var liquidExpr = segmentName + '.' + fieldIndex + (compIndex !== null ? '.' + compIndex : '') + '.Value';
        var badgeHtml = '';
        var entry = (function () {
            if (!info || !info.parsedHl7v2 || !info.parsedHl7v2.segments) {
                return null;
            }
            var seg = null;
            for (var s = 0; s < info.parsedHl7v2.segments.length; s++) {
                if (info.parsedHl7v2.segments[s].line === pos.line) {
                    seg = info.parsedHl7v2.segments[s];
                    break;
                }
            }
            if (!seg) {
                return null;
            }
            var field = null;
            for (var f = 0; f < seg.fields.length; f++) {
                if (seg.fields[f].index === fieldIndex) {
                    field = seg.fields[f];
                    break;
                }
            }
            if (!field) {
                return null;
            }
            if (compIndex === null) {
                return {read: field.accessed};
            }
            var repeat0 = field.repeats && field.repeats[0];
            if (!repeat0) {
                return null;
            }
            for (var c = 0; c < repeat0.components.length; c++) {
                if (repeat0.components[c].index === compIndex) {
                    return {read: repeat0.components[c].accessed};
                }
            }
            return null;
        })();
        if (entry) {
            badgeHtml = entry.read
                ? '<span class="debug-hover-badge debug-hover-badge-read">Read</span>'
                : '<span class="debug-hover-badge debug-hover-badge-unused">Unused</span>';
        }
        var valueDisplay = valueText === '' ? 'null (empty / unset)' : JSON.stringify(valueText);
        var el = ensureTooltip();
        el.innerHTML =
            '<div class="debug-hover-header">' + escapeHtml(coord) + ' ' + badgeHtml +
            '<button type="button" class="debug-hover-copy">Copy</button></div>' +
            '<div class="debug-hover-value">' + escapeHtml(valueDisplay) + '</div>' +
            '<div class="debug-hover-sub">Liquid: <code>' + escapeHtml(liquidExpr) + '</code></div>';
        showTooltip(x, y);
        var copyButton = el.querySelector('.debug-hover-copy');
        copyButton.addEventListener('click', function () {
            var text = compIndex !== null ? coord + ' = ' + valueText : coord;
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).catch(function () {});
            }
            setCopyLabel(copyButton);
        });
        hoverState = {editorKey: 'data', cm: cm, token: coord};
    }

    // --- FHIR result lineage (click) ---------------------------------------------------
    // lookupResultLineage mirrors lookupLineage in src/lib/liquid-converter/lineage.js (classic
    // script: no import). `lineage` is debugInfo.lineage: [{outputPath, template, sourcePath}].
    function lookupResultLineage(lineage, path) {
        if (!Array.isArray(lineage) || typeof path !== 'string') {
            return null;
        }
        var best = null;
        lineage.forEach(function (row) {
            var p = row && row.outputPath;
            if (typeof p !== 'string' || p.length === 0) {
                return;
            }
            if ((path === p || path.indexOf(p + '.') === 0) && (!best || p.length > best.outputPath.length)) {
                best = row;
            }
        });
        return best;
    }

    // Dot-joined JSON path of the string or number value that covers `offset` in `text`
    // (array indexes are numeric, e.g. "entry.0.resource.id"). Null for keys, punctuation,
    // booleans and null.
    function jsonValuePathAt(text, offset) {
        var stack = []; // {array: bool, key: string|null, index: number}
        var i = 0;
        var n = text.length;
        function pathNow() {
            return stack.map(function (frame) {
                return frame.array ? String(frame.index) : frame.key;
            }).join('.');
        }
        while (i < n) {
            var ch = text.charAt(i);
            if (ch === '{') {
                stack.push({array: false, key: null, index: 0});
                i++;
            } else if (ch === '[') {
                stack.push({array: true, key: null, index: 0});
                i++;
            } else if (ch === '}' || ch === ']') {
                stack.pop();
                i++;
            } else if (ch === ',') {
                var top = stack[stack.length - 1];
                if (top && top.array) {
                    top.index++;
                }
                i++;
            } else if (ch === '"') {
                var end = i + 1;
                while (end < n && text.charAt(end) !== '"') {
                    end += text.charAt(end) === '\\' ? 2 : 1;
                }
                end++; // past the closing quote
                var after = end;
                while (after < n && /\s/.test(text.charAt(after))) {
                    after++;
                }
                if (text.charAt(after) === ':') {
                    var frame = stack[stack.length - 1];
                    if (frame && !frame.array) {
                        try {
                            frame.key = JSON.parse(text.slice(i, end));
                        } catch (e) {
                            frame.key = text.slice(i + 1, end - 1);
                        }
                    }
                    if (offset >= i && offset < end) {
                        return null;
                    }
                } else if (offset >= i && offset < end) {
                    return pathNow();
                }
                i = end;
            } else if (/[-0-9]/.test(ch)) {
                var numEnd = i + 1;
                while (numEnd < n && /[0-9.eE+-]/.test(text.charAt(numEnd))) {
                    numEnd++;
                }
                if (offset >= i && offset < numEnd) {
                    return pathNow();
                }
                i = numEnd;
            } else {
                i++;
            }
        }
        return null;
    }

    function handleResultClick(cm, pos, x, y) {
        var path = jsonValuePathAt(cm.getValue(), cm.indexFromPos(pos));
        if (path === null || path === '') {
            hideTooltip(0);
            return;
        }
        var info = debugInfo();
        var row = lookupResultLineage(info && info.lineage, path);
        var el = ensureTooltip();
        var body;
        if (row && row.template) {
            body = '<div class="debug-hover-value">Template: ' + escapeHtml(row.template) + '</div>' +
                (row.sourcePath ? '<div class="debug-hover-value">Source: ' + escapeHtml(row.sourcePath) + '</div>' : '');
        } else {
            body = '<div class="debug-hover-value">No source recorded</div>';
        }
        el.innerHTML = '<div class="debug-hover-header">' + escapeHtml(path) + '</div>' + body;
        showTooltip(x, y);
        hoverState = {editorKey: 'result', cm: cm, token: path};
    }

    // --- wiring ------------------------------------------------------------------------

    function editorKeyFor(cm) {
        if (typeof dataEditor !== 'undefined' && cm === dataEditor) {
            return 'data';
        }
        if (typeof templateCodeEditor !== 'undefined' && cm === templateCodeEditor) {
            return 'template';
        }
        if (typeof outputCode !== 'undefined' && cm === outputCode) {
            return 'result';
        }
        return null;
    }

    function attachEditor(selector) {
        $(selector).each(function () {
            var cm = this.CodeMirror; // CodeMirror 5 stores the instance on its wrapper element, not in jQuery data
            if (!cm) {
                return;
            }
            var key = editorKeyFor(cm);
            var lastEvent = null;
            var instance = cm;
            if (key === 'result') {
                // The result pane is read-only: a click (not a hover) shows where a value came from.
                this.addEventListener('click', function (event) {
                    if (instance.somethingSelected()) {
                        return;
                    }
                    var clicked = instance.coordsChar({left: event.clientX, top: event.clientY}, 'window');
                    if (!clicked || clicked.outside) {
                        hideTooltip(0);
                        return;
                    }
                    handleResultClick(instance, clicked, event.clientX, event.clientY);
                });
                instance.on('scroll', function () {
                    if (hoverState && hoverState.editorKey === 'result') {
                        hideTooltip(0);
                    }
                });
                return;
            }
            // CodeMirror 5 never signals mousemove or mouseleave on the instance, so listen on the wrapper.
            this.addEventListener('mousemove', function (event) {
                lastEvent = event;
                if (hoverTimer) {
                    clearTimeout(hoverTimer);
                }
                hoverTimer = setTimeout(function () {
                    hoverTimer = null;
                    if (!lastEvent) {
                        return;
                    }
                    var pos = instance.coordsChar({left: lastEvent.clientX, top: lastEvent.clientY}, 'window');
                    if (!pos) {
                        hideTooltip(0);
                        return;
                    }
                    if (key === 'template') {
                        handleTemplateHover(instance, pos, lastEvent.clientX, lastEvent.clientY);
                    } else if (key === 'data') {
                        handleMessageHover(instance, pos, lastEvent.clientX, lastEvent.clientY);
                    }
                }, HOVER_DEBOUNCE_MS);
            });
            this.addEventListener('mouseleave', function () {
                hideTooltip(LEAVE_GRACE_MS);
            });
            cm.on('scroll', function () {
                if (hoverState && hoverState.editorKey === key) {
                    hideTooltip(0);
                }
            });
        });
    }

    $(document).ready(function () {
        attachEditor('.template-editor .CodeMirror');
        attachEditor('.msg-area .CodeMirror');
        attachEditor('.output-area .CodeMirror');
        $(document).on('keydown', function (event) {
            if (event.key === 'Escape') {
                hideTooltip(0);
            }
        });
        $(document).on('fhir:debug-updated', function () {
            // Latest conversion replaced the data: drop any stale tooltip.
            hideTooltip(0);
        });
    });
})();
