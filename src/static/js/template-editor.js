// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------
/* eslint-disable no-undef, no-unused-vars */
var version = '1.0';

var dataEditor;
var templateCodeEditor;
var outputCode;
var lineMapping = []; // Mapping source (template) to destination (output) lines
var defaultTemplate = {name: 'untitled', parent: null, data: '', active: true, marks: []};
var activeTemplate = defaultTemplate;
var openTemplates = [activeTemplate];
var currentTemplateReference = {[activeTemplate.name]: activeTemplate.data}; // This is what we set the template to initially
var latestRequest = 0;
var latestDebugInfo = null;
var nextRequestCall;
var waitForTypingTimeout = 100;
var bannerFade;
var transitionTime = 1000;
// eslint-disable-next-line no-unused-vars
var templateNames;

var defaultAiPrompt = [
    'Return the Liquid template only. No markdown fence and no explanation.',
    'Write one FHIR R4 Bundle with "type": "batch".',
    'The message is hl7v2Data.',
    "First copy of a segment: {% assign firstSegments = hl7v2Data | get_first_segments: 'MSH|PID|PV1' -%}",
    "Repeating segments: {% assign obxLists = hl7v2Data | get_segment_lists: 'OBX' -%}",
    'A field is firstSegments.PID.5.Value. A component is firstSegments.PID.5.1.Value. Repeats are firstSegments.PID.3.Repeats.',
    'Turn an HL7 date into a FHIR date with format_as_date_time.',
    "Mint an id with a single-quoted partial: {% evaluate patientId using 'ID/Patient' PID: firstSegments.PID, type: 'First' -%}",
    "Call a partial the same way: {% include 'Resource/Patient' PID: firstSegments.PID, ID: patientId -%}",
    'Trim tags with {%- and -%}. Leave out a JSON property when its HL7 field is empty.'
].join('\n');

var ccdaAiPrompt = [
    'Return the Liquid template only. No markdown fence and no explanation.',
    'Write one FHIR R4 Bundle with "type": "batch".',
    'The message is msg, the parsed C-CDA document.',
    'An attribute is msg.ClinicalDocument.id.root. Text is msg.ClinicalDocument.title._.',
    'A tag prefix becomes an underscore, so sdtc:raceCode is msg.ClinicalDocument.recordTarget.patientRole.patient.sdtc_raceCode.',
    'A repeated element is an array, so loop over it with {% for given in msg.ClinicalDocument.recordTarget.patientRole.patient.name.given -%}.',
    'Trim tags with {%- and -%}. Leave out a JSON property when its value is empty.'
].join('\n');

// A saved prompt that differs from the HL7 default is the user's own and is used as is.
function effectiveAiPrompt(savedPrompt) {
    if (savedPrompt && savedPrompt !== defaultAiPrompt && savedPrompt !== ccdaAiPrompt) {
        return savedPrompt;
    }
    return (typeof getActiveProjectFamily === 'function' && getActiveProjectFamily() === 'ccda') ? ccdaAiPrompt : defaultAiPrompt;
}

var currentEditorSettings = {
    darkMode: false,
    convertWhileTyping: true,
    timezone: '',
    fhirBaseUrl: '',
    fhirAuth: 'none',
    fhirToken: '',
    fhirUsername: '',
    fhirPassword: '',
    fhirConditional: false,
    aiProvider: 'openai',
    aiBaseUrl: '',
    aiModel: 'gpt-4.1-mini',
    aiApiKey: '',
    aiPrompt: '',
    palette: 'paper',
    aiApiKeys: {},
    aiModels: {},
    aiBaseUrls: {}
};
try {
    currentEditorSettings = Object.assign(currentEditorSettings, JSON.parse(localStorage.getItem('fhirConverterSettings') || '{}'));
    if (!currentEditorSettings.aiApiKeys || typeof currentEditorSettings.aiApiKeys !== 'object') {
        currentEditorSettings.aiApiKeys = {};
    }
    if (!currentEditorSettings.aiModels || typeof currentEditorSettings.aiModels !== 'object') {
        currentEditorSettings.aiModels = {};
    }
    if (!currentEditorSettings.aiBaseUrls || typeof currentEditorSettings.aiBaseUrls !== 'object') {
        currentEditorSettings.aiBaseUrls = {};
    }
    if (currentEditorSettings.aiApiKey && currentEditorSettings.aiProvider && !currentEditorSettings.aiApiKeys[currentEditorSettings.aiProvider]) {
        currentEditorSettings.aiApiKeys[currentEditorSettings.aiProvider] = currentEditorSettings.aiApiKey;
    }
} catch (ex) {
    // Keep the defaults when stored settings are not JSON.
}
var hasSuccessfulCallBeenMade = false;

var currentDataType;
var templateOutputSplit;
var dataTemplateSplit;

function getSettings() {
    return currentEditorSettings;
}

function setSettings(settings) {
    currentEditorSettings = settings;
    try {
        localStorage.setItem('fhirConverterSettings', JSON.stringify(settings));
    } catch (ex) {
        return;
    } finally {
        updateValidateButton();
    }
}

var themePreference = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function resolveStoredTheme() {
    try {
        var raw = localStorage.getItem('fhirConverterSettings');
        var stored = raw ? JSON.parse(raw) : null;
        if (stored && typeof stored === 'object') {
            if (stored.theme === 'light' || stored.theme === 'dark' || stored.theme === 'system') {
                return stored.theme;
            }
            return stored.darkMode === true ? 'dark' : 'light';
        }
    } catch (ex) {
        return 'system';
    }
    return 'system';
}

function resolveStoredPalette() {
    var settings = getSettings();
    if (settings.palette === 'paper' || settings.palette === 'slate' || settings.palette === 'grove') {
        return settings.palette;
    }
    return 'paper';
}

function applyTheme(choice) {
    if (choice === 'system') {
        choice = themePreference && themePreference.matches ? 'dark' : 'light';
    }
    document.documentElement.dataset.theme = choice;
}

function applyPalette(name) {
    document.documentElement.dataset.palette = name === 'slate' || name === 'grove' ? name : 'paper';
}

var currentThemeChoice = resolveStoredTheme();
if (themePreference) {
    themePreference.addEventListener('change', function () {
        if (currentThemeChoice === 'system') {
            applyTheme('system');
        }
    });
}

function showSettingsTab(name) {
    $('#settings-modal [role="tab"]').each(function () {
        var on = $(this).attr('data-settings-tab') === name;
        $(this).toggleClass('is-active', on).attr('aria-selected', on ? 'true' : 'false');
    });
    $('#settings-modal [role="tabpanel"]').each(function () {
        $(this).prop('hidden', $(this).attr('data-settings-tab') !== name);
    });
}

function showFhirAuthFields() {
    var auth = $('#settings-fhir-auth').val();
    $('#settings-fhir-token-row').toggle(auth === 'bearer');
    $('#settings-fhir-user-row').toggle(auth === 'basic');
    $('#settings-fhir-password-row').toggle(auth === 'basic');
}

function getUrl(endpoint, fileName) {
    return '/api/v1/' + endpoint + (fileName ? '/' + fileName : '');
}

function getDataTypeSpecificUrl(endpoint, fileName) {
    const baseUrl = `/api/v1/${endpoint}/${currentDataType}${fileName ? '/' + fileName : ''}`;
    return `${baseUrl}?unusedSegments=true&invalidAccess=true&debug=true`;
}

function clearLatestDebugInfo() {
    window.latestDebugInfo = null;
    $(document).trigger('fhir:debug-updated', [window.latestDebugInfo]);
}

function showConversionError(message) {
    $('#conversion-error').text(message).removeAttr('hidden');
}

function hideConversionError() {
    $('#conversion-error').text('').attr('hidden', true);
}

function formatActiveTemplate() {
    var text = templateCodeEditor.getValue();
    var formatted;
    if (/\.json$/i.test(activeTemplate.name)) {
        try {
            formatted = JSON.stringify(JSON.parse(text), null, 4);
        } catch (error) {
            showConversionError('Cannot format invalid JSON.');
            return;
        }
    } else {
        formatted = beautifyLiquidTemplate(text);
    }
    if (formatted === text) {
        return;
    }
    var cursor = templateCodeEditor.getCursor();
    var scrollInfo = templateCodeEditor.getScrollInfo();
    var doc = templateCodeEditor.getDoc();
    doc.replaceRange(formatted, {line: 0, ch: 0}, {line: doc.lastLine(), ch: doc.getLine(doc.lastLine()).length});
    var lastLine = doc.lastLine();
    var maxCh = doc.getLine(lastLine).length;
    templateCodeEditor.setCursor({line: Math.min(cursor.line, lastLine), ch: Math.min(cursor.ch, maxCh)});
    templateCodeEditor.scrollTo(scrollInfo.left, scrollInfo.top);
    templateCodeEditor.focus();
}

function setUnusedLegend(visible) {
    if (visible) {
        $('#unused-legend').removeAttr('hidden');
    } else {
        $('#unused-legend').attr('hidden', true);
    }
}

function showResultError(message) {
    $('#result-error').text(message).removeAttr('hidden');
}

function hideResultError() {
    $('#result-error').text('').attr('hidden', true);
}

function conversionStatusLabel(resource) {
    if (resource && typeof resource === 'object' && resource.resourceType === 'Bundle' && Array.isArray(resource.entry)) {
        if (resource.entry.length === 1) {
            return 'Converted · Bundle · 1 resource';
        }
        return 'Converted · Bundle · ' + resource.entry.length + ' resources';
    }
    if (resource && typeof resource === 'object' && typeof resource.resourceType === 'string' && resource.resourceType.length > 0) {
        return 'Converted · ' + resource.resourceType;
    }
    return 'Converted';
}

function updateUnsavedDot() {
    openTemplates.forEach(function (template) {
        var tab = getTab(template.name);
        if (!tab) {
            return;
        }
        if (unchangedFromReference(template.name, template.data)) {
            tab.find('.tab-dirty').attr('hidden', true);
        } else {
            tab.find('.tab-dirty').removeAttr('hidden');
        }
    });
    if (activeTemplate && !unchangedFromReference(activeTemplate.name, activeTemplate.data)) {
        $('#template-save-button').addClass('is-dirty');
    } else {
        $('#template-save-button').removeClass('is-dirty');
    }
}

function convertData(force) {
    if (!force && currentEditorSettings.convertWhileTyping === false) {
        return;
    }

    if (nextRequestCall) {
        clearTimeout(nextRequestCall);
    }

    nextRequestCall = setTimeout(() => {
        var reqBody = {};
        var templateLines = [];
        var outputLines = [];

        if (dataEditor.getValue() && dataEditor.getValue() !== "") {
            reqBody.srcData = dataEditor.getValue();
        } else {
            clearLatestDebugInfo();
            return;
        }

        var activeProj = (typeof getActiveProject === 'function') ? getActiveProject() : null;
        hideResultError();
        setUnusedLegend(false);
        $('#conversion-status').text('Converting…');

        var topTemplate = openTemplates.find(template => template.parent === null);
        if (topTemplate) {
            templateLines = topTemplate.data.replace(/(?:\r\n|\r|\n)/g, '\n').split('\n');

            var partialTemplates = openTemplates.filter(template => template.parent !== null);

            var partialTemplatesMap = {};
            partialTemplates.forEach(template => partialTemplatesMap[template.name] = template.data);

            reqBody.template = templateLines.join('\n');
            reqBody.templatesOverride = partialTemplatesMap;
        }

        latestRequest++;
        const requestNumber = latestRequest;
        var headers = {};
        if (currentEditorSettings.timezone) {
            headers.timezone = currentEditorSettings.timezone;
        }
        var convertEndpointUrl = getDataTypeSpecificUrl('convert');
        if (activeProj) {
            convertEndpointUrl = '/api/v1/projects/convert?unusedSegments=true&invalidAccess=true&debug=true';
            reqBody.project = activeProj;
        }
        $.ajax(convertEndpointUrl, {
            'data': JSON.stringify(reqBody),
            'type': 'POST',
            'processData': false,
            'contentType': 'application/json',
            'headers': headers,
            'success': function (data) {
                if (latestRequest === requestNumber) {
                    hasSuccessfulCallBeenMade = true;
                    window.latestDebugInfo = (data && data.debugInfo) ? data.debugInfo : null;
                    if (window.latestDebugInfo) {
                        window.latestDebugInfo.unusedSegments = data.unusedSegments || [];
                        window.latestDebugInfo.fhirResource = data.fhirResource || null;
                    }
                    // Formatting output and splitting on line breaks (taking platform variations into consideration)
                    outputLines = JSON.stringify(data.fhirResource, null, 2).replace(/(?:\r\n|\r|\n)/g, '\n').split('\n');

                    outputCode.setValue(outputLines.join('\n'));
                    $(document).trigger('fhir:debug-updated', [window.latestDebugInfo]);
                    hideResultError();
                    $('#conversion-status').text(conversionStatusLabel(data.fhirResource));
                    hideConversionError();
                    setUnusedLegend(false);
                    refreshEditors();

                    // Makes the unused line marking asyc to help performance.
                    if (currentDataType === 'hl7v2')
                        setTimeout(() => {
                            if (latestRequest === requestNumber) {
                                // Highlights unused sections of the Hl7 data
                                var unusedReport = data.unusedSegments;
                                var dataDoc = dataEditor.getDoc();

                                var fieldSeparator = dataDoc.getLine(0)[3];
                                var componentSeparator = dataDoc.getLine(0)[4];

                                // Removes all the old highlighting
                                dataDoc.getAllMarks().forEach((mark) => mark.clear());

                                if (unusedReport) {
                                    unusedReport.forEach((line) => {
                                        // MSH (always line 0) is field-numbered specially: MSH-1 (the field
                                        // separator character) occupies no pipe-delimited token of its own, so
                                        // every conventional field number after it is shifted back by one
                                        // relative to its raw pipe-split token position. Non-MSH segments have
                                        // no such shift -- field N is directly the Nth pipe-delimited token.
                                        var isHeaderSegment = line.line === 0;
                                        var fieldIndexOffset = isHeaderSegment ? 1 : 0;
                                        line.field.forEach((field) => {
                                            if (field && field.index !== 0 && field.component.length > 0) {
                                                field.component.forEach((component) => {
                                                    var lineText = dataDoc.getLine(line.line);
                                                    var startFieldIndex = indexOfX(lineText, fieldSeparator, field.index - 1 - fieldIndexOffset) + 1;
                                                    var endFieldIndex = indexOfX(lineText, fieldSeparator, field.index - fieldIndexOffset);
                                                    if (endFieldIndex === -1) {
                                                        endFieldIndex = lineText.length;
                                                    }

                                                    // Components are 1-indexed with index 0 reserved as null
                                                    // padding (matching upstream), so the real component at
                                                    // report index N is the (N-1)th token in a 0-indexed split --
                                                    // and locating the start of that token needs the (N-2)th
                                                    // separator occurrence (indexOfX returns -1 for N<2, which
                                                    // correctly resolves to "no separator before it" for N=1).
                                                    var startComponentIndex = indexOfX(lineText.substring(startFieldIndex, endFieldIndex), componentSeparator, component.index - 2) + startFieldIndex + 1;
                                                    var endComponentIndex = startComponentIndex + component.value.length;
                                                    dataDoc.markText({
                                                        line: line.line,
                                                        ch: startComponentIndex
                                                    }, {
                                                        line: line.line,
                                                        ch: endComponentIndex
                                                    }, {className: 'unused-segment'});
                                                });
                                            }
                                        });
                                    });
                                }

                                var unusedMarkCount = dataDoc.getAllMarks().filter((mark) => mark.className === 'unused-segment').length;
                                if (unusedMarkCount > 0) {
                                    setUnusedLegend(true);
                                } else {
                                    setUnusedLegend(false);
                                }
                            }
                        }, 0);
                }

            },
            'error': function (err) {
                if (latestRequest !== requestNumber) {
                    return;
                }
                clearLatestDebugInfo();
                var message = 'Conversion failed.';
                try {
                    var errObj = JSON.parse(err.responseText);
                    if (errObj.error && errObj.error.message) {
                        message = errObj.error.message;
                    }
                } catch (ex) {
                    message = 'Conversion failed.';
                }
                outputCode.setValue('');
                $('#conversion-status').text('Failed');
                showResultError(message);
                if (typeof refreshEditors === 'function') {
                    refreshEditors();
                }
                if (typeof setUnusedLegend === 'function') {
                    setUnusedLegend(false);
                }
            }
        });
    }, waitForTypingTimeout);
}

function indexOfX(source, target, number, offset = 0) {
    if (offset === -1 || number < 0) {
        return -1;
    } else if (number === 0) {
        return source.indexOf(target, offset);
    }

    return indexOfX(source, target, number - 1, source.indexOf(target, offset) + 1);
}

function displayBanner(message, cssClass) {
    var delay = 0;
    var banner = $('#banner');

    if (bannerFade) {
        clearTimeout(bannerFade);
        banner.slideUp(transitionTime);
        delay = transitionTime;
    }

    bannerFade = setTimeout(() => {
        $('#banner-message')[0].innerText = message;
        banner.removeClass();
        banner.addClass('alert ' + cssClass);
        banner.slideDown(transitionTime);

        bannerFade = setTimeout(() => {
            banner.slideUp(transitionTime);
            bannerFade = null;
        }, 5000);
    }, delay);
}

function underlinePartialTemplateNames(document, change) {
    var startLine = change ? change.from.line : document.firstLine();
    var endLine = (change ? change.to.line : document.lastLine()) + 1;

    // remove marks before adding new one, only check changed lines if passed
    activeTemplate.marks = activeTemplate.marks.filter(mark => {
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

    document.eachLine(startLine, endLine, (line) => {
        findPartialNamesOnLine(line.text).forEach(function (nameLocation) {
            activeTemplate.marks.push(
                document.markText(
                    {
                        line: line.lineNo(),
                        ch: nameLocation.start
                    },
                    {
                        line: line.lineNo(),
                        ch: nameLocation.end
                    },
                    {
                        className: nameLocation.exists ? "include-link" : "include-missing"
                    }));
        });
    });
}

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
    if (!Array.isArray(templateNames)) {
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

function renderIncludedPanel() {
    var text = activeTemplate ? activeTemplate.data : '';
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

function unchangedFromReference(templateName, templateData) {
    var newLineRegex = /(?:\r\n|\r|\n)/g;
    var reference = currentTemplateReference[templateName];
    if (reference == null || templateData == null) {
        return false;
    }

    return templateData.replace(newLineRegex, '\n') === reference.replace(newLineRegex, '\n');
}

function changeDataType(dataType) {
    if (closeAllTemplates(true)) {

        dataEditor.setValue("");
        outputCode.setValue("");

        currentDataType = dataType.toLowerCase();

        if (templateOutputSplit) {
            templateOutputSplit.destroy();
        }
        if (dataTemplateSplit) {
            dataTemplateSplit.destroy();
        }

        switch (dataType) {
            case 'HL7V2':
                $('#editor-main, #editor-panes').addClass('vertical-content');

                // Create splits for editor areas
                templateOutputSplit = Split(['.template-area', '.output-area'], {
                    gutterSize: 5,
                    sizes: [50, 50],
                    onDrag: refreshEditors,
                    onDragEnd: refreshEditors
                });

                dataTemplateSplit = Split(['.msg-area', '.editor-area'], {
                    gutterSize: 5,
                    sizes: [30, 70],
                    direction: 'vertical',
                    onDrag: refreshEditors,
                    onDragEnd: refreshEditors
                });

                dataEditor.setOption("mode", "hl7v2");
                break;
            case 'CDA':
                $('#editor-main, #editor-panes').removeClass('vertical-content');

                // Create splits for editor areas
                templateOutputSplit = Split(['.template-area', '.output-area'], {
                    gutterSize: 5,
                    sizes: [50, 50],
                    onDrag: refreshEditors,
                    onDragEnd: refreshEditors
                });

                dataTemplateSplit = Split(['.msg-area', '.editor-area'], {
                    gutterSize: 5,
                    sizes: [30, 70],
                    onDrag: refreshEditors,
                    onDragEnd: refreshEditors
                });

                dataEditor.setOption("mode", "xml");
                break;
        }
    }
}

function refreshEditors() {
    if (dataEditor) {
        dataEditor.refresh();
    }
    if (templateCodeEditor) {
        templateCodeEditor.refresh();
    }
    if (outputCode) {
        outputCode.refresh();
    }
}

$(document).ready(function () {
    applyTheme(currentThemeChoice);
    applyPalette(resolveStoredPalette());

    dataEditor = CodeMirror.fromTextArea(document.getElementById("databox"), {
        //readOnly: false,
        lineNumbers: true,
        lineWrapping: true,
        theme: "fhir",
        mode: "hl7v2",
        extraKeys: {
            "Ctrl-Q": function (cm) {
                cm.foldCode(cm.getCursor());
            }
        },
        foldGutter: true,
        gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"]
    });

    dataEditor.on("change", function () {
        convertData();
    });

    outputCode = CodeMirror.fromTextArea(document.getElementById("resultbox"), {
        readOnly: true,
        lineNumbers: true,
        lineWrapping: true,
        theme: "fhir",
        mode: {name: "javascript", json: true},
        extraKeys: {
            "Ctrl-Q": function (cm) {
                cm.foldCode(cm.getCursor());
            }
        },
        foldGutter: true,
        gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"]
    });
    outputCode.on('change', updateValidateButton);

    let extrakeysObj = {};
    extrakeysObj["Shift-Alt-F"] = formatActiveTemplate;
    extrakeysObj["Tab"] = function (cm) {
        var spaces = Array(5).join(" ");
        cm.replaceSelection(spaces);
    };
    extrakeysObj["Ctrl-Q"] = function (cm) {
        cm.foldCode(cm.getCursor());
    };

    templateCodeEditor = CodeMirror.fromTextArea(document.getElementById("templatebox"), {
        theme: "fhir",
        lineNumbers: true,
        /*global hintExtraKeysObj*/
        extraKeys: Object.assign(extrakeysObj, hintExtraKeysObj),
        mode: "liquid-json",
        smartIndent: false,
        matchBrackets: true,
        foldGutter: true,
        gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
        foldOptions: {
            rangeFinder: CodeMirror.fold.combine(CodeMirror.fold.liquid, CodeMirror.fold.brace)
        }
    });

    templateCodeEditor.on("change", function (instance, changeObj) {
        if (activeTemplate) {
            activeTemplate.data = templateCodeEditor.getValue();
            underlinePartialTemplateNames(templateCodeEditor.getDoc(), changeObj);

            var tab = getTab(activeTemplate.name);
            if (tab) {
                if (unchangedFromReference(activeTemplate.name, activeTemplate.data)) {
                    tab.removeClass("font-italic");
                } else {
                    tab.addClass("font-italic");
                }
            }
            updateUnsavedDot();
            renderIncludedPanel();
        }
        convertData();
    });

    /*global loadLibraryFilters*/
    loadLibraryFilters();

    $(document).on('keydown', function (event) {
        if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && (event.key === 's' || event.key === 'S')) {
            event.preventDefault();
            if (activeTemplate && !unchangedFromReference(activeTemplate.name, templateCodeEditor.getValue())) {
                saveTemplate();
            }
        }
    });

    function openIncludeAtCursor() {
        var doc = templateCodeEditor.getDoc();
        var cursorPos = doc.getCursor();
        var lineText = doc.getLine(cursorPos.line);
        var matches = findPartialNamesOnLine(lineText);
        var nameLocation = matches.find(function (match) {
            return cursorPos.ch >= match.start && cursorPos.ch <= match.end;
        });

        if (nameLocation) {
            openOrCreateInclude(nameLocation.quoted);
        }
    }

    templateCodeEditor.on('dblclick', openIncludeAtCursor);

    templateCodeEditor.on('mousedown', function (instance, event) {
        if (!(event.metaKey || event.ctrlKey)) {
            return;
        }
        var pos = templateCodeEditor.coordsChar({left: event.clientX, top: event.clientY});
        var lineText = templateCodeEditor.getDoc().getLine(pos.line);
        var matches = findPartialNamesOnLine(lineText);
        var nameLocation = matches.find(function (match) {
            return pos.ch >= match.start && pos.ch <= match.end;
        });

        if (nameLocation) {
            openOrCreateInclude(nameLocation.quoted);
        }
    });

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

    // $("#data-type-dropdown").on('click', 'a', function () {
    //     changeDataType($(this).text());
    // });

    $('#convert-button').on('click', function () {
        convertData(true);
    });

    $(window).on('resize', refreshEditors);

    $('#template-save-button').on('click', function () {
        saveTemplate();
    });

    $('#new-template-button').on('click', function () {
        openNewTemplateForm();
    });

    $('#new-template-create').on('click', function () {
        createNewTemplate();
    });

    $('#new-template-cancel').on('click', function () {
        cancelNewTemplateForm();
    });

    $('#new-template-name').on('keydown', function (event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            createNewTemplate();
        } else if (event.key === 'Escape') {
            cancelNewTemplateForm();
        }
    });

    $('#new-sample-button').on('click', function () {
        createNewSample();
    });

    $('#import-sample-button').on('click', function () {
        $('#import-sample-input').trigger('click');
    });

    $('#import-sample-input').on('change', function (event) {
        var files = Array.prototype.slice.call(event.target.files || []);
        event.target.value = '';
        handleImportedSamples(files);
    });

    $('#save-sample-button').on('click', function () {
        openSaveSampleForm();
    });

    $('#save-sample-create').on('click', function () {
        saveCurrentSample();
    });

    $('#save-sample-cancel').on('click', function () {
        cancelSaveSampleForm();
    });

    $('#save-sample-name').on('keydown', function (event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            saveCurrentSample();
        } else if (event.key === 'Escape') {
            cancelSaveSampleForm();
        }
    });

    setupSampleDropZone($('.msg-area'), function (files) {
        var file = files.filter(isSupportedSampleFile)[0];
        if (!file) {
            showConversionError('Dropped files must end in .hl7, .txt, or .msg.');
            return;
        }
        readTextFile(file, function (text) {
            if (text === null) {
                showConversionError('Could not read ' + file.name + '.');
                return;
            }
            dataEditor.setValue(text);
            $('#message-name').text(file.name + ' (unsaved)');
            convertData(true);
        });
    });

    setupSampleDropZone($('#file-browser'), function (files) {
        var supported = files.filter(isSupportedSampleFile);
        if (!supported.length) {
            showConversionError('Dropped files must end in .hl7, .txt, or .msg.');
            return;
        }
        importMultipleSamples(supported);
    });

    $('#copy-result-button').on('click', function () {
        var text = outputCode.getValue();
        if (!navigator.clipboard || !navigator.clipboard.writeText) {
            showConversionError('Could not copy the result.');
            return;
        }
        navigator.clipboard.writeText(text).then(function () {
            var previous = $('#conversion-status').text();
            $('#conversion-status').text('Copied');
            setTimeout(function () {
                if ($('#conversion-status').text() === 'Copied') {
                    $('#conversion-status').text(previous);
                }
            }, 2000);
        }).catch(function () {
            showConversionError('Could not copy the result.');
        });
    });

    $('#banner-close').on('click', function () {
        $('#banner').slideUp(transitionTime);
        clearTimeout(bannerFade);
        bannerFade = null;
    });

    $('#settings-modal [role="tab"]').on('click', function () {
        showSettingsTab($(this).attr('data-settings-tab'));
    });

    $("#settings-modal").on('show.bs.modal', function () {
        var settings = getSettings();
        var themeChoice = resolveStoredTheme();
        $('input[name="settings-theme"][value="' + themeChoice + '"]').prop('checked', true);
        $('input[name="settings-palette"][value="' + resolveStoredPalette() + '"]').prop('checked', true);
        $('#settings-convert-while-typing').prop('checked', settings.convertWhileTyping !== false);
        $('#settings-timezone').val(settings.timezone || '');
        $('#settings-fhir-url').val(settings.fhirBaseUrl || '');
        $('#settings-fhir-auth').val(settings.fhirAuth || 'none');
        $('#settings-fhir-token').val(settings.fhirToken || '');
        $('#settings-fhir-username').val(settings.fhirUsername || '');
        $('#settings-fhir-password').val(settings.fhirPassword || '');
        $('#settings-fhir-conditional').prop('checked', settings.fhirConditional === true);
        showFhirAuthFields();
        populateAiSettingsModal();
    });

    $("#settings-modal").on('hidden.bs.modal', function () {
        $('#settings-ai-notice').text('').prop('hidden', true);
    });

    $('input[name="settings-theme"]').on('change', function () {
        var settings = getSettings();
        currentThemeChoice = settings.theme = $(this).val();
        setSettings(settings);
        applyTheme(currentThemeChoice);
    });

    $('input[name="settings-palette"]').on('change', function () {
        var settings = getSettings();
        settings.palette = $(this).val();
        setSettings(settings);
        applyPalette(settings.palette);
    });

    $('#settings-fhir-auth').on('change', showFhirAuthFields);

    $('#settings-ai-provider').on('change', function () {
        stashCurrentAiModalInputs();
        syncAiProviderFields($('#settings-ai-provider').val());
    });

    $('#settings-save-button').on('click', function () {
        var settings = getSettings();
        settings.theme = $('input[name="settings-theme"]:checked').val() || settings.theme || 'light';
        settings.palette = $('input[name="settings-palette"]:checked').val() || settings.palette || 'paper';
        settings.convertWhileTyping = $('#settings-convert-while-typing').prop('checked');
        settings.timezone = $('#settings-timezone').val();
        settings.fhirBaseUrl = $('#settings-fhir-url').val().trim();
        settings.fhirAuth = $('#settings-fhir-auth').val();
        settings.fhirToken = $('#settings-fhir-token').val();
        settings.fhirUsername = $('#settings-fhir-username').val();
        settings.fhirPassword = $('#settings-fhir-password').val();
        settings.fhirConditional = $('#settings-fhir-conditional').prop('checked');
        saveAiFieldsFromModal(settings);
        setSettings(settings);
    });

    $('#send-fhir-button').on('click', function () {
        sendToFhir();
    });

    $('#validate-fhir-button').on('click', function () {
        validateFhir();
    });
    updateValidateButton();

    $('#format-template-button').on('click', formatActiveTemplate);
    $('#generate-template-button').on('click', function () {
        runGenerateTemplate();
    });

    loadAiProviderCatalog();
    changeDataType('HL7V2');
});

function openNewTemplateForm() {
    $('#new-template-button').attr('hidden', true);
    $('#new-template-form').removeAttr('hidden');
    $('#new-template-name').val('').focus();
}

function closeNewTemplateForm() {
    $('#new-template-form').attr('hidden', true);
    $('#new-template-name').val('');
    $('#new-template-button').removeAttr('hidden');
}

function cancelNewTemplateForm() {
    closeNewTemplateForm();
    var errorText = $('#conversion-error').text();
    if (errorText === 'Enter a template name.' || errorText === 'Invalid template name.' || errorText === 'A template with that name already exists.') {
        hideConversionError();
    }
}

function createNewTemplate() {
    var name = $('#new-template-name').val().trim();
    if (!name) {
        showConversionError('Enter a template name.');
        return;
    }
    if (!name.endsWith('.liquid')) {
        name += '.liquid';
    }
    if (name.indexOf('..') !== -1 || name.indexOf('\\') !== -1 || name.charAt(0) === '/') {
        showConversionError('Invalid template name.');
        return;
    }
    if ((templateNames || []).indexOf(name) !== -1 || openTemplates.some(template => template.name === name)) {
        showConversionError('A template with that name already exists.');
        return;
    }
    hideConversionError();
    openLocalTemplate(name, '', true);
    closeNewTemplateForm();
}

// ---- HL7v2 sample management (spec 20) ----

var SAMPLE_FILE_EXTENSIONS = ['.hl7', '.txt', '.msg'];
var BUILTIN_SAMPLE_CONFLICT = 'Cannot overwrite a built-in sample. Save under a new file name.';

function isSupportedSampleFile(fileName) {
    var lower = String(fileName || '').toLowerCase();
    return SAMPLE_FILE_EXTENSIONS.some(function (ext) {
        return lower.endsWith(ext);
    });
}

function sanitizeSampleFileName(fileName) {
    var base = String(fileName || '');
    var dot = base.lastIndexOf('.');
    var ext = dot === -1 ? '' : base.substring(dot).toLowerCase();
    if (dot !== -1) {
        base = base.substring(0, dot);
    }
    if (SAMPLE_FILE_EXTENSIONS.indexOf(ext) === -1) {
        ext = '.hl7';
    }
    base = base.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\./, '');
    if (!base) {
        base = 'sample';
    }
    return base + ext;
}

function sampleEventTypeFromTemplate(templateName) {
    var base = String(templateName || '').replace(/\.liquid$/, '');
    var parts = base.split('_');
    var type = parts[0] || '';
    var event = parts.slice(1).join('_');
    if (/^[A-Z]{3}$/.test(type) && /^[A-Z][0-9]{2}$/.test(event)) {
        return type + '^' + event;
    }
    return 'ADT^A04';
}

function buildSyntheticSampleMessage(typeEvent) {
    var parts = typeEvent.split('^');
    var type = parts[0];
    var event = parts[1];
    var lines = [
        'MSH|^~\\&|fhir-converter-liquid|cli|fhir-converter-liquid|cli|20260101120000||' + type + '^' + event + '|MSG00001|P|T|2.5.1',
        'EVN|' + type + '^' + event + '|20260101120000',
        'PID|1||10001^^^hospital^MR||DOE^JANE||19800101|F|||123 Main Street^^Anytown||555-0100'
    ];
    if (type === 'ADT') {
        lines.push('PV1|1|I|48101^48101^hospital|1|01');
    } else if (type === 'ORU' || type === 'ORM' || type === 'OML') {
        lines.push('ORC|1|ORD123|FILL123|SC|||20260101120000|DR1|MD1||ORD|');
        lines.push('OBR|1|LAB123|LAB123|CBC^Complete Blood Count^L|1|P');
        lines.push('OBX|1|ST|1102^RBC COUNT^L|1|10.5|10^6/uL|4.0-5.9|N');
    } else if (type === 'VXU') {
        lines.push('RXA|0|1||20260101|999003^TETANUS TOXOID|0.5|1|ML|02|1|||V1');
    } else if (type === 'SIU') {
        lines.push('SCH|1|1|APPL|20260201090000|20260201093000|48101^48101^hospital');
    }
    return lines.join('\n') + '\n';
}

function createNewSample() {
    var typeEvent = sampleEventTypeFromTemplate(activeTemplate && activeTemplate.name);
    dataEditor.setValue(buildSyntheticSampleMessage(typeEvent));
    $('#message-name').text('synthetic-' + typeEvent.replace('^', '_') + '.hl7 (unsaved)');
    convertData(true);
}

function readTextFile(file, callback) {
    var reader = new FileReader();
    reader.onload = function () {
        callback(String(reader.result || ''));
    };
    reader.onerror = function () {
        callback(null);
    };
    reader.readAsText(file);
}

function sampleAjaxError(xhr) {
    var body = (xhr && xhr.responseJSON) || {};
    var message = (body.error && typeof body.error.message === 'string') ? body.error.message : null;
    return {
        status: xhr ? xhr.status : 0,
        message: message || 'Could not save sample.'
    };
}

function putSampleFile(fileName, text, callback) {
    var activeProj = (typeof getActiveProject === 'function') ? getActiveProject() : null;
    if (activeProj) {
        var roots = (typeof getActiveProjectRoots === 'function') ? getActiveProjectRoots() : null;
        var relSample = ((roots && roots.samples) ? roots.samples : 'samples/hl7v2') + '/' + fileName;
        saveProjectFile(relSample, 'sample', text, function (err) {
            if (err) {
                callback(err, null);
                return;
            }
            callback(null, relSample);
        });
        return;
    }
    $.ajax({
        url: getUrl('sample-data', 'hl7v2/' + fileName),
        type: 'PUT',
        contentType: 'text/plain',
        processData: false,
        data: text,
        dataType: 'json'
    }).done(function (response) {
        callback(null, response && response.messageName ? response.messageName : 'hl7v2/' + fileName);
    }).fail(function (xhr) {
        callback(sampleAjaxError(xhr), null);
    });
}

function nextSampleFileName(fileName) {
    var dot = fileName.lastIndexOf('.');
    var base = dot === -1 ? fileName : fileName.substring(0, dot);
    var ext = dot === -1 ? '' : fileName.substring(dot);
    return base + '-2' + ext;
}

function finishImportedSample(error, messageName) {
    if (error) {
        showConversionError(error.message);
        return;
    }
    selectedSample = messageName;
    refreshFileBrowser();
    loadData(messageName, function (text) {
        highlightMatchingTemplate(text);
    });
}

function importSingleSample(file) {
    readTextFile(file, function (text) {
        if (text === null) {
            showConversionError('Could not read ' + file.name + '.');
            return;
        }
        var name = sanitizeSampleFileName(file.name);
        putSampleFile(name, text, function (error, messageName) {
            if (error && error.message === BUILTIN_SAMPLE_CONFLICT) {
                putSampleFile(nextSampleFileName(name), text, function (retryError, retryName) {
                    finishImportedSample(retryError, retryName);
                });
                return;
            }
            finishImportedSample(error, messageName);
        });
    });
}

function importMultipleSamples(files) {
    var pending = files.length;
    var errors = [];
    var saved = [];
    files.forEach(function (file) {
        readTextFile(file, function (text) {
            if (text === null) {
                errors.push('Could not read ' + file.name + '.');
            } else {
                putSampleFile(sanitizeSampleFileName(file.name), text, function (error, messageName) {
                    if (error) {
                        errors.push(file.name + ': ' + error.message);
                    } else {
                        saved.push(messageName);
                    }
                    pending -= 1;
                    if (pending === 0) {
                        refreshFileBrowser();
                        if (saved.length) {
                            selectedSample = saved[0];
                            loadData(saved[0], function (text) {
                                highlightMatchingTemplate(text);
                            });
                        }
                        if (errors.length) {
                            showConversionError(errors.join(' '));
                        }
                    }
                });
            }
        });
    });
}

function handleImportedSamples(files) {
    if (!files.length) {
        return;
    }
    var supported = files.filter(isSupportedSampleFile);
    if (!supported.length) {
        showConversionError('Imported files must end in .hl7, .txt, or .msg.');
        return;
    }
    if (supported.length === 1) {
        importSingleSample(supported[0]);
    } else {
        importMultipleSamples(supported);
    }
}

function defaultSampleFileName(text) {
    if (typeof text !== 'string' || !text) {
        return '';
    }
    var parts = text.split('\n', 1)[0].split('|');
    var messageType = (parts[8] || '').replace(/\^/g, '_').trim();
    var control = (parts[9] || '').trim();
    if (messageType && control) {
        return messageType + '-' + control + '.hl7';
    }
    return '';
}

function openSaveSampleForm() {
    $('#save-sample-button').attr('hidden', true);
    $('#save-sample-form').removeAttr('hidden');
    $('#save-sample-name').val(defaultSampleFileName(dataEditor.getValue())).focus().select();
}

function closeSaveSampleForm() {
    $('#save-sample-form').attr('hidden', true);
    $('#save-sample-name').val('');
    $('#save-sample-button').removeAttr('hidden');
}

function cancelSaveSampleForm() {
    closeSaveSampleForm();
    var errorText = $('#conversion-error').text();
    if (errorText === 'Enter a sample name.' || errorText === 'Invalid sample file name.' || errorText === 'Sample message cannot be empty.') {
        hideConversionError();
    }
}

function saveCurrentSample() {
    var name = $('#save-sample-name').val().trim();
    if (!name) {
        showConversionError('Enter a sample name.');
        return;
    }
    if (!isSupportedSampleFile(name)) {
        name += '.hl7';
    }
    if (!/^[A-Za-z0-9._-]+$/.test(name)) {
        showConversionError('Invalid sample file name.');
        return;
    }
    var text = dataEditor.getValue();
    if (!text) {
        showConversionError('Sample message cannot be empty.');
        return;
    }
    putSampleFile(name, text, function (error, messageName) {
        if (error) {
            showConversionError(error.message);
            return;
        }
        closeSaveSampleForm();
        hideConversionError();
        selectedSample = messageName;
        $('#message-name').text(name);
        refreshFileBrowser();
        highlightMatchingTemplate(text);
    });
}

function setupSampleDropZone($zone, onFiles) {
    var depth = 0;
    function hasFiles(event) {
        var types = event.originalEvent.dataTransfer && event.originalEvent.dataTransfer.types;
        return Array.prototype.indexOf.call(types || [], 'Files') !== -1;
    }
    $zone.on('dragenter dragover', function (event) {
        if (!hasFiles(event)) {
            return;
        }
        event.preventDefault();
        if (event.originalEvent.dataTransfer) {
            event.originalEvent.dataTransfer.dropEffect = 'copy';
        }
        depth += 1;
        $zone.addClass('is-drop-target');
    });
    $zone.on('dragleave', function (event) {
        event.preventDefault();
        depth = Math.max(0, depth - 1);
        if (depth === 0) {
            $zone.removeClass('is-drop-target');
        }
    });
    $zone.on('drop', function (event) {
        event.preventDefault();
        depth = 0;
        $zone.removeClass('is-drop-target');
        var files = Array.prototype.slice.call(event.originalEvent.dataTransfer.files || []);
        onFiles(files);
    });
}

function nextGeneratedName() {
    var name = 'generated.liquid';
    var taken = function (candidate) {
        return (templateNames || []).indexOf(candidate) !== -1 || openTemplates.some(template => template.name === candidate);
    };
    if (!taken(name)) {
        return name;
    }
    var n = 2;
    while (taken('generated-' + n + '.liquid')) {
        n += 1;
    }
    return 'generated-' + n + '.liquid';
}

var aiProviderCatalog = {};
var activeSettingsAiProvider = null;
var AI_PROVIDER_LABELS = {
    openai: 'OpenAI',
    anthropic: 'Anthropic (Claude)',
    google: 'Google Gemini',
    xai: 'xAI (Grok)',
    mistral: 'Mistral',
    deepseek: 'DeepSeek',
    groq: 'Groq',
    openrouter: 'OpenRouter',
    local: 'Local (oMLX / Ollama)'
};

function loadAiProviderCatalog(done) {
    $.getJSON('/api/v1/ai/providers').done(function (data) {
        var nextCatalog = {};
        (data && data.available || []).forEach(function (item) {
            nextCatalog[item.name] = item;
        });
        aiProviderCatalog = nextCatalog;
        if (typeof done === 'function') {
            done();
        }
    }).fail(function () {
        if (typeof done === 'function') {
            done();
        }
    });
}

function providerNeedsCustomUrl(providerName) {
    return providerName === 'custom' || providerName === 'local';
}

function stashCurrentAiModalInputs() {
    if (!activeSettingsAiProvider) {
        return;
    }
    var settings = getSettings();
    settings.aiApiKeys = settings.aiApiKeys || {};
    settings.aiModels = settings.aiModels || {};
    settings.aiBaseUrls = settings.aiBaseUrls || {};
    settings.aiApiKeys[activeSettingsAiProvider] = $('#settings-ai-api-key').val() || '';
    var typedModel = ($('#settings-ai-model').val() || '').trim();
    if (typedModel) {
        settings.aiModels[activeSettingsAiProvider] = typedModel;
    }
    if (providerNeedsCustomUrl(activeSettingsAiProvider)) {
        settings.aiBaseUrls[activeSettingsAiProvider] = ($('#settings-ai-base-url').val() || '').trim();
    }
}

function syncAiProviderFields(providerName) {
    activeSettingsAiProvider = providerName || 'openai';
    var settings = getSettings();
    var info = aiProviderCatalog[activeSettingsAiProvider] || null;
    var models = (info && Array.isArray(info.models)) ? info.models : [];
    var datalist = $('#settings-ai-model-list').empty();
    models.forEach(function (m) {
        datalist.append($('<option>').val(m));
    });

    var savedKey = (settings.aiApiKeys && settings.aiApiKeys[activeSettingsAiProvider]) || '';
    $('#settings-ai-api-key').val(savedKey);

    if (info && info.requiresApiKey === false) {
        $('#settings-ai-key-label').text('API key (optional for local server)');
    } else if (info && info.configured) {
        $('#settings-ai-key-label').text('API key (server key configured — optional override)');
    } else {
        $('#settings-ai-key-label').text('API key');
    }

    var savedModel = (settings.aiModels && settings.aiModels[activeSettingsAiProvider]) || '';
    var defaultModel = models[0] || (activeSettingsAiProvider === 'custom' ? (settings.aiModel || '') : '');
    $('#settings-ai-model').val(savedModel || defaultModel);
    $('#settings-ai-model').attr('placeholder', defaultModel || 'Model ID');

    var showUrl = providerNeedsCustomUrl(activeSettingsAiProvider);
    $('#settings-ai-base-url-row').prop('hidden', !showUrl);
    if (showUrl) {
        var savedUrl = (settings.aiBaseUrls && settings.aiBaseUrls[activeSettingsAiProvider]) || '';
        var fallbackUrl = (info && info.baseUrl) || (activeSettingsAiProvider === 'local' ? 'http://127.0.0.1:8000/v1' : (settings.aiBaseUrl || ''));
        $('#settings-ai-base-url').val(savedUrl || fallbackUrl);
    }
}

function populateAiSettingsModal() {
    var render = function () {
        var settings = getSettings();
        var select = $('#settings-ai-provider');
        var names = Object.keys(aiProviderCatalog);
        if (names.length > 0) {
            select.empty();
            names.forEach(function (name) {
                var item = aiProviderCatalog[name];
                var baseLabel = item.label || AI_PROVIDER_LABELS[name] || name;
                var text = baseLabel + (item.configured ? ' · server key ready' : '');
                select.append($('<option>').val(name).text(text));
            });
            select.append($('<option>').val('custom').text('Custom (OpenAI-compatible)'));
        }
        var chosen = settings.aiProvider || 'openai';
        if (!select.find('option[value="' + chosen + '"]').length) {
            chosen = select.find('option').first().val() || 'openai';
        }
        activeSettingsAiProvider = null;
        select.val(chosen);
        $('#settings-ai-prompt').val(effectiveAiPrompt(settings.aiPrompt));
        syncAiProviderFields(chosen);
    };

    if (Object.keys(aiProviderCatalog).length === 0) {
        loadAiProviderCatalog(render);
    } else {
        render();
    }
}

function saveAiFieldsFromModal(settings) {
    var provider = $('#settings-ai-provider').val() || 'openai';
    var apiKey = $('#settings-ai-api-key').val() || '';
    var model = ($('#settings-ai-model').val() || '').trim();
    var baseUrl = ($('#settings-ai-base-url').val() || '').trim();
    var prompt = ($('#settings-ai-prompt').val() || '').trim();

    settings.aiProvider = provider;
    settings.aiPrompt = prompt;
    settings.aiApiKeys = settings.aiApiKeys || {};
    settings.aiModels = settings.aiModels || {};
    settings.aiBaseUrls = settings.aiBaseUrls || {};

    settings.aiApiKeys[provider] = apiKey;
    settings.aiApiKey = apiKey;
    if (model) {
        settings.aiModels[provider] = model;
        settings.aiModel = model;
    }
    if (providerNeedsCustomUrl(provider)) {
        settings.aiBaseUrls[provider] = baseUrl;
        settings.aiBaseUrl = baseUrl;
    } else {
        settings.aiBaseUrl = '';
    }
}

function sendToFhir() {
    var settings = getSettings();
    if (!settings.fhirBaseUrl) {
        showConversionError('Set a FHIR server in Settings.');
        return;
    }
    var resource;
    try {
        resource = JSON.parse(outputCode.getValue());
    } catch (ex) {
        showConversionError('The result is not JSON.');
        return;
    }
    if (!window.confirm('Send the current FHIR result to ' + settings.fhirBaseUrl + '?')) {
        return;
    }
    $('#conversion-status').text('Sending…');
    var sendBody = {
        baseUrl: settings.fhirBaseUrl,
        resource: resource,
        auth: settings.fhirAuth,
        token: settings.fhirToken,
        username: settings.fhirUsername,
        password: settings.fhirPassword
    };
    if (settings.fhirConditional === true) {
        sendBody.conditional = true;
    }
    $.ajax('/api/v1/fhir/send', {
        data: JSON.stringify(sendBody),
        type: 'POST',
        processData: false,
        contentType: 'application/json',
        success: function () {
            $('#conversion-status').text('Sent');
            hideConversionError();
        },
        error: function (err) {
            $('#conversion-status').text('Failed');
            var message = 'FHIR server request failed.';
            if (err.responseJSON && err.responseJSON.error && err.responseJSON.error.message) {
                message = err.responseJSON.error.message;
            }
            showConversionError(message);
        }
    });
}

function parseResultResource() {
    if (typeof outputCode === 'undefined' || !outputCode) {
        return null;
    }
    var text = outputCode.getValue();
    if (!text || !text.trim()) {
        return null;
    }
    try {
        var parsed = JSON.parse(text);
        return parsed && typeof parsed === 'object' && parsed.resourceType ? parsed : null;
    } catch (ex) {
        return null;
    }
}

function updateValidateButton() {
    var button = $('#validate-fhir-button');
    if (!button.length) {
        return;
    }
    var settings = getSettings();
    var hasUrl = Boolean(settings && settings.fhirBaseUrl);
    var enabled = hasUrl && parseResultResource() !== null;
    button.prop('disabled', !enabled);
    button.attr('title', enabled ? 'Validate the result at the FHIR server $validate endpoint' : 'Needs a FHIR result and a FHIR server URL in Settings');
}

// Posts the current result to the server route for {base}/$validate. Never called from convert.
function validateFhir() {
    var settings = getSettings();
    var resource = parseResultResource();
    if (!settings.fhirBaseUrl || !resource) {
        updateValidateButton();
        return;
    }
    $('#validate-fhir-button').prop('disabled', true);
    $('#conversion-status').text('Validating…');
    $.ajax('/api/v1/fhir/validate', {
        data: JSON.stringify({
            baseUrl: settings.fhirBaseUrl,
            resource: resource,
            auth: settings.fhirAuth,
            token: settings.fhirToken,
            username: settings.fhirUsername,
            password: settings.fhirPassword
        }),
        type: 'POST',
        processData: false,
        contentType: 'application/json',
        success: function (data) {
            $('#conversion-status').text('Validated');
            if (typeof window.showValidationResult === 'function') {
                window.showValidationResult({status: data.status, issues: data.issues || [], body: data.body});
            }
        },
        error: function (err) {
            $('#conversion-status').text('Validation failed');
            var message = 'FHIR server request failed.';
            if (err.responseJSON && err.responseJSON.error && err.responseJSON.error.message) {
                message = err.responseJSON.error.message;
            }
            var detail = err.responseJSON && err.responseJSON.detail;
            if (typeof window.showValidationResult === 'function') {
                window.showValidationResult({
                    error: message,
                    status: detail && detail.status,
                    issues: (detail && detail.issues) || [],
                    body: detail && detail.body
                });
            }
        },
        complete: function () {
            updateValidateButton();
        }
    });
}

function runGenerateTemplate() {
    var srcMessage = dataEditor ? dataEditor.getValue() : '';
    if (!srcMessage || !srcMessage.trim()) {
        showConversionError('Load or paste an HL7 v2 message before generating a template.');
        return;
    }

    var executeGenerate = function () {
        var settings = getSettings();
        var provider = settings.aiProvider || 'openai';
        var info = aiProviderCatalog[provider] || null;
        var apiKey = ((settings.aiApiKeys && settings.aiApiKeys[provider]) || settings.aiApiKey || '').trim();
        var model = ((settings.aiModels && settings.aiModels[provider]) || settings.aiModel || (info && info.models && info.models[0]) || '').trim();
        var customUrl = providerNeedsCustomUrl(provider)
            ? (((settings.aiBaseUrls && settings.aiBaseUrls[provider]) || settings.aiBaseUrl || (info && info.baseUrl) || '').trim())
            : '';

        var hasServerKey = Boolean(info && info.configured);
        var keyOptional = Boolean(info && info.requiresApiKey === false);

        if ((provider === 'custom' && (!customUrl || !apiKey)) || (!keyOptional && !apiKey && !hasServerKey)) {
            var displayLabel = (info && info.label) || provider;
            $('#settings-ai-notice')
                .text('Paste your ' + displayLabel + ' API key below and click Save, then click Generate.')
                .prop('hidden', false);
            $('#settings-modal').modal('show');
            setTimeout(function () {
                $('#settings-ai-api-key').focus();
            }, 250);
            return;
        }

        var payload = {
            sampleDataInline: srcMessage,
            provider: provider,
            model: model,
            prompt: effectiveAiPrompt(settings.aiPrompt),
            confirmedExternalSend: true
        };
        if (apiKey) {
            payload.apiKey = apiKey;
        }
        if (customUrl) {
            payload.baseUrl = customUrl;
        }

        var $btn = $('#generate-template-button');
        $btn.prop('disabled', true).text('Generating…');
        $('#conversion-status').text('Generating template…');
        hideConversionError();

        $.ajax('/api/v1/templategenerate', {
            data: JSON.stringify(payload),
            type: 'POST',
            processData: false,
            contentType: 'application/json',
            success: function (data) {
                $btn.prop('disabled', false).text('Generate');
                openLocalTemplate(nextGeneratedName(), data.generated || '', true);
                if (data.fhirResource !== undefined) {
                    outputCode.setValue(JSON.stringify(data.fhirResource, null, 2));
                    $('#conversion-status').text(conversionStatusLabel(data.fhirResource));
                } else {
                    $('#conversion-status').text('Converted');
                }
                hideConversionError();
                if (typeof refreshEditors === 'function') {
                    refreshEditors();
                }
            },
            error: function (err) {
                $btn.prop('disabled', false).text('Generate');
                $('#conversion-status').text('Failed');
                var message = 'Template generation failed.';
                if (err.responseJSON && err.responseJSON.error && err.responseJSON.error.message) {
                    message = err.responseJSON.error.message;
                }
                showConversionError(message);
            }
        });
    };

    if (Object.keys(aiProviderCatalog).length === 0) {
        loadAiProviderCatalog(executeGenerate);
    } else {
        executeGenerate();
    }
}
