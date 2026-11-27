// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------
/* eslint-disable no-undef, no-unused-vars */

var DEFAULT_AI_PROMPT = [
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

var CCDA_AI_PROMPT = [
    'Return the Liquid template only. No markdown fence and no explanation.',
    'Write one FHIR R4 Bundle with "type": "batch".',
    'The message is msg, the parsed C-CDA document.',
    'An attribute is msg.ClinicalDocument.id.root. Text is msg.ClinicalDocument.title._.',
    'A tag prefix becomes an underscore, so sdtc:raceCode is msg.ClinicalDocument.recordTarget.patientRole.patient.sdtc_raceCode.',
    'A repeated element is an array, so loop over it with {% for given in msg.ClinicalDocument.recordTarget.patientRole.patient.name.given -%}.',
    'Trim tags with {%- and -%}. Leave out a JSON property when its value is empty.'
].join('\n');

var FHIR_TO_HL7V2_AI_PROMPT = [
    'Return the Liquid template only. No markdown fence and no explanation.',
    'Write one HL7 v2.5.1 ER7 pipe-delimited message starting with MSH|^~\\&|.',
    'The input FHIR R4 Bundle is msg (also exposed as fhirData / bundle).',
    'Entries live in msg.entry (each item has resource.resourceType, resource.id, and FHIR fields).',
    'Format FHIR ISO timestamps as HL7 TS (YYYYMMDDHHMMSS) and escape |, ^, ~, \\, & in free-text fields.',
    "Reuse segment partials when available: {% include 'Segment/PID' patient: patient -%}",
    'Emit one ER7 segment per line with no blank lines and trim Liquid control tags with {%- and -%}.'
].join('\n');

var defaultAiPrompt = DEFAULT_AI_PROMPT;
var ccdaAiPrompt = CCDA_AI_PROMPT;
var fhirToHl7v2AiPrompt = FHIR_TO_HL7V2_AI_PROMPT;

// A saved prompt that differs from the built-in defaults is the user's own and is used as is.
function effectiveAiPrompt(savedPrompt) {
    if (
        savedPrompt &&
        savedPrompt !== DEFAULT_AI_PROMPT &&
        savedPrompt !== CCDA_AI_PROMPT &&
        savedPrompt !== FHIR_TO_HL7V2_AI_PROMPT
    ) {
        return savedPrompt;
    }
    if (typeof currentDataType !== 'undefined' && String(currentDataType).toLowerCase() === 'fhir') {
        return FHIR_TO_HL7V2_AI_PROMPT;
    }
    return (typeof getActiveProjectFamily === 'function' && getActiveProjectFamily() === 'ccda')
        ? CCDA_AI_PROMPT
        : DEFAULT_AI_PROMPT;
}

function nextGeneratedName() {
    var name = 'generated.liquid';
    var knownNames = (typeof templateNames !== 'undefined' && Array.isArray(templateNames)) ? templateNames : [];
    var openList = (typeof openTemplates !== 'undefined' && Array.isArray(openTemplates)) ? openTemplates : [];
    var taken = function (candidate) {
        return knownNames.indexOf(candidate) !== -1 || openList.some(function (template) {
            return template.name === candidate;
        });
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
    if (typeof $ === 'undefined' || typeof $.getJSON !== 'function') {
        if (typeof done === 'function') {
            done();
        }
        return;
    }
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
        setGuidanceText(effectiveAiPrompt(settings.aiPrompt));
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
    var prompt = (guidanceText() || '').trim();

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

function runGenerateTemplate() {
    var srcMessage = (typeof dataEditor !== 'undefined' && dataEditor) ? dataEditor.getValue() : '';
    var isReverse = typeof currentDataType !== 'undefined' && String(currentDataType).toLowerCase() === 'fhir';
    if (!srcMessage || !srcMessage.trim()) {
        showConversionError(isReverse
            ? 'Load or paste a FHIR Bundle JSON before generating a template.'
            : 'Load or paste an HL7 v2 message before generating a template.');
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
            var keyMessage = 'Generate needs an API key for ' + displayLabel + '. Add it under Settings, Generate, then try again.';
            if (provider === 'custom' && !customUrl) {
                keyMessage = 'Generate needs a base URL and an API key for ' + displayLabel + '. Add them under Settings, Generate, then try again.';
            }
            $('#generate-key-message').text(keyMessage);
            $('#generate-key-modal').modal('show');
            return;
        }

        var payload = {
            sampleDataInline: srcMessage,
            dataType: isReverse ? 'fhir' : 'hl7v2',
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
        $btn.prop('disabled', true).attr('aria-busy', 'true');
        $('#conversion-status').text('Generating template…');
        hideConversionError();

        $.ajax('/api/v1/templategenerate', {
            data: JSON.stringify(payload),
            type: 'POST',
            processData: false,
            contentType: 'application/json',
            success: function (data) {
                $btn.prop('disabled', false).attr('aria-busy', 'false');
                openLocalTemplate(nextGeneratedName(), data.generated || '', true);
                if (typeof data.hl7v2Message === 'string') {
                    outputCode.setValue(data.hl7v2Message.replace(/\r\n|\r/g, '\n'));
                    $('#conversion-status').text(conversionStatusLabel(data));
                } else if (data.fhirResource !== undefined) {
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
                $btn.prop('disabled', false).attr('aria-busy', 'false');
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

var _aiGlobal = typeof globalThis !== 'undefined' ? globalThis : window;
_aiGlobal.DEFAULT_AI_PROMPT = DEFAULT_AI_PROMPT;
_aiGlobal.CCDA_AI_PROMPT = CCDA_AI_PROMPT;
_aiGlobal.FHIR_TO_HL7V2_AI_PROMPT = FHIR_TO_HL7V2_AI_PROMPT;
_aiGlobal.defaultAiPrompt = defaultAiPrompt;
_aiGlobal.ccdaAiPrompt = ccdaAiPrompt;
_aiGlobal.fhirToHl7v2AiPrompt = fhirToHl7v2AiPrompt;
_aiGlobal.effectiveAiPrompt = effectiveAiPrompt;
_aiGlobal.nextGeneratedName = nextGeneratedName;
_aiGlobal.AI_PROVIDER_LABELS = AI_PROVIDER_LABELS;
_aiGlobal.loadAiProviderCatalog = loadAiProviderCatalog;
_aiGlobal.providerNeedsCustomUrl = providerNeedsCustomUrl;
_aiGlobal.stashCurrentAiModalInputs = stashCurrentAiModalInputs;
_aiGlobal.syncAiProviderFields = syncAiProviderFields;
_aiGlobal.populateAiSettingsModal = populateAiSettingsModal;
_aiGlobal.saveAiFieldsFromModal = saveAiFieldsFromModal;
_aiGlobal.runGenerateTemplate = runGenerateTemplate;

if (typeof $ === 'function' && typeof document !== 'undefined') {
    $(document).ready(function () {
        $('#settings-ai-provider').on('change', function () {
            stashCurrentAiModalInputs();
            syncAiProviderFields($('#settings-ai-provider').val());
        });

        $('#generate-template-button').on('click', function () {
            runGenerateTemplate();
        });

        loadAiProviderCatalog();
    });
}
