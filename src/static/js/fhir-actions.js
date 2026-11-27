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

function isReverseHl7Mode() {
    return typeof currentDataType !== 'undefined' && String(currentDataType).toLowerCase() === 'fhir';
}

function updateValidateButton() {
    if (typeof $ !== 'function') {
        return;
    }
    var settings = typeof getSettings === 'function' ? getSettings() : null;
    var reverseMode = isReverseHl7Mode();
    var hasHl7GwUrl = Boolean(settings && settings.hl7GwUrl);
    $('#send-hl7v2-button').prop('hidden', !(reverseMode && hasHl7GwUrl));
    var button = $('#validate-fhir-button');
    if (!button.length) {
        return;
    }
    if (reverseMode) {
        button.prop('disabled', true);
        button.prop('hidden', true);
        $('#send-fhir-button').prop('hidden', true);
        return;
    }
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

function buildHl7GatewayPayload(settings, rawMessage) {
    var cfg = settings || {};
    var normalizedEr7 = typeof rawMessage === 'string' ? rawMessage.replace(/\r\n|\n/g, '\r') : '';
    return {
        gatewayUrl: cfg.hl7GwUrl || '',
        hl7v2Message: normalizedEr7,
        format: cfg.hl7GwFormat || 'json_envelope',
        auth: cfg.hl7GwAuth || 'none',
        token: cfg.hl7GwToken || '',
        username: cfg.hl7GwUsername || '',
        password: cfg.hl7GwPassword || ''
    };
}

function extractAckCode(data) {
    if (!data || typeof data !== 'object') {
        return '';
    }
    if (typeof data.ackCode === 'string' && data.ackCode.trim()) {
        return data.ackCode.trim().toUpperCase();
    }
    if (data.ack && typeof data.ack === 'object') {
        var nested = data.ack.ackCode || data.ack.code || '';
        if (typeof nested === 'string' && nested.trim()) {
            return nested.trim().toUpperCase();
        }
    }
    var rawAck = typeof data.ack === 'string'
        ? data.ack
        : (typeof data.rawAck === 'string' ? data.rawAck : (typeof data.body === 'string' ? data.body : ''));
    if (rawAck) {
        if (/^(AA|AE|AR|CA|CE|CR)$/i.test(rawAck.trim())) {
            return rawAck.trim().toUpperCase();
        }
        var msaMatch = /(?:^|\r|\n)MSA\|([A-Z]{2})(?:\||$|\r|\n)/.exec(rawAck);
        if (msaMatch) {
            return msaMatch[1];
        }
    }
    return '';
}

function displayGatewayError(message) {
    if (typeof showResultError === 'function') {
        showResultError(message);
    } else {
        $('#result-error').text(message).removeAttr('hidden');
    }
}

function clearGatewayError() {
    if (typeof hideResultError === 'function') {
        hideResultError();
    } else {
        $('#result-error').text('').attr('hidden', true);
    }
}

function sendToHl7Gateway() {
    var settings = getSettings();
    if (!settings || !settings.hl7GwUrl) {
        displayGatewayError('Set an HL7v2 gateway URL in Settings.');
        return;
    }
    var rawText = (typeof outputCode !== 'undefined' && outputCode) ? outputCode.getValue() : '';
    if (!rawText || !rawText.trim()) {
        displayGatewayError('Convert a FHIR Bundle to HL7v2 before sending.');
        return;
    }
    clearGatewayError();
    if (typeof hideConversionError === 'function') {
        hideConversionError();
    }
    $('#conversion-status').text('Sending…');
    var sendBody = buildHl7GatewayPayload(settings, rawText);
    $.ajax('/api/v1/hl7v2/send', {
        data: JSON.stringify(sendBody),
        type: 'POST',
        processData: false,
        contentType: 'application/json',
        success: function (data) {
            var ackCode = extractAckCode(data);
            var statusLabel = ackCode ? ('Sent · ACK ' + ackCode) : 'Sent';
            $('#conversion-status').text(statusLabel);
            var ackErrorMsg = (data && data.ackMessage) || (data && data.ack && typeof data.ack === 'object' && data.ack.message) || '';
            if ((ackCode === 'AE' || ackCode === 'AR' || ackCode === 'CE' || ackCode === 'CR') && ackErrorMsg) {
                displayGatewayError(ackErrorMsg);
            } else {
                clearGatewayError();
            }
        },
        error: function (err) {
            var errJson = (err && err.responseJSON) || null;
            if (!errJson && err && typeof err.responseText === 'string') {
                try {
                    errJson = JSON.parse(err.responseText);
                } catch (ex) {
                    errJson = null;
                }
            }
            var ackCode = extractAckCode(errJson || (errJson && errJson.detail));
            $('#conversion-status').text(ackCode ? ('Failed · ACK ' + ackCode) : 'Failed');
            var message = 'HL7v2 gateway request failed.';
            if (errJson && errJson.error && errJson.error.message) {
                message = errJson.error.message;
            }
            displayGatewayError(message);
        }
    });
}

var _fhirGlobal = typeof globalThis !== 'undefined' ? globalThis : window;
_fhirGlobal.isReverseHl7Mode = isReverseHl7Mode;
_fhirGlobal.parseResultResource = parseResultResource;
_fhirGlobal.updateValidateButton = updateValidateButton;
_fhirGlobal.validateFhir = validateFhir;
_fhirGlobal.sendToFhir = sendToFhir;
_fhirGlobal.buildHl7GatewayPayload = buildHl7GatewayPayload;
_fhirGlobal.extractAckCode = extractAckCode;
_fhirGlobal.sendToHl7Gateway = sendToHl7Gateway;

if (typeof $ === 'function' && typeof document !== 'undefined') {
    $(document).ready(function () {
        $('#send-fhir-button').on('click', function () {
            sendToFhir();
        });

        $('#send-hl7v2-button').on('click', function () {
            sendToHl7Gateway();
        });

        $('#validate-fhir-button').on('click', function () {
            validateFhir();
        });

        updateValidateButton();
    });
}
