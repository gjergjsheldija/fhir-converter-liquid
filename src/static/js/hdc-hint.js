// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

// Liquid template keywords
const liquidBlockKeywords = ['if', 'elsif', 'else', 'endif', 'unless', 'endunless', 'case', 'when', 'endcase', 'for', 'endfor', 'tablerow', 'endtablerow', 'capture', 'endcapture', 'assign', 'increment', 'decrement', 'include', 'render', 'comment', 'endcomment', 'raw', 'endraw']; 
const liquidLoopKeywords = ['forloop.index', 'forloop.index0', 'forloop.first', 'forloop.last', 'forloop.length', 'forloop.rindex', 'forloop.rindex0']; 
const liquidFilterKeywords = ['abs', 'append', 'at_least', 'at_most', 'capitalize', 'ceil', 'compact', 'concat', 'date', 'default', 'divided_by', 'downcase', 'escape', 'first', 'floor', 'join', 'last', 'lstrip', 'map', 'minus', 'modulo', 'newline_to_br', 'plus', 'prepend', 'remove', 'remove_first', 'replace', 'replace_first', 'reverse', 'round', 'rstrip', 'size', 'slice', 'sort', 'split', 'strip', 'strip_html', 'strip_newlines', 'times', 'truncate', 'truncatewords', 'uniq', 'upcase', 'url_decode', 'url_encode', 'where'];
const varNameRegexp = /as\s+\|(\w+)\||'(\w\w\w)'/g;
const helpersHintRegexp = /\($/;
const mixHintRegexp = /{{$/;
const tagHintRegexp = /{%\s*$/;
const varNamesHintRegexp = /{%\s*(if|unless|for)\s$/;
const templatesHintRegexp = /{%\s*(include|render)\s$/;
const filterHintRegexp = /\|\s*$/;
var hintAfterChars = {};
var helperNames;
var hintExtraKeysObj = {};

initHintAfterChars();
initHintExtraKeysObj();
initHelperList();

function initHintExtraKeysObj() {
    hintExtraKeysObj[`"Ctrl-Space"`] = "autocomplete";
    hintExtraKeysObj["'>'"] = completeAfter;
    hintExtraKeysObj["'('"] = completeAfter;
    hintExtraKeysObj["'{'"] = completeAfter;
    hintExtraKeysObj["' '"] = completeAfter;
    hintExtraKeysObj["'@'"] = completeAfter;
    Object.keys(hintAfterChars).forEach(c => { hintExtraKeysObj[`"${c}"`] = completeAfter; });
}

function getVarNames(editor, startLine, endLine) {
    var varNames = [];
    for (var lineNum = startLine; lineNum < endLine; ++lineNum) {
        var text = editor.getLine(lineNum);
        if (varNameRegexp.test(text)) {
            varNameRegexp.lastIndex = 0;
            varNames.push(...[...text.matchAll(varNameRegexp)].map(match => match[1] || match[2]));
        }
    }
    varNames.push('this');
    return varNames;
}

function initHintAfterChars() {
    var charList = ['-', '_', '.', '/', '#'];
    for (var i = 'a'.charCodeAt(0); i <= 'z'.charCodeAt(0); i++) {
        charList.push(String.fromCharCode(i));
    }
    for (var j = 'A'.charCodeAt(0); j <= 'Z'.charCodeAt(0); j++) {
        charList.push(String.fromCharCode(j));
    }
    for (var k = '0'.charCodeAt(0); k <= '9'.charCodeAt(0); k++) {
        charList.push(String.fromCharCode(k));
    }
    charList.forEach(c => hintAfterChars[c] = true);
}

function initHelperList() {
    /*global getApiKey*/
    $.getJSON('/api/v1/helpers?code=' + getApiKey(), function (helperList) {
        helperNames = helperList;
    });
}

function completeAfter(cm, pred) {
    if (!pred || pred()) setTimeout(function () {
        if (!cm.state.completionActive)
            cm.showHint({ completeSingle: false });
    }, 1);
    return CodeMirror.Pass;
}

(function (mod) {
    mod(CodeMirror);
})(function (CodeMirror) {
    "use strict";

    var lineRange = 500;

    CodeMirror.registerHelper("hint", "anyword", function (editor) {
        var cur = editor.getCursor(), curLine = editor.getLine(cur.line);

        var end = cur.ch, start = end;

        while ((start > 0) && hintAfterChars[curLine[start-1]]) {
            --start;
        }

        var candidates = [];
        var slice = curLine.slice(Math.max(0, start - 16), start);

        if (filterHintRegexp.test(slice)) {
            // After a pipe character, suggest Liquid filters
            filterHintRegexp.lastIndex = 0;
            candidates.push(...liquidFilterKeywords);
        }
        else if (tagHintRegexp.test(slice)) {
            // After {% , suggest Liquid tag keywords
            tagHintRegexp.lastIndex = 0;
            candidates.push(...liquidBlockKeywords);
        }
        else if (mixHintRegexp.test(slice)) {
            // After {{ , suggest variables and loop keywords
            mixHintRegexp.lastIndex = 0;
            candidates.push(...liquidLoopKeywords);
            getVarNames(editor, Math.max(0, cur.line - lineRange), cur.line).forEach(v => candidates.push(v));
        }
        else if (varNamesHintRegexp.test(slice)) {
            // After if/unless/for, suggest variable names
            varNamesHintRegexp.lastIndex = 0;
            getVarNames(editor, Math.max(0, cur.line - lineRange), cur.line).forEach(v => candidates.push(v));
        }
        else if (templatesHintRegexp.test(slice)) {
            // After include/render, suggest template names
            templatesHintRegexp.lastIndex = 0;
            /*global templateNames*/
            templateNames.forEach(x => candidates.push(x));
        }

        // dedup
        candidates = Array.from(new Set(candidates));

        // filter
        if (start < end) {
            var prefix = curLine.slice(start, end).toLowerCase();
            candidates = candidates.filter(x => x.toLowerCase().indexOf(prefix) != -1);
        }

        candidates.sort();

        return { list: candidates, from: CodeMirror.Pos(cur.line, start), to: CodeMirror.Pos(cur.line, end) };
    });
});