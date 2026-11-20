// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------
/* eslint-disable no-undef, no-unused-vars */

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
    var parts = String(typeEvent || 'ADT^A04').split('^');
    var type = parts[0] || 'ADT';
    var event = parts[1] || 'A04';
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
    var typeEvent = sampleEventTypeFromTemplate(typeof activeTemplate !== 'undefined' && activeTemplate && activeTemplate.name);
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
                pending -= 1;
                if (pending === 0 && errors.length) {
                    showConversionError(errors.join(' '));
                }
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
                            loadData(saved[0], function (loadedText) {
                                highlightMatchingTemplate(loadedText);
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
        $('#sample-menu').prop('open', false);
        hideConversionError();
        selectedSample = messageName;
        $('#message-name').text(name);
        syncSessionChrome();
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

var _sampleGlobal = typeof globalThis !== 'undefined' ? globalThis : window;
_sampleGlobal.SAMPLE_FILE_EXTENSIONS = SAMPLE_FILE_EXTENSIONS;
_sampleGlobal.BUILTIN_SAMPLE_CONFLICT = BUILTIN_SAMPLE_CONFLICT;
_sampleGlobal.isSupportedSampleFile = isSupportedSampleFile;
_sampleGlobal.sanitizeSampleFileName = sanitizeSampleFileName;
_sampleGlobal.sampleEventTypeFromTemplate = sampleEventTypeFromTemplate;
_sampleGlobal.buildSyntheticSampleMessage = buildSyntheticSampleMessage;
_sampleGlobal.createNewSample = createNewSample;
_sampleGlobal.readTextFile = readTextFile;
_sampleGlobal.sampleAjaxError = sampleAjaxError;
_sampleGlobal.putSampleFile = putSampleFile;
_sampleGlobal.nextSampleFileName = nextSampleFileName;
_sampleGlobal.finishImportedSample = finishImportedSample;
_sampleGlobal.importSingleSample = importSingleSample;
_sampleGlobal.importMultipleSamples = importMultipleSamples;
_sampleGlobal.handleImportedSamples = handleImportedSamples;
_sampleGlobal.defaultSampleFileName = defaultSampleFileName;
_sampleGlobal.openSaveSampleForm = openSaveSampleForm;
_sampleGlobal.closeSaveSampleForm = closeSaveSampleForm;
_sampleGlobal.cancelSaveSampleForm = cancelSaveSampleForm;
_sampleGlobal.saveCurrentSample = saveCurrentSample;
_sampleGlobal.setupSampleDropZone = setupSampleDropZone;

if (typeof $ === 'function' && typeof document !== 'undefined') {
    $(document).ready(function () {
        $(document).on('keydown', function (event) {
            if (event.key === 'Escape' && $('#sample-menu').prop('open')) {
                cancelSaveSampleForm();
                $('#sample-menu').prop('open', false);
            }
        });

        $(document).on('mousedown', function (event) {
            if ($('#sample-menu').prop('open') && !$(event.target).closest('#sample-menu').length) {
                cancelSaveSampleForm();
                $('#sample-menu').prop('open', false);
            }
        });

        $('#new-sample-button').on('click', function () {
            createNewSample();
            $('#sample-menu').prop('open', false);
        });

        $('#import-sample-button').on('click', function () {
            $('#sample-menu').prop('open', false);
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
    });
}
