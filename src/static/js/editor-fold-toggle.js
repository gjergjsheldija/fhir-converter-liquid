/* eslint-disable no-undef, no-unused-vars */
// Stateful Fold All / Unfold All toggle controls for the Liquid template editor
// (templateCodeEditor) and the FHIR result JSON editor (outputCode).
// Classic browser script (no ES module import/export). Pure helpers are exposed on
// globalThis so Node mocha tests can exercise folding behavior directly.

var FOLD_ICON_HREF = '/icons.svg#icon-fold-all';
var UNFOLD_ICON_HREF = '/icons.svg#icon-unfold-all';

function hasFoldedSections(cm) {
    if (!cm || typeof cm.getAllMarks !== 'function') {
        return false;
    }
    var marks = cm.getAllMarks();
    for (var i = 0; i < marks.length; i++) {
        if (marks[i] && marks[i].__isFold) {
            return true;
        }
    }
    return false;
}

function getFoldRangeAtLine(cm, line) {
    if (typeof CodeMirror === 'undefined' || !cm || typeof cm.foldOption !== 'function') {
        return null;
    }
    var finder = cm.foldOption(null, 'rangeFinder');
    if (typeof finder !== 'function') {
        return null;
    }
    return finder(cm, CodeMirror.Pos(line, 0));
}

function hasExactFoldStart(cm, fromPos) {
    if (!cm || !fromPos || typeof cm.getAllMarks !== 'function') {
        return false;
    }
    var marks = cm.getAllMarks();
    for (var i = 0; i < marks.length; i++) {
        var mark = marks[i];
        if (!mark || !mark.__isFold || typeof mark.find !== 'function') {
            continue;
        }
        var loc = mark.find();
        if (loc && loc.from && loc.from.line === fromPos.line && loc.from.ch === fromPos.ch) {
            return true;
        }
    }
    return false;
}

// Folds every foldable section AND nested subsection so that when the user opens
// a main/outer section, all inner subsections remain folded.
function foldAllEditorSections(cm) {
    if (!cm || typeof cm.operation !== 'function' || typeof cm.foldCode !== 'function') {
        return 0;
    }
    var posCtor = (typeof CodeMirror !== 'undefined' && CodeMirror.Pos)
        ? CodeMirror.Pos
        : function (line, ch) { return { line: line, ch: ch }; };
    var foldedCount = 0;

    cm.operation(function () {
        for (var line = cm.firstLine(), end = cm.lastLine(); line <= end; line++) {
            var range = getFoldRangeAtLine(cm, line);
            if (!range || !range.from || !range.to || range.to.line <= range.from.line) {
                continue;
            }
            if (hasExactFoldStart(cm, range.from)) {
                continue;
            }
            cm.foldCode(posCtor(line, 0), { scanUp: false }, 'fold');
            foldedCount++;
        }
    });

    return foldedCount;
}

function unfoldAllEditorSections(cm) {
    if (!cm || typeof cm.operation !== 'function' || typeof cm.getAllMarks !== 'function') {
        return 0;
    }
    var cleared = 0;
    cm.operation(function () {
        var marks = cm.getAllMarks().slice();
        for (var i = 0; i < marks.length; i++) {
            if (marks[i] && marks[i].__isFold && typeof marks[i].clear === 'function') {
                marks[i].clear();
                cleared++;
            }
        }
    });
    return cleared;
}

function syncFoldToggleButtonState(buttonEl, isFolded) {
    if (!buttonEl) {
        return;
    }
    var folded = Boolean(isFolded);
    var label = folded ? 'Unfold all sections' : 'Fold all sections';
    var href = folded ? UNFOLD_ICON_HREF : FOLD_ICON_HREF;
    buttonEl.setAttribute('aria-pressed', folded ? 'true' : 'false');
    buttonEl.setAttribute('data-folded', folded ? 'true' : 'false');
    buttonEl.setAttribute('aria-label', label);
    buttonEl.setAttribute('title', label);
    var useEl = buttonEl.querySelector('use');
    if (useEl) {
        useEl.setAttribute('href', href);
    }
}

function toggleEditorFoldAll(cm, buttonEl) {
    if (!cm) {
        return false;
    }
    var isButtonFolded = buttonEl && typeof buttonEl.getAttribute === 'function'
        ? buttonEl.getAttribute('data-folded') === 'true'
        : hasFoldedSections(cm);

    if (isButtonFolded && hasFoldedSections(cm)) {
        unfoldAllEditorSections(cm);
    } else {
        foldAllEditorSections(cm);
    }
    var nextFolded = hasFoldedSections(cm);
    syncFoldToggleButtonState(buttonEl, nextFolded);
    return nextFolded;
}

function bindEditorFoldToggle(cm, buttonSelector) {
    if (!cm || typeof document === 'undefined') {
        return;
    }
    var btn = document.querySelector(buttonSelector);
    if (!btn) {
        return;
    }
    var syncAfterEditorChange = function () {
        if (!hasFoldedSections(cm)) {
            syncFoldToggleButtonState(btn, false);
        }
    };
    btn.addEventListener('click', function () {
        toggleEditorFoldAll(cm, btn);
    });
    if (typeof cm.on === 'function') {
        cm.on('unfold', syncAfterEditorChange);
        cm.on('change', syncAfterEditorChange);
        cm.on('swapDoc', syncAfterEditorChange);
    }
    syncFoldToggleButtonState(btn, false);
}

var _foldGlobal = typeof globalThis !== 'undefined' ? globalThis : window;
_foldGlobal.hasFoldedSections = hasFoldedSections;
_foldGlobal.foldAllEditorSections = foldAllEditorSections;
_foldGlobal.unfoldAllEditorSections = unfoldAllEditorSections;
_foldGlobal.syncFoldToggleButtonState = syncFoldToggleButtonState;
_foldGlobal.toggleEditorFoldAll = toggleEditorFoldAll;
_foldGlobal.bindEditorFoldToggle = bindEditorFoldToggle;

if (typeof $ !== 'undefined' && typeof document !== 'undefined') {
    $(document).ready(function () {
        if (typeof templateCodeEditor !== 'undefined' && templateCodeEditor) {
            bindEditorFoldToggle(templateCodeEditor, '#fold-template-button');
        }
        if (typeof outputCode !== 'undefined' && outputCode) {
            bindEditorFoldToggle(outputCode, '#fold-result-button');
        }
    });
}
