// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------
/* eslint-disable no-undef, no-unused-vars */

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
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.resourceType ? parsed : null;
    } catch (ex) {
        return null;
    }
}

function updateValidateButton() {
    if (typeof $ !== 'function') {
        return;
    }
    var button = $('#validate-fhir-button');
    if (!button.length) {
        return;
    }
    var settings = typeof getSettings === 'function' ? getSettings() : null;
    var hasUrl = Boolean(settings && settings.fhirBaseUrl);
    var enabled = hasUrl && parseResultResource() !== null;
    button.prop('disabled', !enabled);
    button.prop('hidden', !hasUrl);
    $('#send-fhir-button').prop('hidden', !hasUrl);
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
    var validateBody = {
        baseUrl: settings.fhirBaseUrl,
        resource: resource,
        auth: settings.fhirAuth,
        token: settings.fhirToken,
        username: settings.fhirUsername,
        password: settings.fhirPassword
    };
    if (typeof settings.fhirProfile === 'string' && settings.fhirProfile.trim() !== '') {
        validateBody.profile = settings.fhirProfile.trim();
    }
    $.ajax('/api/v1/fhir/validate', {
        data: JSON.stringify(validateBody),
        type: 'POST',
        processData: false,
        contentType: 'application/json',
        success: function (data) {
            $('#conversion-status').text('Validated');
            if (typeof window !== 'undefined' && typeof window.showValidationResult === 'function') {
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
            if (typeof window !== 'undefined' && typeof window.showValidationResult === 'function') {
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
    if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm('Send the current FHIR result to ' + settings.fhirBaseUrl + '?')) {
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
    if (settings.fhirUpdate === true) {
        sendBody.update = true;
    } else if (settings.fhirConditional === true) {
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

var _fhirGlobal = typeof globalThis !== 'undefined' ? globalThis : window;
_fhirGlobal.parseResultResource = parseResultResource;
_fhirGlobal.updateValidateButton = updateValidateButton;
_fhirGlobal.validateFhir = validateFhir;
_fhirGlobal.sendToFhir = sendToFhir;

if (typeof $ === 'function' && typeof document !== 'undefined') {
    $(document).ready(function () {
        $('#send-fhir-button').on('click', function () {
            sendToFhir();
        });

        $('#validate-fhir-button').on('click', function () {
            validateFhir();
        });

        updateValidateButton();
    });
}
