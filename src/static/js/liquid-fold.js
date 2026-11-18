// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------
/* eslint-disable no-undef, no-unused-vars */
// Liquid block fold range finder for the template editor (CodeMirror 5):
// folds multi-line Liquid blocks ({% comment %}, {% raw %}, {% if %}, {% unless %},
// {% for %}, {% capture %}, {% case %}, {% tablerow %}) while keeping the closing
// tag line visible, and returns undefined otherwise so CodeMirror.fold.brace can
// still fold JSON {...}/[...] blocks. The template editor runs the "liquid-json"
// multiplex mode, which provides no indent/fold hook of its own, so this helper
// is registered as CodeMirror.fold.liquid and combined with fold.brace via
// foldOptions.rangeFinder in template-editor.js.
// The pure helper findLiquidBlockEnd(getLine, lineCount, startLine) is attached
// to globalThis so Node mocha tests can import this classic browser script and
// unit-test it (no export statement).

var LIQUID_BLOCK_TAGS = ["comment", "raw", "if", "unless", "for", "capture", "case", "tablerow"];
var LIQUID_TAG_RE = /\{%-?\s*(end(?:comment|raw|if|unless|for|capture|case|tablerow)|comment|raw|if|unless|for|capture|case|tablerow)\b([\s\S]*?)-?%\}/g;

function liquidClosingType(name) {
    if (name.slice(0, 3) !== "end") {
        return null;
    }
    var type = name.slice(3);
    return LIQUID_BLOCK_TAGS.indexOf(type) >= 0 ? type : null;
}

// Scans lineNo lineText with the shared tag regex against the pending stack of
// open block tags. Returns { endLine, closeTagStartCh } the moment the stack
// becomes empty (the outermost open block closed), otherwise null.
function scanLiquidLine(lineNo, lineText, pending) {
    LIQUID_TAG_RE.lastIndex = 0;
    var match;
    while ((match = LIQUID_TAG_RE.exec(lineText))) {
        var name = match[1];
        var top = pending[pending.length - 1];
        if (top && (top.name === "comment" || top.name === "raw")) {
            // Inside a comment/raw block ignore every nested tag except the
            // matching endcomment/endraw.
            if (name === "end" + top.name) {
                pending.pop();
                if (pending.length === 0) {
                    return { endLine: lineNo, closeTagStartCh: match.index };
                }
            }
            continue;
        }
        var closingType = liquidClosingType(name);
        if (closingType === null) {
            // Opening tag: increment the depth of this tag type.
            pending.push({ name: name, endCh: match.index + match[0].length });
        } else {
            // Closing tag: decrement the depth of the same tag type (most recent first).
            for (var i = pending.length - 1; i >= 0; i--) {
                if (pending[i].name === closingType) {
                    pending.splice(i, 1);
                    break;
                }
            }
            if (pending.length === 0) {
                return { endLine: lineNo, closeTagStartCh: match.index };
            }
        }
    }
    return null;
}

function findLiquidBlockEnd(getLine, lineCount, startLine) {
    if (typeof startLine !== "number" || startLine < 0 || startLine >= lineCount) {
        return undefined;
    }
    var pending = []; // block tags opened on startLine that are still unclosed, in order
    scanLiquidLine(startLine, getLine(startLine), pending);
    if (pending.length === 0) {
        // No unclosed Liquid block opens on startLine; fall through to brace folding.
        return undefined;
    }
    var openTagEndCh = pending[0].endCh; // first unmatched opener on startLine
    var lineNo;
    var done;
    for (lineNo = startLine + 1; lineNo < lineCount; lineNo++) {
        done = scanLiquidLine(lineNo, getLine(lineNo), pending);
        if (done) {
            break;
        }
    }
    if (!done) {
        return undefined; // block never closes
    }
    var endLine = done.endLine;
    // Keep the closing tag line visible: fold up to the end of the previous line
    // for 3+ line blocks, or up to the start of the closing tag on 2-line blocks.
    var toLine;
    var toCh;
    if (endLine > startLine + 1) {
        toLine = endLine - 1;
        toCh = getLine(endLine - 1).length;
    } else {
        toLine = endLine;
        toCh = done.closeTagStartCh;
    }
    return {
        fromLine: startLine,
        fromCh: openTagEndCh,
        toLine: toLine,
        toCh: toCh
    };
}

// Expose the pure helper for Node unit tests (no export statement: classic browser script).
(typeof globalThis !== "undefined" ? globalThis : window).findLiquidBlockEnd = findLiquidBlockEnd;

// Register the CodeMirror fold helper in the browser.
if (typeof CodeMirror !== "undefined") {
    CodeMirror.registerHelper("fold", "liquid", function (cm, pos) {
        var range = findLiquidBlockEnd(function (lineNo) {
            return cm.getLine(lineNo);
        }, cm.lineCount(), pos.line);
        if (!range) {
            return null;
        }
        return {
            from: CodeMirror.Pos(range.fromLine, range.fromCh),
            to: CodeMirror.Pos(range.toLine, range.toCh)
        };
    });
}
