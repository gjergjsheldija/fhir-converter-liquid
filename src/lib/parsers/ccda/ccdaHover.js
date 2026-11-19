// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

// Maps a cursor position in a C-CDA (XML) document to the Liquid path of the parsed `msg` model
// (see `parseCcda`): attributes are keys without `@`, text is `_`, a tag prefix becomes `_`
// (`sdtc:raceCode` -> `sdtc_raceCode`), and a repeated sibling is indexed from 0.
//
// The same function body is copied into src/static/js/debug-hover.js (a classic browser script,
// so it cannot import this module). ccdaHover.spec.js fails when the two copies drift apart.
// Keep the body self-contained and free of `export`, and keep the end marker below.
export function ccdaHoverAt(documentText, line, ch) {
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
