// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------
/* eslint-disable no-undef, no-unused-vars */

/**
 * Chrome-DevTools-style bottom Debug & Inspector drawer (editor Spec 05).
 *
 * Views:
 *   1. Parsed HL7: lazy expandable tree of segments -> fields -> repeats/components
 *      with Read/Unused badges, filter search, click-to-jump in dataEditor, and
 *      one-click Copy Liquid path.
 *   2. Variables & Console: expandable tree of root and included-partial scopes
 *      captured during conversion, plus a live expression prompt with Up/Down history.
 *   3. Diagnostics & Bundle: clickable FHIR Bundle resource index (jumps outputCode)
 *      and clickable unused HL7 components (jumps dataEditor).
 */
(function () {
    'use strict';

    var STORAGE_OPEN_KEY = 'fhirConverterDebugOpen';
    var STORAGE_HEIGHT_KEY = 'fhirConverterDebugHeight';
    var DEFAULT_HEIGHT = 220;
    var MIN_HEIGHT = 130;

    var isOpen = false;
    var activeTab = 'hl7';
    var drawerHeight = DEFAULT_HEIGHT;
    var consoleHistory = [];
    var historyCursor = -1;
    var highlightClearTimer = null;

    function readStorage(key) {
        try {
            return localStorage.getItem(key);
        } catch (ex) {
            return null;
        }
    }

    function writeStorage(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (ex) {
            return;
        }
    }

    function clampDrawerHeight(px) {
        var maxH = Math.max(MIN_HEIGHT + 40, Math.min(440, Math.round(window.innerHeight * 0.55)));
        return Math.max(MIN_HEIGHT, Math.min(maxH, Math.round(px)));
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatScalar(val) {
        if (val === null || val === undefined) {
            return 'null';
        }
        if (typeof val === 'string') {
            return JSON.stringify(val);
        }
        if (typeof val === 'number' || typeof val === 'boolean') {
            return String(val);
        }
        if (Array.isArray(val)) {
            return 'Array(' + val.length + ')';
        }
        if (typeof val === 'object') {
            if (val.__kind === 'hl7Segment' || val.__kind === 'hl7Field' || val.__kind === 'hl7Component') {
                return val.value != null ? JSON.stringify(val.value) : 'null';
            }
            return '{' + Object.keys(val).slice(0, 4).join(', ') + (Object.keys(val).length > 4 ? ', …' : '') + '}';
        }
        return String(val);
    }

    function copyToClipboard(text, btn) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).catch(function () {});
        }
        if (btn) {
            var prev = btn.textContent;
            btn.textContent = 'Copied';
            setTimeout(function () {
                btn.textContent = prev;
            }, 1100);
        }
    }

    function jumpToMessageLine(lineNo, chStart, chEnd) {
        if (typeof dataEditor === 'undefined' || !dataEditor) {
            return;
        }
        var doc = dataEditor.getDoc();
        var clampedLine = Math.max(0, Math.min(doc.lastLine(), lineNo));
        var lineLen = (doc.getLine(clampedLine) || '').length;
        var fromCh = typeof chStart === 'number' ? Math.max(0, Math.min(lineLen, chStart)) : 0;
        var toCh = typeof chEnd === 'number' ? Math.max(fromCh, Math.min(lineLen, chEnd)) : lineLen;
        doc.setSelection({line: clampedLine, ch: fromCh}, {line: clampedLine, ch: toCh});
        dataEditor.scrollIntoView({line: clampedLine, ch: fromCh}, 60);
        dataEditor.focus();
        if (highlightClearTimer) {
            clearTimeout(highlightClearTimer);
        }
        highlightClearTimer = setTimeout(function () {
            highlightClearTimer = null;
        }, 1200);
    }

    function jumpToOutputResource(resourceType, resourceId, entryIndex) {
        if (typeof outputCode === 'undefined' || !outputCode) {
            return;
        }
        var doc = outputCode.getDoc();
        var total = doc.lineCount();
        var targetLine = -1;

        if (resourceId) {
            var idNeedle = '"id": ' + JSON.stringify(resourceId);
            var typeNeedle = '"resourceType": ' + JSON.stringify(resourceType);
            for (var i = 0; i < total; i++) {
                var text = doc.getLine(i);
                if (text.indexOf(idNeedle) !== -1) {
                    var windowStart = Math.max(0, i - 6);
                    var windowEnd = Math.min(total - 1, i + 6);
                    for (var w = windowStart; w <= windowEnd; w++) {
                        if (doc.getLine(w).indexOf(typeNeedle) !== -1) {
                            targetLine = Math.min(i, w);
                            break;
                        }
                    }
                    if (targetLine !== -1) {
                        break;
                    }
                }
            }
        }

        if (targetLine === -1 && typeof entryIndex === 'number') {
            var seenResources = -1;
            for (var lineIdx = 0; lineIdx < total; lineIdx++) {
                if (/^\s*"resource"\s*:\s*\{/.test(doc.getLine(lineIdx))) {
                    seenResources += 1;
                    if (seenResources === entryIndex) {
                        targetLine = lineIdx;
                        break;
                    }
                }
            }
        }

        if (targetLine === -1) {
            targetLine = 0;
        }
        doc.setCursor({line: targetLine, ch: 0});
        outputCode.scrollIntoView({line: targetLine, ch: 0}, 80);
        outputCode.focus();
    }

    // --- Tab 1: Parsed HL7 tree -------------------------------------------------------

    function renderHl7Panel(info, filter) {
        var container = $('#debug-panel-hl7').empty();
        var segments = info && info.parsedHl7v2 && info.parsedHl7v2.segments;
        if (!Array.isArray(segments) || segments.length === 0) {
            container.append($('<div class="debug-empty">Convert an HL7 v2 message to inspect parsed segments and fields.</div>'));
            return;
        }

        var firstSeenByType = {};
        segments.forEach(function (seg) {
            if (firstSeenByType[seg.name] === undefined) {
                firstSeenByType[seg.name] = seg.line;
            }
        });

        var q = (filter || '').trim().toLowerCase();
        var matchedAny = false;

        segments.forEach(function (seg) {
            var isFirstOfType = firstSeenByType[seg.name] === seg.line;
            var matchingFields = (seg.fields || []).filter(function (field) {
                if (!q) {
                    return true;
                }
                var coord = (seg.name + '.' + field.index + ' ' + seg.name + '-' + field.index).toLowerCase();
                return seg.name.toLowerCase().indexOf(q) !== -1
                    || coord.indexOf(q) !== -1
                    || String(field.value || '').toLowerCase().indexOf(q) !== -1;
            });

            if (q && matchingFields.length === 0 && seg.name.toLowerCase().indexOf(q) === -1) {
                return;
            }
            matchedAny = true;

            var node = $('<div class="debug-tree-node"></div>');
            var row = $('<div class="debug-tree-row"></div>');
            var toggle = $('<button type="button" class="debug-tree-toggle" aria-expanded="false"></button>');
            toggle.append($('<span class="debug-tree-chevron" aria-hidden="true">▸</span>'));
            toggle.append($('<span class="debug-tree-key"></span>').text(seg.line + ': ' + seg.name));
            var previewText = String(seg.raw || '');
            if (previewText.length > 72) {
                previewText = previewText.slice(0, 72) + '…';
            }
            toggle.append($('<span class="debug-tree-preview"></span>').text(previewText));

            var jumpBtn = $('<button type="button" class="debug-mini-btn">Line ' + (seg.line + 1) + '</button>');
            jumpBtn.on('click', function (ev) {
                ev.stopPropagation();
                jumpToMessageLine(seg.line);
            });

            var children = $('<div class="debug-tree-children" hidden></div>');
            var populated = false;

            function populateFields() {
                if (populated) {
                    return;
                }
                populated = true;
                var fieldsToShow = q ? matchingFields : (seg.fields || []);
                fieldsToShow.forEach(function (field) {
                    var fieldPath = (isFirstOfType ? 'firstSegments.' : '') + seg.name + '.' + field.index + '.Value';
                    var fieldNode = $('<div class="debug-tree-node"></div>');
                    var fieldRow = $('<div class="debug-tree-row"></div>');
                    var hasSubItems = (field.repeats && field.repeats.length > 1)
                        || (field.repeats && field.repeats[0] && field.repeats[0].components && field.repeats[0].components.length > 1);

                    var labelEl;
                    var subChildren = null;
                    if (hasSubItems) {
                        labelEl = $('<button type="button" class="debug-tree-toggle" aria-expanded="false"></button>');
                        labelEl.append($('<span class="debug-tree-chevron" aria-hidden="true">▸</span>'));
                    } else {
                        labelEl = $('<span class="debug-tree-leaf"></span>');
                    }
                    labelEl.append($('<span class="debug-tree-key"></span>').text(seg.name + '.' + field.index));
                    labelEl.append($('<span class="debug-tree-val"></span>').text(formatScalar(field.value)));

                    var badge = $('<span class="debug-pill"></span>')
                        .addClass(field.accessed ? 'is-read' : 'is-unused')
                        .text(field.accessed ? 'read' : 'unused');

                    var copyBtn = $('<button type="button" class="debug-mini-btn">Copy path</button>');
                    copyBtn.attr('title', fieldPath);
                    copyBtn.on('click', function (ev) {
                        ev.stopPropagation();
                        copyToClipboard(fieldPath, this);
                    });

                    fieldRow.append(labelEl, badge, copyBtn);
                    fieldRow.on('click', function (ev) {
                        if ($(ev.target).closest('.debug-mini-btn, .debug-tree-toggle').length) {
                            return;
                        }
                        jumpToMessageLine(seg.line);
                    });
                    fieldNode.append(fieldRow);

                    if (hasSubItems) {
                        subChildren = $('<div class="debug-tree-children" hidden></div>');
                        var subPopulated = false;
                        labelEl.on('click', function () {
                            var open = subChildren.prop('hidden');
                            if (open && !subPopulated) {
                                subPopulated = true;
                                (field.repeats || []).forEach(function (rep, repIdx) {
                                    var comps = rep.components || [];
                                    comps.forEach(function (comp) {
                                        var compPrefix = (field.repeats.length > 1)
                                            ? ((isFirstOfType ? 'firstSegments.' : '') + seg.name + '.' + field.index + '.Repeats[' + repIdx + '].' + comp.index + '.Value')
                                            : ((isFirstOfType ? 'firstSegments.' : '') + seg.name + '.' + field.index + '.' + comp.index + '.Value');
                                        var compCoord = seg.name + '.' + field.index
                                            + (field.repeats.length > 1 ? '[' + repIdx + ']' : '')
                                            + '.' + comp.index;
                                        var compRow = $('<div class="debug-tree-row"></div>');
                                        var compLeaf = $('<span class="debug-tree-leaf"></span>');
                                        compLeaf.append($('<span class="debug-tree-key"></span>').text(compCoord));
                                        compLeaf.append($('<span class="debug-tree-val"></span>').text(formatScalar(comp.value)));
                                        var compBadge = $('<span class="debug-pill"></span>')
                                            .addClass(comp.accessed ? 'is-read' : 'is-unused')
                                            .text(comp.accessed ? 'read' : 'unused');
                                        var compCopy = $('<button type="button" class="debug-mini-btn">Copy path</button>');
                                        compCopy.attr('title', compPrefix);
                                        compCopy.on('click', function (ev) {
                                            ev.stopPropagation();
                                            copyToClipboard(compPrefix, this);
                                        });
                                        compRow.append(compLeaf, compBadge, compCopy);
                                        subChildren.append(compRow);
                                    });
                                });
                            }
                            subChildren.prop('hidden', !open);
                            labelEl.attr('aria-expanded', String(open));
                            labelEl.find('.debug-tree-chevron').first().text(open ? '▾' : '▸');
                        });
                        fieldNode.append(subChildren);
                    }

                    children.append(fieldNode);
                });
            }

            toggle.on('click', function () {
                var open = children.prop('hidden');
                if (open) {
                    populateFields();
                }
                children.prop('hidden', !open);
                toggle.attr('aria-expanded', String(open));
                toggle.find('.debug-tree-chevron').first().text(open ? '▾' : '▸');
            });

            if (q) {
                populateFields();
                children.prop('hidden', false);
                toggle.attr('aria-expanded', 'true');
                toggle.find('.debug-tree-chevron').first().text('▾');
            }

            row.append(toggle, jumpBtn);
            node.append(row, children);
            container.append(node);
        });

        if (!matchedAny) {
            container.append($('<div class="debug-empty">No segments or fields match that filter.</div>'));
        }
    }

    // --- Tab 2: Variables & Console ---------------------------------------------------

    function buildObjectTreeNode(keyLabel, value, depth, filter) {
        var isExpandable = false;
        var childEntries = [];

        if (Array.isArray(value)) {
            isExpandable = value.length > 0 && depth < 5;
            value.forEach(function (item, idx) {
                childEntries.push({k: '[' + idx + ']', v: item});
            });
        } else if (value && typeof value === 'object') {
            if (value.__kind === 'hl7Segment' && value.fields) {
                var fKeys = Object.keys(value.fields);
                isExpandable = fKeys.length > 0 && depth < 5;
                fKeys.forEach(function (fk) {
                    childEntries.push({k: '.' + fk, v: value.fields[fk]});
                });
            } else if (value.__kind === 'hl7Field' && value.components) {
                var cKeys = Object.keys(value.components);
                isExpandable = cKeys.length > 0 && depth < 5;
                cKeys.forEach(function (ck) {
                    childEntries.push({k: '.' + ck, v: value.components[ck]});
                });
            } else {
                var keys = Object.keys(value).filter(function (k) {
                    return k !== '__kind';
                });
                isExpandable = keys.length > 0 && depth < 5;
                keys.forEach(function (k) {
                    childEntries.push({k: k, v: value[k]});
                });
            }
        }

        var node = $('<div class="debug-tree-node"></div>');
        var row = $('<div class="debug-tree-row"></div>');

        if (!isExpandable) {
            var leaf = $('<span class="debug-tree-leaf"></span>');
            leaf.append($('<span class="debug-tree-key"></span>').text(keyLabel));
            leaf.append($('<span class="debug-tree-val"></span>').text(formatScalar(value)));
            row.append(leaf);
            node.append(row);
            return node;
        }

        var toggle = $('<button type="button" class="debug-tree-toggle" aria-expanded="false"></button>');
        toggle.append($('<span class="debug-tree-chevron" aria-hidden="true">▸</span>'));
        toggle.append($('<span class="debug-tree-key"></span>').text(keyLabel));
        toggle.append($('<span class="debug-tree-preview"></span>').text(formatScalar(value)));
        var children = $('<div class="debug-tree-children" hidden></div>');
        var built = false;

        function ensureBuilt() {
            if (built) {
                return;
            }
            built = true;
            childEntries.forEach(function (entry) {
                children.append(buildObjectTreeNode(entry.k, entry.v, depth + 1, ''));
            });
        }

        toggle.on('click', function () {
            var open = children.prop('hidden');
            if (open) {
                ensureBuilt();
            }
            children.prop('hidden', !open);
            toggle.attr('aria-expanded', String(open));
            toggle.find('.debug-tree-chevron').first().text(open ? '▾' : '▸');
        });

        if (filter && depth === 0) {
            ensureBuilt();
            children.prop('hidden', false);
            toggle.attr('aria-expanded', 'true');
            toggle.find('.debug-tree-chevron').first().text('▾');
        }

        row.append(toggle);
        node.append(row, children);
        return node;
    }

    function renderVarsPanel(info, filter) {
        var tree = $('#debug-vars-tree').empty();
        var scopes = info && info.scopes;
        if (!scopes || Object.keys(scopes).length === 0) {
            tree.append($('<div class="debug-empty">No Liquid variable scopes captured yet.</div>'));
            updateConsolePreview();
            return;
        }

        var q = (filter || '').trim().toLowerCase();
        var rootName = 'Root';
        if (typeof openTemplates !== 'undefined' && Array.isArray(openTemplates)) {
            var top = openTemplates.find(function (t) {
                return t.parent === null;
            });
            if (top && top.name) {
                rootName = 'Root (' + top.name + ')';
            }
        }

        if (scopes.__root__) {
            var filteredRoot = {};
            var rootKeys = Object.keys(scopes.__root__);
            rootKeys.forEach(function (k) {
                if (!q || k.toLowerCase().indexOf(q) !== -1 || JSON.stringify(scopes.__root__[k]).toLowerCase().indexOf(q) !== -1) {
                    filteredRoot[k] = scopes.__root__[k];
                }
            });
            if (!q || Object.keys(filteredRoot).length > 0) {
                var rootNode = buildObjectTreeNode(rootName, filteredRoot, 0, q || 'open');
                tree.append(rootNode);
            }
        }

        var partialNames = Object.keys(scopes).filter(function (name) {
            return name !== '__root__';
        });
        if (partialNames.length > 0) {
            var partialsGroup = {};
            partialNames.forEach(function (pName) {
                var entry = scopes[pName];
                if (!entry) {
                    return;
                }
                var label = pName + ' (×' + (entry.callCount || 1) + ')';
                if (!q || pName.toLowerCase().indexOf(q) !== -1 || JSON.stringify(entry.lastScope || {}).toLowerCase().indexOf(q) !== -1) {
                    partialsGroup[label] = entry.lastScope || {};
                }
            });
            if (Object.keys(partialsGroup).length > 0) {
                tree.append(buildObjectTreeNode('Included Partials (' + Object.keys(partialsGroup).length + ')', partialsGroup, 0, q));
            }
        }

        updateConsolePreview();
    }

    function evaluateExpressionText(expr) {
        var trimmed = (expr || '').trim();
        if (!trimmed) {
            return null;
        }
        if (typeof window.resolveDebugExpression === 'function') {
            var res = window.resolveDebugExpression(trimmed);
            if (res) {
                return {
                    found: true,
                    scope: res.scopeLabel || 'scope',
                    text: formatScalar(res.value)
                };
            }
        }
        return {
            found: false,
            scope: 'unresolved',
            text: 'null (empty / unset)'
        };
    }

    function updateConsolePreview() {
        var expr = $('#debug-console-input').val() || '';
        var outEl = $('#debug-console-output');
        var evaluated = evaluateExpressionText(expr);
        if (!evaluated) {
            outEl.text('');
            return;
        }
        outEl.text('→ ' + evaluated.text + ' [' + evaluated.scope + ']');
    }

    // --- Tab 3: Diagnostics & Bundle --------------------------------------------------

    function renderDiagPanel(info, filter) {
        var container = $('#debug-panel-diag').empty();
        if (!info) {
            container.append($('<div class="debug-empty">No conversion diagnostics yet.</div>'));
            return;
        }

        var q = (filter || '').trim().toLowerCase();
        var bundle = info.fhirResource;
        var entries = (bundle && bundle.resourceType === 'Bundle' && Array.isArray(bundle.entry))
            ? bundle.entry
            : [];

        var bundleSection = $('<div class="debug-diag-section"></div>');
        bundleSection.append($('<div class="debug-diag-heading"></div>').text('Bundle Resources (' + entries.length + ')'));

        if (entries.length === 0 && bundle && bundle.resourceType) {
            var singleBtn = $('<button type="button" class="debug-diag-item"></button>')
                .text(bundle.resourceType + (bundle.id ? ' / ' + bundle.id : ''));
            singleBtn.on('click', function () {
                jumpToOutputResource(bundle.resourceType, bundle.id || '', 0);
            });
            bundleSection.append(singleBtn);
        } else {
            entries.forEach(function (entry, idx) {
                var res = (entry && entry.resource) || {};
                var rType = res.resourceType || 'Resource';
                var rId = res.id || '';
                var label = (idx + 1) + '. ' + rType + (rId ? ' / ' + rId : '');
                if (q && label.toLowerCase().indexOf(q) === -1) {
                    return;
                }
                var item = $('<button type="button" class="debug-diag-item"></button>');
                item.append($('<span class="debug-tree-key"></span>').text(rType));
                if (rId) {
                    item.append($('<span class="debug-tree-preview"></span>').text(rId));
                }
                item.on('click', function () {
                    jumpToOutputResource(rType, rId, idx);
                });
                bundleSection.append(item);
            });
        }
        container.append(bundleSection);

        var unused = Array.isArray(info.unusedSegments) ? info.unusedSegments : [];
        var flatUnused = [];
        unused.forEach(function (seg) {
            (seg.field || []).forEach(function (field) {
                (field.component || []).forEach(function (comp) {
                    if (field.index === 0) {
                        return;
                    }
                    var coord = seg.type + '-' + field.index + '.' + comp.index;
                    var text = coord + ' = ' + JSON.stringify(comp.value || '');
                    if (q && text.toLowerCase().indexOf(q) === -1) {
                        return;
                    }
                    flatUnused.push({
                        line: seg.line,
                        coord: coord,
                        value: comp.value || ''
                    });
                });
            });
        });

        var unusedSection = $('<div class="debug-diag-section"></div>');
        unusedSection.append($('<div class="debug-diag-heading"></div>').text('Unused HL7 Fields (' + flatUnused.length + ')'));
        if (flatUnused.length === 0) {
            unusedSection.append($('<div class="debug-empty">No unused HL7 fields reported.</div>'));
        } else {
            flatUnused.forEach(function (u) {
                var btn = $('<button type="button" class="debug-diag-item"></button>');
                btn.append($('<span class="debug-pill is-unused">unused</span>'));
                btn.append($('<span class="debug-tree-key"></span>').text(u.coord));
                btn.append($('<span class="debug-tree-val"></span>').text(JSON.stringify(u.value)));
                btn.on('click', function () {
                    jumpToMessageLine(u.line);
                });
                unusedSection.append(btn);
            });
        }
        container.append(unusedSection);
    }

    // --- Orchestration & State --------------------------------------------------------

    function renderActivePanel() {
        var info = window.latestDebugInfo || null;
        var timingText = (info && typeof info.durationMs === 'number')
            ? ('Converted in ' + info.durationMs + ' ms')
            : '';
        $('#debug-timing').text(timingText);

        if (!isOpen) {
            return;
        }
        var filter = $('#debug-tree-filter').val() || '';
        if (activeTab === 'hl7') {
            renderHl7Panel(info, filter);
        } else if (activeTab === 'vars') {
            renderVarsPanel(info, filter);
        } else if (activeTab === 'diag') {
            renderDiagPanel(info, filter);
        }
    }

    function setDebugTab(tabId) {
        activeTab = tabId;
        $('.debug-drawer-tabs button[role="tab"]').each(function () {
            var match = $(this).attr('data-debug-tab') === tabId;
            $(this).toggleClass('is-active', match).attr('aria-selected', String(match));
        });
        $('#debug-panel-hl7').prop('hidden', tabId !== 'hl7');
        $('#debug-panel-vars').prop('hidden', tabId !== 'vars');
        $('#debug-panel-diag').prop('hidden', tabId !== 'diag');
        renderActivePanel();
    }

    function applyDrawerHeight() {
        drawerHeight = clampDrawerHeight(drawerHeight);
        $('#debug-drawer').css({
            height: drawerHeight + 'px',
            'flex-basis': drawerHeight + 'px'
        });
    }

    function setDebugDrawerOpen(nextOpen, options) {
        isOpen = Boolean(nextOpen);
        $('#debug-drawer').prop('hidden', !isOpen);
        $('#debug-drawer-resizer').prop('hidden', !isOpen);
        $('#debug-toggle-button')
            .toggleClass('is-active', isOpen)
            .attr('aria-expanded', String(isOpen));
        if (isOpen) {
            applyDrawerHeight();
            renderActivePanel();
        }
        if (!options || options.persist !== false) {
            writeStorage(STORAGE_OPEN_KEY, isOpen ? 'true' : 'false');
        }
        if (typeof refreshEditors === 'function') {
            refreshEditors();
        }
    }

    window.setDebugDrawerOpen = setDebugDrawerOpen;

    $(document).ready(function () {
        var savedH = parseFloat(readStorage(STORAGE_HEIGHT_KEY));
        if (isFinite(savedH)) {
            drawerHeight = clampDrawerHeight(savedH);
        }
        var savedOpen = readStorage(STORAGE_OPEN_KEY) === 'true';
        setDebugDrawerOpen(savedOpen, {persist: false});

        $('#debug-toggle-button').on('click', function () {
            setDebugDrawerOpen(!isOpen);
        });

        $('#debug-drawer-close').on('click', function () {
            setDebugDrawerOpen(false);
            $('#debug-toggle-button').focus();
        });

        $('.debug-drawer-tabs').on('click', 'button[role="tab"]', function () {
            setDebugTab($(this).attr('data-debug-tab'));
        });

        $('#debug-tree-filter').on('input', function () {
            renderActivePanel();
        });

        $('#debug-console-input').on('input', function () {
            updateConsolePreview();
        });

        $('#debug-console-input').on('keydown', function (event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                var expr = ($(this).val() || '').trim();
                if (!expr) {
                    return;
                }
                var evaluated = evaluateExpressionText(expr);
                consoleHistory.push(expr);
                historyCursor = consoleHistory.length;
                var historyBox = $('#debug-console-history');
                historyBox.removeAttr('hidden');
                var row = $('<div class="debug-console-entry"></div>');
                row.append($('<span class="debug-console-expr"></span>').text('> ' + expr));
                row.append($('<span class="debug-console-res"></span>').text(evaluated ? (evaluated.text + ' [' + evaluated.scope + ']') : 'null'));
                historyBox.append(row);
                historyBox[0].scrollTop = historyBox[0].scrollHeight;
                $(this).val('');
                updateConsolePreview();
            } else if (event.key === 'ArrowUp') {
                if (consoleHistory.length > 0 && historyCursor > 0) {
                    event.preventDefault();
                    historyCursor -= 1;
                    $(this).val(consoleHistory[historyCursor]);
                    updateConsolePreview();
                }
            } else if (event.key === 'ArrowDown') {
                if (consoleHistory.length > 0 && historyCursor < consoleHistory.length) {
                    event.preventDefault();
                    historyCursor += 1;
                    $(this).val(historyCursor < consoleHistory.length ? consoleHistory[historyCursor] : '');
                    updateConsolePreview();
                }
            }
        });

        var resizer = $('#debug-drawer-resizer');
        resizer.on('mousedown', function (event) {
            if (event.button !== 0) {
                return;
            }
            event.preventDefault();
            resizer.addClass('is-dragging');
            var startY = event.clientY;
            var startH = drawerHeight;
            function onMove(moveEv) {
                var delta = startY - moveEv.clientY;
                drawerHeight = clampDrawerHeight(startH + delta);
                applyDrawerHeight();
                if (typeof refreshEditors === 'function') {
                    refreshEditors();
                }
            }
            function onUp() {
                $(document).off('mousemove', onMove).off('mouseup', onUp);
                resizer.removeClass('is-dragging');
                writeStorage(STORAGE_HEIGHT_KEY, String(drawerHeight));
                if (typeof refreshEditors === 'function') {
                    refreshEditors();
                }
            }
            $(document).on('mousemove', onMove).on('mouseup', onUp);
        });

        $(document).on('keydown', function (event) {
            if (event.ctrlKey && !event.altKey && !event.metaKey && event.key === '`') {
                if ($('.modal.show').length) {
                    return;
                }
                event.preventDefault();
                setDebugDrawerOpen(!isOpen);
            }
        });

        $(window).on('resize', function () {
            if (isOpen) {
                applyDrawerHeight();
            }
        });

        $(document).on('fhir:debug-updated', function () {
            renderActivePanel();
        });
    });
})();
