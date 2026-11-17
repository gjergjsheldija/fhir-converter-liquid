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
var nextRequestCall;
var waitForTypingTimeout = 100;
var bannerFade;
var transitionTime = 1000;
// eslint-disable-next-line no-unused-vars
var templateNames;

// The chosen color schemes also need to have their stylesheets linked in the index.html file
var darkMode = "blackboard";
var lightMode = "eclipse";

var currentEditorSettings = {
    darkMode: false,
    convertWhileTyping: true,
    timezone: '',
    fhirBaseUrl: '',
    fhirAuth: 'none',
    fhirToken: '',
    fhirUsername: '',
    fhirPassword: '',
    aiProvider: 'openai',
    aiBaseUrl: 'https://api.openai.com/v1',
    aiModel: 'gpt-4o-mini',
    aiApiKey: ''
};
try {
    currentEditorSettings = Object.assign(currentEditorSettings, JSON.parse(localStorage.getItem('fhirConverterSettings') || '{}'));
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
    }
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
    return `${baseUrl}?unusedSegments=true&invalidAccess=true`;
}

function showConversionError(message) {
    $('#conversion-error').text(message).removeAttr('hidden');
}

function hideConversionError() {
    $('#conversion-error').text('').attr('hidden', true);
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

function updateUnsavedDot() {
    if (!activeTemplate || unchangedFromReference(activeTemplate.name, activeTemplate.data)) {
        $('#unsaved-dot').attr('hidden', true);
    } else {
        $('#unsaved-dot').removeAttr('hidden');
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
            return;
        }

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
        $.ajax(getDataTypeSpecificUrl('convert'), {
            'data': JSON.stringify(reqBody),
            'type': 'POST',
            'processData': false,
            'contentType': 'application/json',
            'headers': headers,
            'success': function (data) {
                if (latestRequest === requestNumber) {
                    hasSuccessfulCallBeenMade = true;
                    // Formatting output and splitting on line breaks (taking platform variations into consideration)
                    outputLines = JSON.stringify(data.fhirResource, null, 2).replace(/(?:\r\n|\r|\n)/g, '\n').split('\n');

                    outputCode.setValue(outputLines.join('\n'));
                    hideResultError();
                    $('#conversion-status').text('Converted');
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

function setColorTheme(isDarkMode) {
    var addColor = isDarkMode ? "dark" : "light";
    var removeColor = isDarkMode ? "light" : "dark";

    var body = $('body');
    body.removeClass("bg-" + removeColor);
    body.addClass("bg-" + addColor);

    var navbar = $('#navbar');
    navbar.removeClass("bg-" + removeColor);
    navbar.removeClass("navbar-" + removeColor);

    navbar.addClass("bg-" + addColor);
    navbar.addClass("navbar-" + addColor);

    var templateTabs = $('#template-tabs');
    templateTabs.removeClass("bg-" + removeColor);
    navbar.addClass("bg-" + addColor);

    var buttons = [$('#template-save-button'), $('#convert-button'), $('#settings-save-button'), $('#copy-result-button')];
    buttons.forEach((btn) => {
        // buttons are inverted to stand out
        btn.removeClass("btn-" + addColor);
        btn.addClass("btn-" + removeColor);
    });

    var settingsModal = $('#settings-modal-content');
    settingsModal.removeClass("bg-" + removeColor);
    settingsModal.removeClass("text-" + addColor);

    settingsModal.addClass("bg-" + addColor);
    settingsModal.addClass("text-" + removeColor);

    dataEditor.setOption("theme", isDarkMode ? darkMode : lightMode);
    outputCode.setOption("theme", isDarkMode ? darkMode : lightMode);
    templateCodeEditor.setOption("theme", isDarkMode ? darkMode : lightMode);
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
        var nameLocation = getPartialTemplateNameLocation(line.text);
        if (nameLocation) {
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
                        className: "underline"
                    }));
        }
    });
}

function getPartialTemplateNameLocation(lineText) {
    var startPoint = lineText.indexOf("{{>");

    if (startPoint !== -1) {
        var nextWhitespace = lineText.indexOf(" ", startPoint);
        var handlebarEnd = lineText.indexOf("}}", startPoint);
        var endPoint = nextWhitespace < handlebarEnd && nextWhitespace !== -1 ? nextWhitespace : handlebarEnd;

        if (endPoint !== -1) {
            var templateName = lineText.substring(startPoint + 3, endPoint);
            if (isTemplateName(templateName)) {
                return {start: startPoint + 3, end: endPoint, name: templateName};
            }
        }
    }

    return null;
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
                $('#editor-main').addClass('vertical-content');

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

                dataEditor.setOption("mode", "default");
                break;
            case 'CDA':
                $('#editor-main').removeClass('vertical-content');

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

                dataEditor.setOption("mode", "text/html");
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
    dataEditor = CodeMirror.fromTextArea(document.getElementById("databox"), {
        //readOnly: false,
        lineNumbers: true,
        lineWrapping: true,
        theme: lightMode,
        mode: {name: "default"},
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
        theme: lightMode,
        mode: {name: "javascript"},
        extraKeys: {
            "Ctrl-Q": function (cm) {
                cm.foldCode(cm.getCursor());
            }
        },
        foldGutter: true,
        gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"]
    });

    let extrakeysObj = {};
    extrakeysObj["Tab"] = function (cm) {
        var spaces = Array(5).join(" ");
        cm.replaceSelection(spaces);
    };

    templateCodeEditor = CodeMirror.fromTextArea(document.getElementById("templatebox"), {
        theme: lightMode,
        lineNumbers: true,
        /*global hintExtraKeysObj*/
        extraKeys: Object.assign(extrakeysObj, hintExtraKeysObj),
        mode: "application/json",
        smartIndent: false,
        matchBrackets: true
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
        }
        convertData();
    });

    templateCodeEditor.on('dblclick', function () {
        var doc = templateCodeEditor.getDoc();
        var cursorPos = doc.getCursor();
        var lineText = doc.getLine(cursorPos.line);
        var nameLocation = getPartialTemplateNameLocation(lineText);

        if (nameLocation && cursorPos.ch >= nameLocation.start && cursorPos.ch <= nameLocation.end) {
            addTab(nameLocation.name, activeTemplate.name);
        }
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
        createNewTemplate();
    });

    $('#copy-result-button').on('click', function () {
        var text = outputCode.getValue();
        if (!navigator.clipboard || !navigator.clipboard.writeText) {
            showConversionError('Could not copy the result.');
            return;
        }
        navigator.clipboard.writeText(text).catch(function () {
            showConversionError('Could not copy the result.');
        });
    });

    $('#banner-close').on('click', function () {
        $('#banner').slideUp(transitionTime);
        clearTimeout(bannerFade);
        bannerFade = null;
    });

    $("#settings-modal").on('show.bs.modal', function () {
        var settings = getSettings();
        $('#settings-dark-mode').prop('checked', settings.darkMode);
        $('#settings-convert-while-typing').prop('checked', settings.convertWhileTyping !== false);
        $('#settings-timezone').val(settings.timezone || '');
        $('#settings-fhir-url').val(settings.fhirBaseUrl || '');
        $('#settings-fhir-auth').val(settings.fhirAuth || 'none');
        $('#settings-fhir-token').val(settings.fhirToken || '');
        $('#settings-fhir-username').val(settings.fhirUsername || '');
        $('#settings-fhir-password').val(settings.fhirPassword || '');
        showFhirAuthFields();
    });

    $('#settings-fhir-auth').on('change', showFhirAuthFields);

    $('#settings-save-button').on('click', function () {
        var settings = getSettings();
        var changesColorTheme = settings.darkMode != $('#settings-dark-mode').prop('checked');
        settings.darkMode = $('#settings-dark-mode').prop('checked');
        settings.convertWhileTyping = $('#settings-convert-while-typing').prop('checked');
        settings.timezone = $('#settings-timezone').val();
        settings.fhirBaseUrl = $('#settings-fhir-url').val().trim();
        settings.fhirAuth = $('#settings-fhir-auth').val();
        settings.fhirToken = $('#settings-fhir-token').val();
        settings.fhirUsername = $('#settings-fhir-username').val();
        settings.fhirPassword = $('#settings-fhir-password').val();
        setSettings(settings);
        if (changesColorTheme) {
            setColorTheme(settings.darkMode);
        }
    });

    $('#send-fhir-button').on('click', function () {
        sendToFhir();
    });

    $('#generate-template-button').on('click', function () {
        $('#generate-modal').modal('show');
        loadGenerateProviders();
    });

    $('#generate-provider').on('change', function () {
        loadGenerateModels();
    });

    $('#generate-run-button').on('click', function () {
        runGenerateTemplate();
    });

    changeDataType('HL7V2');
});

function createNewTemplate() {
    var raw = window.prompt('Template name');
    if (raw === null) {
        return;
    }
    var name = raw.trim();
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

function loadGenerateProviders() {
    var settings = getSettings();
    $('#generate-base-url').val(settings.aiBaseUrl || 'https://api.openai.com/v1');
    $('#generate-model').val(settings.aiModel || 'gpt-4o-mini');
    $('#generate-api-key').val(settings.aiApiKey || '');
    $.getJSON('/api/v1/ai/providers', function (data) {
        var select = $('#generate-provider');
        var available = data.available || [];
        select.empty();
        select.append($('<option>').val('custom').text('Custom'));
        available.forEach(function (item) {
            var label = item.configured ? item.name : item.name + ' (needs a key)';
            select.append($('<option>').val(item.name).text(label).data('provider', item));
        });
        if (settings.aiProvider && select.find('option[value="' + settings.aiProvider + '"]').length) {
            select.val(settings.aiProvider);
        } else if (available.length) {
            select.val(available[0].name);
        }
        applyGenerateProvider();
        if (!available.length) {
            $('#generate-empty').removeAttr('hidden');
        } else {
            $('#generate-empty').attr('hidden', true);
        }
        $('#generate-run-button').prop('disabled', false);
    });
}

function applyGenerateProvider() {
    var item = $('#generate-provider option:selected').data('provider');
    var list = $('#generate-model-list');
    list.empty();
    if (!item) {
        return;
    }
    if (item.baseUrl) {
        $('#generate-base-url').val(item.baseUrl);
    }
    (item.models || []).forEach(function (name) {
        list.append($('<option>').val(name));
    });
    if (item.models && item.models.length) {
        $('#generate-model').val(item.models[0]);
    }
}

function loadGenerateModels() {
    applyGenerateProvider();
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
    $.ajax('/api/v1/fhir/send', {
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

function runGenerateTemplate() {
    if (!window.confirm('Send the current HL7 message to the selected AI provider?')) {
        return;
    }
    var settings = getSettings();
    settings.aiProvider = $('#generate-provider').val();
    settings.aiBaseUrl = $('#generate-base-url').val().trim();
    settings.aiModel = $('#generate-model').val().trim();
    settings.aiApiKey = $('#generate-api-key').val();
    setSettings(settings);
    var payload = {
        sampleDataInline: dataEditor.getValue(),
        provider: settings.aiProvider,
        model: settings.aiModel,
        prompt: $('#generate-prompt').val(),
        confirmedExternalSend: true
    };
    if (settings.aiApiKey) {
        payload.baseUrl = settings.aiBaseUrl;
        payload.apiKey = settings.aiApiKey;
    }
    $.ajax('/api/v1/templategenerate', {
        data: JSON.stringify(payload),
        type: 'POST',
        processData: false,
        contentType: 'application/json',
        success: function (data) {
            $('#generate-modal').modal('hide');
            openLocalTemplate(nextGeneratedName(), data.generated || '', true);
            if (data.fhirResource !== undefined) {
                outputCode.setValue(JSON.stringify(data.fhirResource, null, 2));
            }
            $('#conversion-status').text('Converted');
            hideConversionError();
        },
        error: function (err) {
            var message = 'Conversion failed.';
            if (err.responseJSON && err.responseJSON.error && err.responseJSON.error.message) {
                message = err.responseJSON.error.message;
            }
            showConversionError(message);
        }
    });
}
