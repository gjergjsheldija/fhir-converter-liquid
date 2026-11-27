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
var hasSuccessfulCallBeenMade = false;

var currentDataType;
var templateOutputSplit;
var dataTemplateSplit;

function getUrl(endpoint, fileName) {
    var base = '/api/v1/' + endpoint + (fileName ? '/' + fileName : '');
    if (!fileName && currentDataType === 'fhir' && (endpoint === 'sample-data' || endpoint === 'templates')) {
        return base + '?dataType=fhir';
    }
    return base;
}

function getDataTypeSpecificUrl(endpoint, fileName) {
    const baseUrl = `/api/v1/${endpoint}/${currentDataType}${fileName ? '/' + fileName : ''}`;
    return `${baseUrl}?unusedSegments=true&invalidAccess=true&debug=true`;
}

function applyTemplateList(templates) {
    var names = (templates || []).map(function (template) {
        return template.templateName;
    });
    var isFhirReverse = currentDataType === 'fhir';
    var expectedPrefix = isFhirReverse ? 'fhirtohl7v2/' : 'hl7v2/';
    var defaultPrefix = isFhirReverse ? 'FhirToHl7v2/' : 'Hl7v2/';
    var match = names.find(function (name) {
        return typeof name === 'string' && name.toLowerCase().startsWith(expectedPrefix);
    });
    templateKeyPrefix = match ? match.slice(0, match.indexOf('/') + 1) : defaultPrefix;
    templateNames = names
        .filter(function (name) {
            return typeof name === 'string' && name.toLowerCase().startsWith(expectedPrefix);
        })
        .map(function (name) {
            return name.substring(name.indexOf('/') + 1);
        });
    var root = typeof globalThis !== 'undefined' ? globalThis : window;
    root.templateKeyPrefix = templateKeyPrefix;
    root.templateNames = templateNames;
}

function clearLatestDebugInfo() {
    var root = typeof window !== 'undefined' ? window : globalThis;
    root.latestDebugInfo = null;
    if (typeof $ === 'function' && typeof document !== 'undefined') {
        $(document).trigger('fhir:debug-updated', [root.latestDebugInfo]);
    }
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
    if (
        resource &&
        typeof resource === 'object' &&
        (typeof resource.hl7v2Message === 'string' || typeof resource.messageType === 'string' || typeof resource.segmentCount === 'number')
    ) {
        var msgType = (typeof resource.messageType === 'string' && resource.messageType.trim().length > 0)
            ? resource.messageType.trim()
            : 'HL7v2';
        var segCount = typeof resource.segmentCount === 'number'
            ? resource.segmentCount
            : (typeof resource.hl7v2Message === 'string'
                ? resource.hl7v2Message.split(/\r\n|\r|\n/).filter(function (line) { return line.trim().length > 0; }).length
                : null);
        if (typeof segCount === 'number') {
            return 'Converted · ' + msgType + ' · ' + segCount + (segCount === 1 ? ' segment' : ' segments');
        }
        return 'Converted · ' + msgType;
    }
    return 'Converted';
}

function applyConversionStatus(resource, unusedCount) {
    var label = conversionStatusLabel(resource);
    var root = typeof window !== 'undefined' ? window : globalThis;
    var info = root.latestDebugInfo;
    if (info && typeof info.durationMs === 'number') {
        label += ' · ' + info.durationMs + ' ms';
    }
    if (unusedCount > 0) {
        label += unusedCount === 1 ? ' · 1 field not read' : ' · ' + unusedCount + ' fields not read';
    }
    $('#conversion-status').text(label);
    syncSessionChrome();
}

function syncDirectionToggleUi() {
    if (typeof $ !== 'function') {
        return;
    }
    var project = typeof getActiveProject === 'function' ? getActiveProject() : null;
    var isFhirReverse = currentDataType === 'fhir';
    $('#direction-toggle').prop('hidden', Boolean(project));
    $('#mode-hl7-to-fhir')
        .toggleClass('is-active', !isFhirReverse)
        .attr('aria-pressed', !isFhirReverse ? 'true' : 'false');
    $('#mode-fhir-to-hl7')
        .toggleClass('is-active', isFhirReverse)
        .attr('aria-pressed', isFhirReverse ? 'true' : 'false');
}

function syncStudioDataTypePanes() {
    var isFhirReverse = currentDataType === 'fhir';
    if (typeof $ === 'function') {
        $('#input-pane-label').text(isFhirReverse ? 'FHIR Bundle (JSON)' : 'Sample Data (HL7v2)');
        $('#input-pane-icon').attr('href', isFhirReverse ? '/icons.svg#icon-json' : '/icons.svg#icon-message');
        $('#output-pane-label').text(isFhirReverse ? 'HL7v2 Result' : 'FHIR Result');
        $('#output-pane-icon').attr('href', isFhirReverse ? '/icons.svg#icon-hl7' : '/icons.svg#icon-json');
        $('#import-sample-input').attr('accept', isFhirReverse ? '.json,application/json' : '.hl7,.txt,.msg');
        $('#save-sample-name').attr('placeholder', isFhirReverse ? 'Name, .json optional' : 'Name, .hl7 optional');
        $('#fold-input-button').prop('hidden', !isFhirReverse);
        $('#fold-result-button').prop('hidden', isFhirReverse);
        $('#ig-coverage-slot').prop('hidden', isFhirReverse);
    }
    if (dataEditor && typeof dataEditor.setOption === 'function') {
        dataEditor.setOption('mode', isFhirReverse ? {name: 'javascript', json: true} : 'hl7v2');
        dataEditor.setOption('foldGutter', true);
    }
    if (outputCode && typeof outputCode.setOption === 'function') {
        outputCode.setOption('mode', isFhirReverse ? 'hl7v2' : {name: 'javascript', json: true});
    }
}

function switchStudioDataType(nextDataType) {
    var normalized = String(nextDataType || '').toLowerCase() === 'fhir' ? 'fhir' : 'hl7v2';
    if (typeof closeAllTemplates === 'function' && typeof openTemplates !== 'undefined' && dataEditor) {
        if (!closeAllTemplates(true)) {
            syncDirectionToggleUi();
            return false;
        }
    }
    currentDataType = normalized;
    var root = typeof globalThis !== 'undefined' ? globalThis : window;
    root.currentDataType = normalized;
    var nextPrefix = normalized === 'fhir' ? 'FhirToHl7v2/' : 'Hl7v2/';
    if (typeof templateKeyPrefix !== 'undefined') {
        templateKeyPrefix = nextPrefix;
    }
    root.templateKeyPrefix = nextPrefix;

    if (dataEditor && typeof dataEditor.setValue === 'function') {
        dataEditor.setValue('');
    }
    if (outputCode && typeof outputCode.setValue === 'function') {
        outputCode.setValue('');
    }
    syncDirectionToggleUi();
    syncStudioDataTypePanes();
    if (dataTemplateSplit && typeof dataTemplateSplit.setSizes === 'function') {
        var expanded = typeof $ === 'function' && $('#message-expand').attr('aria-expanded') === 'true';
        if (!expanded) {
            dataTemplateSplit.setSizes(normalized === 'fhir' ? [26, 74] : [16, 84]);
        }
    }
    setUnusedLegend(false);
    hideResultError();
    hideConversionError();
    if (typeof $ === 'function') {
        $('#conversion-status').text('');
    }
    clearLatestDebugInfo();
    if (typeof updateValidateButton === 'function') {
        updateValidateButton();
    }
    refreshEditors();

    var activeProj = (typeof getActiveProject === 'function') ? getActiveProject() : null;
    if (!activeProj && typeof $ === 'function' && typeof $.ajax === 'function') {
        $.ajax({
            url: getUrl('sample-data'),
            dataType: 'json',
            cache: false,
            success: function (sampleList) {
                $.ajax({
                    url: getUrl('templates'),
                    dataType: 'json',
                    cache: false,
                    success: function (templateList) {
                        if (currentDataType !== normalized) {
                            return;
                        }
                        applyTemplateList((templateList && templateList.templates) || []);
                        var messages = (sampleList && sampleList.messages) || [];
                        root.cachedSamples = messages;
                        var preferredSample = normalized === 'fhir'
                            ? 'fhir/Discharge_Composition_Bundle.json'
                            : 'hl7v2/ADT04-23.hl7';
                        var preferredTemplate = normalized === 'fhir'
                            ? 'MDM_T02.liquid'
                            : 'ADT_A04.liquid';
                        var chosenSample = messages.some(function (m) { return m.messageName === preferredSample; })
                            ? preferredSample
                            : (messages[0] ? messages[0].messageName : null);
                        var chosenTemplate = (Array.isArray(templateNames) && templateNames.indexOf(preferredTemplate) !== -1)
                            ? preferredTemplate
                            : ((Array.isArray(templateNames) && templateNames[0]) || null);
                        root.selectedSample = chosenSample;
                        root.selectedTemplate = chosenTemplate;
                        root.suggestedTemplate = null;
                        if (typeof renderFileBrowser === 'function') {
                            renderFileBrowser(messages);
                        }
                        if (chosenTemplate && typeof loadTemplate === 'function') {
                            loadTemplate(chosenTemplate);
                        }
                        if (chosenSample && typeof loadData === 'function') {
                            loadData(chosenSample, function () {
                                convertData(true);
                            });
                        }
                    }
                });
            }
        });
    }
    return true;
}

function syncSessionChrome() {
    var settings = typeof getSettings === 'function' ? getSettings() : {};
    var project = typeof getActiveProject === 'function' ? getActiveProject() : null;
    syncDirectionToggleUi();
    var converted = $('#conversion-status').text().indexOf('Converted') === 0;
    $('#session-pitch').prop('hidden', Boolean(project) || !converted);
    $('#project-readonly').prop('hidden', !(project && project.kind === 'github'));
    var sampleName = $('#message-name').text() || '';
    var templateLabel = $('#template-open-name').text() || '';
    $('#message-name').toggleClass('is-empty', sampleName === 'No sample');
    $('#template-open-name').toggleClass('is-empty', templateLabel === 'untitled');
    $('#convert-button').toggleClass('is-manual', settings.convertWhileTyping === false);
    var isFhirReverse = currentDataType === 'fhir';
    var pitch = isFhirReverse
        ? 'This FHIR bundle is now an HL7 v2 message.'
        : 'This message is now a FHIR bundle.';
    if (!isFhirReverse && /ADT/i.test(sampleName)) {
        pitch = 'This ADT message is now a FHIR bundle.';
    } else if (sampleName === 'No sample') {
        pitch = isFhirReverse
            ? 'Pick a FHIR bundle. The HL7v2 result updates beside the template.'
            : 'Pick a sample. The FHIR result updates beside the template.';
    }
    $('#session-pitch').text(pitch);
}

function setMessageStripExpanded(expanded) {
    if (dataTemplateSplit) {
        var collapsedSizes = currentDataType === 'fhir' ? [26, 74] : [16, 84];
        dataTemplateSplit.setSizes(expanded ? [45, 55] : collapsedSizes);
    }
    $('#message-expand').attr('aria-expanded', expanded ? 'true' : 'false').text(expanded ? 'Show less' : 'Show full message');
    refreshEditors();
}

function setCommandPaletteOpen(open) {
    $('#command-palette').prop('hidden', !open);
    $('#command-search').attr('aria-expanded', open ? 'true' : 'false');
    if (open) {
        $('#command-filter').val('').trigger('input').trigger('focus');
    }
    refreshEditors();
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
    var settings = typeof getSettings === 'function' ? getSettings() : {};
    if (!force && settings.convertWhileTyping === false) {
        return;
    }

    if (nextRequestCall) {
        clearTimeout(nextRequestCall);
    }

    nextRequestCall = setTimeout(() => {
        var reqBody = {};
        var templateLines = [];
        var outputLines = [];

        if (dataEditor.getValue() && dataEditor.getValue() !== '') {
            reqBody.srcData = dataEditor.getValue();
        } else {
            clearLatestDebugInfo();
            return;
        }

        var activeProj = (typeof getActiveProject === 'function') ? getActiveProject() : null;
        var activeSettings = typeof getSettings === 'function' ? getSettings() : {};
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
        if (activeSettings.timezone) {
            headers.timezone = activeSettings.timezone;
        }
        if (activeSettings.convertApiKey) {
            headers.Authorization = 'Bearer ' + activeSettings.convertApiKey;
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
                    var root = typeof window !== 'undefined' ? window : globalThis;
                    root.latestDebugInfo = (data && data.debugInfo) ? data.debugInfo : null;

                    if (currentDataType === 'fhir' || (data && typeof data.hl7v2Message === 'string')) {
                        var rawHl7 = (data && typeof data.hl7v2Message === 'string') ? data.hl7v2Message : '';
                        var normalizedHl7 = rawHl7.replace(/\r\n|\r/g, '\n');
                        if (root.latestDebugInfo) {
                            root.latestDebugInfo.hl7v2Message = rawHl7;
                            root.latestDebugInfo.messageType = data.messageType || null;
                            root.latestDebugInfo.segmentCount = data.segmentCount;
                        }
                        if (dataEditor && typeof dataEditor.getDoc === 'function') {
                            var fhirDoc = dataEditor.getDoc();
                            if (fhirDoc && typeof fhirDoc.getAllMarks === 'function') {
                                fhirDoc.getAllMarks().forEach(function (mark) {
                                    if (mark && mark.className === 'unused-segment') {
                                        mark.clear();
                                    }
                                });
                            }
                        }
                        outputCode.setValue(normalizedHl7);
                        $(document).trigger('fhir:debug-updated', [root.latestDebugInfo]);
                        hideResultError();
                        applyConversionStatus(data);
                        hideConversionError();
                        setUnusedLegend(false);
                        if (typeof updateValidateButton === 'function') {
                            updateValidateButton();
                        }
                        refreshEditors();
                        return;
                    }

                    if (root.latestDebugInfo) {
                        root.latestDebugInfo.unusedSegments = data.unusedSegments || [];
                        root.latestDebugInfo.fhirResource = data.fhirResource || null;
                    }
                    // Formatting output and splitting on line breaks (taking platform variations into consideration)
                    outputLines = JSON.stringify(data.fhirResource, null, 2).replace(/(?:\r\n|\r|\n)/g, '\n').split('\n');

                    outputCode.setValue(outputLines.join('\n'));
                    $(document).trigger('fhir:debug-updated', [root.latestDebugInfo]);
                    hideResultError();
                    applyConversionStatus(data.fhirResource);
                    hideConversionError();
                    setUnusedLegend(false);
                    refreshEditors();

                    // Makes the unused line marking async to help performance.
                    if (currentDataType === 'hl7v2') {
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
                                                    }, {className: 'unused-segment', attributes: {title: 'Not read by the template'}});
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
                                applyConversionStatus(data.fhirResource, unusedMarkCount);
                            }
                        }, 0);
                    }
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
        dataEditor.setValue('');
        outputCode.setValue('');

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
                    sizes: [58, 42],
                    onDrag: refreshEditors,
                    onDragEnd: refreshEditors
                });

                dataTemplateSplit = Split(['.msg-area', '.editor-area'], {
                    gutterSize: 5,
                    sizes: [16, 84],
                    direction: 'vertical',
                    onDrag: refreshEditors,
                    onDragEnd: refreshEditors
                });

                dataEditor.setOption('mode', 'hl7v2');
                syncDirectionToggleUi();
                syncStudioDataTypePanes();
                break;
            case 'CDA':
                $('#editor-main, #editor-panes').removeClass('vertical-content');

                // Create splits for editor areas
                templateOutputSplit = Split(['.template-area', '.output-area'], {
                    gutterSize: 5,
                    sizes: [58, 42],
                    onDrag: refreshEditors,
                    onDragEnd: refreshEditors
                });

                dataTemplateSplit = Split(['.msg-area', '.editor-area'], {
                    gutterSize: 5,
                    sizes: [30, 70],
                    onDrag: refreshEditors,
                    onDragEnd: refreshEditors
                });

                dataEditor.setOption('mode', 'xml');
                syncDirectionToggleUi();
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

var _editorGlobal = typeof globalThis !== 'undefined' ? globalThis : window;
_editorGlobal.getUrl = getUrl;
_editorGlobal.getDataTypeSpecificUrl = getDataTypeSpecificUrl;
_editorGlobal.applyTemplateList = applyTemplateList;
_editorGlobal.conversionStatusLabel = conversionStatusLabel;
_editorGlobal.unchangedFromReference = unchangedFromReference;
_editorGlobal.indexOfX = indexOfX;
_editorGlobal.refreshEditors = refreshEditors;
_editorGlobal.convertData = convertData;
_editorGlobal.changeDataType = changeDataType;
_editorGlobal.switchStudioDataType = switchStudioDataType;
_editorGlobal.syncDirectionToggleUi = syncDirectionToggleUi;
_editorGlobal.syncStudioDataTypePanes = syncStudioDataTypePanes;
_editorGlobal.showConversionError = showConversionError;
_editorGlobal.hideConversionError = hideConversionError;
_editorGlobal.showResultError = showResultError;
_editorGlobal.hideResultError = hideResultError;
_editorGlobal.syncSessionChrome = syncSessionChrome;
_editorGlobal.updateUnsavedDot = updateUnsavedDot;
_editorGlobal.formatActiveTemplate = formatActiveTemplate;

if (typeof $ === 'function' && typeof document !== 'undefined') {
    $(document).ready(function () {
        dataEditor = CodeMirror.fromTextArea(document.getElementById('databox'), {
            lineNumbers: true,
            lineWrapping: true,
            theme: 'fhir',
            mode: 'hl7v2',
            extraKeys: {
                'Ctrl-Q': function (cm) {
                    cm.foldCode(cm.getCursor());
                }
            },
            foldGutter: true,
            gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter']
        });

        dataEditor.on('change', function () {
            convertData();
        });

        outputCode = CodeMirror.fromTextArea(document.getElementById('resultbox'), {
            readOnly: true,
            lineNumbers: true,
            lineWrapping: true,
            theme: 'fhir',
            mode: {name: 'javascript', json: true},
            extraKeys: {
                'Ctrl-Q': function (cm) {
                    cm.foldCode(cm.getCursor());
                }
            },
            foldGutter: true,
            gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter']
        });
        if (typeof updateValidateButton === 'function') {
            outputCode.on('change', updateValidateButton);
        }

        let extrakeysObj = {};
        extrakeysObj['Shift-Alt-F'] = formatActiveTemplate;
        extrakeysObj['Tab'] = function (cm) {
            var spaces = Array(5).join(' ');
            cm.replaceSelection(spaces);
        };
        extrakeysObj['Ctrl-Q'] = function (cm) {
            cm.foldCode(cm.getCursor());
        };

        templateCodeEditor = CodeMirror.fromTextArea(document.getElementById('templatebox'), {
            theme: 'fhir',
            lineNumbers: true,
            /*global hintExtraKeysObj*/
            extraKeys: Object.assign(extrakeysObj, hintExtraKeysObj),
            mode: 'liquid-json',
            smartIndent: false,
            matchBrackets: true,
            foldGutter: true,
            gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
            foldOptions: {
                rangeFinder: CodeMirror.fold.combine(CodeMirror.fold.liquid, CodeMirror.fold.brace)
            }
        });

        templateCodeEditor.on('change', function (instance, changeObj) {
            if (activeTemplate) {
                activeTemplate.data = templateCodeEditor.getValue();
                underlinePartialTemplateNames(templateCodeEditor.getDoc(), changeObj);

                var tab = getTab(activeTemplate.name);
                if (tab) {
                    if (unchangedFromReference(activeTemplate.name, activeTemplate.data)) {
                        tab.removeClass('font-italic');
                    } else {
                        tab.addClass('font-italic');
                    }
                }
                updateUnsavedDot();
                renderIncludedPanel();
            }
            convertData();
        });

        if (typeof bindTemplateIncludeNavigation === 'function') {
            bindTemplateIncludeNavigation(templateCodeEditor);
        }

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

        syncSessionChrome();
        $('#command-search').on('click', function () {
            setCommandPaletteOpen($('#command-palette').prop('hidden'));
        });
        $('#command-filter').on('input', function () {
            var query = $(this).val().toLowerCase();
            $('#command-list').children().each(function () {
                var text = $(this).text().toLowerCase();
                var match = query.length === 0 || text.indexOf(query) !== -1;
                $(this).toggleClass('command-filtered', !match);
            });
        });
        $('#command-list').on('click', 'button, a', function () {
            setCommandPaletteOpen(false);
        });
        $(document).on('keydown', function (event) {
            if ((event.metaKey || event.ctrlKey) && (event.key === 'k' || event.key === 'K')) {
                event.preventDefault();
                setCommandPaletteOpen($('#command-palette').prop('hidden'));
            } else if (event.key === 'Escape' && !$('#command-palette').prop('hidden')) {
                setCommandPaletteOpen(false);
            }
        });
        $(document).on('mousedown', function (event) {
            var target = event.target;
            if (!$('#command-palette').prop('hidden') && !$(target).closest('#command-palette, #command-search').length) {
                setCommandPaletteOpen(false);
            }
        });
        $('#message-expand').on('click', function () {
            setMessageStripExpanded($(this).attr('aria-expanded') !== 'true');
        });

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

        $('#format-template-button').on('click', formatActiveTemplate);

        $('#mode-hl7-to-fhir').on('click', function () {
            if (currentDataType !== 'hl7v2') {
                switchStudioDataType('hl7v2');
            }
        });

        $('#mode-fhir-to-hl7').on('click', function () {
            if (currentDataType !== 'fhir') {
                switchStudioDataType('fhir');
            }
        });

        if (typeof bindEditorFoldToggle === 'function' && dataEditor) {
            bindEditorFoldToggle(dataEditor, '#fold-input-button');
        }

        if (typeof renderFileBrowser === 'function' && !renderFileBrowser._fhirWrapped) {
            var origRenderFileBrowser = renderFileBrowser;
            renderFileBrowser = function (messages) {
                var normalized = Array.isArray(messages) ? messages.map(function (item) {
                    if (
                        currentDataType === 'fhir' &&
                        item &&
                        typeof item.messageName === 'string' &&
                        item.messageName.toLowerCase().startsWith('fhir/')
                    ) {
                        return Object.assign({}, item, {projectSample: true});
                    }
                    return item;
                }) : messages;
                return origRenderFileBrowser(normalized);
            };
            renderFileBrowser._fhirWrapped = true;
            _editorGlobal.renderFileBrowser = renderFileBrowser;
        }

        if (typeof removeUserSample === 'function' && !removeUserSample._fhirWrapped) {
            var origRemoveUserSample = removeUserSample;
            removeUserSample = function (sample) {
                if (currentDataType === 'fhir' || (sample && typeof sample.full === 'string' && sample.full.indexOf('fhir/') === 0)) {
                    if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm('Delete sample "' + sample.label + '"?')) {
                        return;
                    }
                    $.ajax({
                        url: getUrl('sample-data', 'fhir/' + sample.label),
                        type: 'DELETE',
                        dataType: 'json'
                    }).done(function () {
                        if (typeof selectedSample !== 'undefined' && selectedSample === sample.full) {
                            selectedSample = null;
                            _editorGlobal.selectedSample = null;
                        }
                        if (typeof refreshFileBrowser === 'function') {
                            refreshFileBrowser();
                        }
                    }).fail(function (xhr) {
                        var body = (xhr && xhr.responseJSON) || {};
                        var msg = (body.error && typeof body.error.message === 'string') ? body.error.message : 'Could not delete sample.';
                        showConversionError(msg);
                    });
                    return;
                }
                return origRemoveUserSample(sample);
            };
            removeUserSample._fhirWrapped = true;
            _editorGlobal.removeUserSample = removeUserSample;
        }

        if (typeof updateValidateButton === 'function') {
            updateValidateButton();
        }
        changeDataType('HL7V2');
    });
}
