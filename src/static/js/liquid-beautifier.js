// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------
/* eslint-disable no-undef, no-unused-vars */

// In-buffer Liquid + JSON template beautifier.
//
// - 4-space indentation; newline endings; exactly one trailing newline.
// - Liquid block tags adjust the indent depth:
//     openers: if, unless, for, case, capture, tablerow (+1 after the line)
//     closers: end*                                        (-1 before the line)
//     mids:    else, elsif, when                           (rendered one level up, net 0)
// - JSON braces/brackets outside strings and tags adjust the indent depth.
// - Leading '}' / ']' on a line reduce that line's indent (clamped at 0).
// - {% comment %} and {% raw %} bodies are preserved byte-verbatim; the opener and
//   closer lines are emitted at the opener's depth.
// - Tag delimiter padding is normalized to a single space while whitespace-control
//   '-' flags are preserved byte-for-byte. Quoted strings are never altered.
// - Runs render-equivalent: it only re-indents lines and normalizes whitespace
//   adjacent to tag delimiters, never tag arguments, expressions, or strings.

var LIQUID_OPENERS = { if: true, unless: true, for: true, case: true, capture: true, tablerow: true };
var LIQUID_MIDS = { else: true, elsif: true, when: true };

function normalizeTag(rawTag) {
    var startTag = rawTag.slice(0, 2); // '{%' or '{{'
    var inner = rawTag.slice(2, rawTag.length - 2);
    var dashLead = false;
    var dashTrail = false;
    // A '-' directly adjacent to the opening delimiter ('{%-', '{{-') or the
    // closing one ('-%}', '-}}') is unconditionally Liquid's whitespace-control
    // flag: no tag name or expression can start or end with a bare '-', so the
    // tight forms ('{%-assign', 'x=%}') are trim flags just like the spaced ones.
    if (inner.charAt(0) === '-') {
        dashLead = true;
        inner = inner.slice(1);
    }
    if (inner.charAt(inner.length - 1) === '-') {
        dashTrail = true;
        inner = inner.slice(0, inner.length - 1);
    }
    var content = inner.replace(/^\s+/, '').replace(/\s+$/, '');
    return startTag + (dashLead ? '-' : '') + ' ' + content + ' ' + (dashTrail ? '-' : '') + rawTag.slice(-2);
}

function tagName(normalizedTag) {
    if (normalizedTag.charAt(0) === '{' && normalizedTag.charAt(1) === '{') {
        return '';
    }
    var match = normalizedTag.match(/^\{%-?\s*([A-Za-z_][A-Za-z0-9_]*)/);
    return match ? match[1] : '';
}

function beautifyLiquidTemplate(source) {
    var lines = String(source).split('\n');
    var output = [];
    var liquidDepth = 0;
    var jsonDepth = 0;
    var verbatim = null; // { name, depth } while inside {% comment %} / {% raw %}
    var blankStreak = 0;

    lines.forEach(function (line) {
        if (verbatim) {
            var closerName = verbatim.name === 'comment' ? 'endcomment' : 'endraw';
            var closerMatch = line.match(new RegExp('\\{%-?\\s*' + closerName + '\\s*-?%}'));
            if (closerMatch) {
                var closerIndent = '    '.repeat(verbatim.depth);
                var closerTag = normalizeTag(closerMatch[0]);
                output.push(closerIndent + line.replace(/^\s+/, '').replace(closerMatch[0], closerTag));
                verbatim = null;
                blankStreak = 0;
            } else {
                output.push(line); // verbatim body: byte-for-byte, even blank lines
            }
            return;
        }

        var isBlank = line.trim() === '';
        if (isBlank) {
            blankStreak += 1;
            if (blankStreak === 1) {
                output.push('');
            }
            return;
        }
        blankStreak = 0;

        var content = line.replace(/^\s+/, '');
        var closerAtLineStart = 0;
        for (var p = 0; p < content.length && (content.charAt(p) === '}' || content.charAt(p) === ']'); p += 1) {
            closerAtLineStart += 1;
        }

        var inString = false;
        var jsonDelta = 0;
        var liquidOpeners = 0;
        var liquidClosers = 0;
        var midAtLine = false;
        var i = 0;
        var out = '';

        while (i < content.length) {
            var c = content.charAt(i);
            if (inString) {
                // String contents are preserved byte-for-byte, including escapes.
                if (c === '\\') {
                    out += c + content.charAt(i + 1);
                    i += 2;
                } else {
                    out += c;
                    if (c === '"') {
                        inString = false;
                    }
                    i += 1;
                }
                continue;
            }
            if (c === '"') {
                inString = true;
                out += c;
                i += 1;
                continue;
            }
            if (c === '{' && (content.charAt(i + 1) === '%' || content.charAt(i + 1) === '{')) {
                var closeDelim = content.charAt(i + 1) === '%' ? '%}' : '}}';
                var j = content.indexOf(closeDelim, i + 2);
                if (j === -1) {
                    // Unclosed tag on this line: keep the remainder verbatim.
                    out += content.slice(i);
                    i = content.length;
                    continue;
                }
                var rawTag = content.slice(i, j + 2);
                var normalized = normalizeTag(rawTag);
                out += normalized;
                var name = tagName(normalized);
                if (name === 'comment' || name === 'raw') {
                    out += content.slice(j + 2); // body after the opener is verbatim
                    verbatim = { name: name, depth: liquidDepth + jsonDepth };
                    i = content.length;
                    continue;
                }
                if (LIQUID_OPENERS[name]) {
                    liquidOpeners += 1;
                } else if (name.length > 3 && name.charAt(0) === 'e' && name.charAt(1) === 'n' && name.charAt(2) === 'd') {
                    liquidClosers += 1;
                } else if (LIQUID_MIDS[name]) {
                    midAtLine = true;
                }
                i = j + 2;
                continue;
            }
            if (c === '{' || c === '[') {
                jsonDelta += 1;
            } else if (c === '}' || c === ']') {
                jsonDelta -= 1;
            }
            out += c;
            i += 1;
        }

        var liquidBefore = liquidDepth;
        var jsonBefore = jsonDepth;
        liquidDepth = Math.max(0, liquidDepth - liquidClosers + liquidOpeners);
        jsonDepth = Math.max(0, jsonDepth + jsonDelta);

        var liquidLineDepth = Math.max(0, liquidBefore - (liquidClosers > 0 || midAtLine ? 1 : 0));
        var jsonLineDepth = Math.max(0, jsonBefore - closerAtLineStart);
        var tagAtLineStart = content.charAt(0) === '{' && (content.charAt(1) === '%' || content.charAt(1) === '{');
        if (tagAtLineStart && liquidLineDepth === 0) {
            // Top-level liquid tag lines (depth 0) sit at the template root and
            // are emitted at their liquid depth alone, without the JSON depth.
            jsonLineDepth = 0;
        }
        var indent = '    '.repeat(liquidLineDepth + jsonLineDepth);
        output.push(indent + out);
    });

    while (output.length > 0 && output[output.length - 1] === '') {
        output.pop();
    }
    var result = output.join('\n');
    return result.length === 0 ? '' : result + '\n';
}

(typeof globalThis !== 'undefined' ? globalThis : window).beautifyLiquidTemplate = beautifyLiquidTemplate;
