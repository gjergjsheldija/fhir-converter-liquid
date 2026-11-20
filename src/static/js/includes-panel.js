// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------
/* eslint-disable no-undef, no-unused-vars */

function findIncludeRefs(text) {
    var patterns = [
        /{%-?\s*(?:include|render)\s+'([^']+)'/g,
        /{%-?\s*evaluate\s+[A-Za-z_][\w]*\s+using\s+'([^']+)'/g,
        /\{\{>\s*([^\s}]+)/g
    ];
    var all = [];
    patterns.forEach(function (pattern) {
        var match;
        while ((match = pattern.exec(text)) !== null) {
            var quoted = match[1];
            if (quoted) {
                all.push({quoted: quoted, index: match.index});
            }
        }
    });
    var seen = {};
    all.forEach(function (ref) {
        if (seen[ref.quoted] === undefined) {
            seen[ref.quoted] = ref;
        } else if (ref.index < seen[ref.quoted].index) {
            seen[ref.quoted] = ref;
        }
    });
    var refs = Object.keys(seen).map(function (key) {
        return seen[key];
    });
    refs.sort(function (a, b) {
        return a.index - b.index;
    });
    return refs;
}

function targetIncludeFileName(quoted) {
    if (typeof quoted !== 'string') {
        return null;
    }
    var name = quoted.trim();
    if (!name) {
        return null;
    }
    if (name.indexOf('\\') !== -1 || !/^[A-Za-z0-9._/-]+$/.test(name)) {
        return null;
    }
    var segments = name.split('/');
    if (segments.some(function (segment) {
        return segment === '' || segment === '..';
    })) {
        return null;
    }
    if (name.endsWith('.liquid') || name.endsWith('.json')) {
        return name;
    }
    var last = segments[segments.length - 1];
    if (segments.length === 1) {
        return name + '.liquid';
    }
    var lower = name.toLowerCase();
    if (lower.endsWith('codesystem/codesystem') || lower.endsWith('valueset/valueset')) {
        return segments.slice(0, -1).concat(last + '.json').join('/');
    }
    if (last.charAt(0) !== '_') {
        last = '_' + last;
    }
    return segments.slice(0, -1).concat(last + '.liquid').join('/');
}

function templateNameIsOpen(name) {
    if (typeof openTemplates === 'undefined' || !Array.isArray(openTemplates)) {
        return false;
    }
    for (var i = 0; i < openTemplates.length; i++) {
        if (openTemplates[i].name === name) {
            return true;
        }
    }
    return false;
}

function resolveIncludeName(quoted) {
    if (templateNameIsOpen(quoted)) {
        return quoted;
    }
    if (typeof templateNames === 'undefined' || !Array.isArray(templateNames)) {
        var fallbackOpenTarget = targetIncludeFileName(quoted);
        if (fallbackOpenTarget && templateNameIsOpen(fallbackOpenTarget)) {
            return fallbackOpenTarget;
        }
        return null;
    }
    if (templateNames.indexOf(quoted) !== -1) {
        return quoted;
    }
    var openTarget = targetIncludeFileName(quoted);
    if (openTarget && templateNameIsOpen(openTarget)) {
        return openTarget;
    }
    var segments = quoted.split('/');
    if (segments.length === 1) {
        if (templateNames.indexOf(segments[0] + '.liquid') !== -1) {
            return segments[0] + '.liquid';
        }
        return null;
    }
    var lower = quoted.toLowerCase();
    var last = segments[segments.length - 1];
    if (lower.endsWith('codesystem/codesystem') || lower.endsWith('valueset/valueset')) {
        last = last + '.json';
    } else {
        last = '_' + last + '.liquid';
    }
    var resolved = segments.slice(0, segments.length - 1).concat(last).join('/');
    if (templateNames.indexOf(resolved) !== -1) {
        return resolved;
    }
    return null;
}

function findPartialNamesOnLine(lineText) {
    var patterns = [
        /{%-?\s*(?:include|render)\s+'([^']+)'/g,
        /{%-?\s*evaluate\s+[A-Za-z_][\w]*\s+using\s+'([^']+)'/g,
        /\{\{>\s*([^\s}]+)/g
    ];
    var matches = [];
    patterns.forEach(function (pattern) {
        var match;
        while ((match = pattern.exec(lineText)) !== null) {
            var quoted = match[1];
            if (!quoted) {
                continue;
            }
            var targetFile = targetIncludeFileName(quoted);
            if (!targetFile) {
                continue;
            }
            var name = resolveIncludeName(quoted);
            var start = match.index + match[0].length - quoted.length;
            matches.push({
                start: start,
                end: start + quoted.length,
                quoted: quoted,
                name: name,
                exists: Boolean(name)
            });
        }
    });
    matches.sort(function (a, b) {
        return a.start - b.start;
    });
    return matches;
}

function openOrCreateInclude(quoted) {
    var name = resolveIncludeName(quoted);
    if (name) {
        addTab(name, activeTemplate ? activeTemplate.name : null);
        return;
    }
    var targetFile = targetIncludeFileName(quoted);
    if (!targetFile) {
        showConversionError('Invalid include name.');
        return;
    }
    openLocalTemplate(targetFile, '', true, activeTemplate ? activeTemplate.name : null);
    templateCodeEditor.focus();
}

function includeGroupKey(quoted) {
    var slash = quoted.indexOf('/');
    return slash === -1 ? 'Root' : quoted.slice(0, slash);
}

function includeRowLabel(quoted) {
    var slash = quoted.indexOf('/');
    return slash === -1 ? quoted : quoted.slice(slash + 1);
}

function underlinePartialTemplateNames(doc, change) {
    var startLine = change ? change.from.line : doc.firstLine();
    var endLine = (change ? change.to.line : doc.lastLine()) + 1;

    // remove marks before adding new one, only check changed lines if passed
    activeTemplate.marks = activeTemplate.marks.filter(function (mark) {
        var section = mark.find();
        if (section) {
            if (section.from.line >= startLine && section.to.line < endLine) {
                mark.clear();
                return false;
            }
        } else {
            return false;
        }

        return true;
    });

    doc.eachLine(startLine, endLine, function (line) {
        findPartialNamesOnLine(line.text).forEach(function (nameLocation) {
            activeTemplate.marks.push(
                doc.markText(
                    {
                        line: line.lineNo(),
                        ch: nameLocation.start
                    },
                    {
                        line: line.lineNo(),
                        ch: nameLocation.end
                    },
                    {
                        className: nameLocation.exists ? 'include-link' : 'include-missing'
                    }
                )
            );
        });
    });
}

function renderIncludedPanel() {
    var text = (typeof activeTemplate !== 'undefined' && activeTemplate) ? activeTemplate.data : '';
    var items = findIncludeRefs(text).map(function (ref) {
        return {
            quoted: ref.quoted,
            name: resolveIncludeName(ref.quoted),
            targetFile: targetIncludeFileName(ref.quoted)
        };
    });
    if (items.length === 0) {
        $('#includes-menu-wrap').attr('hidden', true);
        $('#includes-groups').empty();
        return;
    }
    $('#includes-menu-wrap').removeAttr('hidden');
    var missing = items.filter(function (item) {
        return !item.name && item.targetFile;
    });
    var existing = items.filter(function (item) {
        return Boolean(item.name);
    });
    $('#includes-menu-label').text('Includes (' + items.length + (missing.length ? ' · ' + missing.length + ' new' : '') + ')');
    $('#includes-filter').attr('hidden', items.length <= 6);
    var groups = $('#includes-groups').empty();
    if (missing.length) {
        var missingGroup = $('<div class="include-group"></div>');
        missingGroup.append($('<div class="include-group-heading"></div>').text('Missing — click to create'));
        missing.forEach(function (item) {
            var row = makeIncludeRow(item, '+ Create ' + item.targetFile, item.quoted);
            missingGroup.append(row);
        });
        groups.append(missingGroup);
    }
    var byGroup = {};
    existing.forEach(function (item) {
        var key = includeGroupKey(item.quoted);
        if (!byGroup[key]) {
            byGroup[key] = [];
        }
        byGroup[key].push(item);
    });
    Object.keys(byGroup).sort(function (a, b) {
        return a.localeCompare(b);
    }).forEach(function (key) {
        var group = $('<div class="include-group"></div>');
        group.append($('<div class="include-group-heading"></div>').text(key + ' (' + byGroup[key].length + ')'));
        byGroup[key].forEach(function (item) {
            group.append(makeIncludeRow(item, includeRowLabel(item.quoted), item.name));
        });
        groups.append(group);
    });
    applyIncludesFilter($('#includes-filter').val() || '');
}

function makeIncludeRow(item, label, title) {
    var row = $('<button type="button" class="include-row"></button>')
        .attr('data-search', ((item.quoted + ' ' + (item.name || item.targetFile || '')) + '').toLowerCase());
    var labelSpan = $('<span class="include-row-label"></span>').text(label);
    if (title) {
        labelSpan.attr('title', title);
    }
    row.append(labelSpan);
    if (!item.name && item.targetFile) {
        row.append($('<span class="include-row-sub"></span>').text(item.quoted));
    }
    row.on('click', function () {
        openOrCreateInclude(item.quoted);
        closeIncludesPopover();
    });
    return row;
}

function applyIncludesFilter(value) {
    var filter = (value || '').toLowerCase();
    $('#includes-groups .include-group').each(function () {
        var group = $(this);
        var visible = 0;
        group.children('.include-row').each(function () {
            var row = $(this);
            var matches = row.attr('data-search').indexOf(filter) !== -1;
            row.toggle(matches);
            if (matches) {
                visible += 1;
            }
        });
        group.toggle(visible > 0);
    });
}

function openIncludesPopover() {
    $('#includes-popover').removeAttr('hidden');
    $('#includes-menu-button').attr('aria-expanded', 'true');
    $('#includes-filter').trigger('focus');
}

function closeIncludesPopover() {
    $('#includes-popover').attr('hidden', true);
    $('#includes-menu-button').attr('aria-expanded', 'false');
}

function bindTemplateIncludeNavigation(cm) {
    if (!cm || typeof cm.on !== 'function') {
        return;
    }
    cm.on('dblclick', function () {
        var doc = cm.getDoc();
        var cursorPos = doc.getCursor();
        var lineText = doc.getLine(cursorPos.line);
        var matches = findPartialNamesOnLine(lineText);
        var nameLocation = matches.find(function (match) {
            return cursorPos.ch >= match.start && cursorPos.ch <= match.end;
        });

        if (nameLocation) {
            openOrCreateInclude(nameLocation.quoted);
        }
    });

    cm.on('mousedown', function (instance, event) {
        if (!(event.metaKey || event.ctrlKey)) {
            return;
        }
        var pos = cm.coordsChar({left: event.clientX, top: event.clientY});
        var lineText = cm.getDoc().getLine(pos.line);
        var matches = findPartialNamesOnLine(lineText);
        var nameLocation = matches.find(function (match) {
            return pos.ch >= match.start && pos.ch <= match.end;
        });

        if (nameLocation) {
            openOrCreateInclude(nameLocation.quoted);
        }
    });
}

var _includesGlobal = typeof globalThis !== 'undefined' ? globalThis : window;
_includesGlobal.findIncludeRefs = findIncludeRefs;
_includesGlobal.targetIncludeFileName = targetIncludeFileName;
_includesGlobal.templateNameIsOpen = templateNameIsOpen;
_includesGlobal.resolveIncludeName = resolveIncludeName;
_includesGlobal.findPartialNamesOnLine = findPartialNamesOnLine;
_includesGlobal.openOrCreateInclude = openOrCreateInclude;
_includesGlobal.includeGroupKey = includeGroupKey;
_includesGlobal.includeRowLabel = includeRowLabel;
_includesGlobal.underlinePartialTemplateNames = underlinePartialTemplateNames;
_includesGlobal.renderIncludedPanel = renderIncludedPanel;
_includesGlobal.makeIncludeRow = makeIncludeRow;
_includesGlobal.applyIncludesFilter = applyIncludesFilter;
_includesGlobal.openIncludesPopover = openIncludesPopover;
_includesGlobal.closeIncludesPopover = closeIncludesPopover;
_includesGlobal.bindTemplateIncludeNavigation = bindTemplateIncludeNavigation;

if (typeof $ === 'function' && typeof document !== 'undefined') {
    $(document).ready(function () {
        $('#includes-menu-button').on('click', function (event) {
            event.stopPropagation();
            if ($('#includes-popover').attr('hidden') !== undefined) {
                openIncludesPopover();
            } else {
                closeIncludesPopover();
            }
        });

        $(document).on('click', function (event) {
            if ($('#includes-popover').attr('hidden') === undefined && !$(event.target).closest('#includes-menu-wrap').length) {
                closeIncludesPopover();
            }
        });

        $(document).on('keydown', function (event) {
            if (event.key === 'Escape' && $('#includes-popover').attr('hidden') === undefined) {
                closeIncludesPopover();
            }
        });

        $('#includes-filter').on('input', function () {
            applyIncludesFilter($(this).val());
        });
    });
}
