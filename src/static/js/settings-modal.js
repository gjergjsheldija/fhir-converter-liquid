// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------
/* eslint-disable no-undef, no-unused-vars */

var SETTINGS_STORAGE_KEY = 'fhirConverterSettings';

var DEFAULT_EDITOR_SETTINGS = {
    darkMode: false,
    convertWhileTyping: true,
    timezone: '',
    convertApiKey: '',
    fhirBaseUrl: '',
    fhirAuth: 'none',
    fhirToken: '',
    fhirUsername: '',
    fhirPassword: '',
    fhirConditional: false,
    fhirUpdate: false,
    fhirProfile: '',
    hl7GwUrl: '',
    hl7GwFormat: 'json_envelope',
    hl7GwAuth: 'none',
    hl7GwToken: '',
    hl7GwUsername: '',
    hl7GwPassword: '',
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

function createDefaultEditorSettings() {
    return Object.assign({}, DEFAULT_EDITOR_SETTINGS, {
        aiApiKeys: {},
        aiModels: {},
        aiBaseUrls: {}
    });
}

var currentEditorSettings = createDefaultEditorSettings();

try {
    if (typeof localStorage !== 'undefined') {
        currentEditorSettings = Object.assign(
            currentEditorSettings,
            JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}')
        );
    }
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

var _settingsGlobal = typeof globalThis !== 'undefined' ? globalThis : window;

function getSettings() {
    return currentEditorSettings;
}

function setSettings(settings) {
    currentEditorSettings = settings;
    _settingsGlobal.currentEditorSettings = currentEditorSettings;
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
        }
    } catch (ex) {
        return;
    } finally {
        if (typeof updateValidateButton === 'function') {
            updateValidateButton();
        }
    }
}

function applyConvertApiKeyPrefilter(options) {
    var url = options && typeof options.url === 'string' ? options.url : '';
    if (url.indexOf('/api/') !== 0) {
        return;
    }
    var settings = getSettings();
    if (!settings || !settings.convertApiKey) {
        return;
    }
    var existingHeaders = options.headers || {};
    if (existingHeaders.Authorization || existingHeaders.authorization) {
        return;
    }
    options.headers = Object.assign({}, existingHeaders, {
        Authorization: 'Bearer ' + settings.convertApiKey
    });
}

if (typeof $ !== 'undefined' && typeof $.ajaxPrefilter === 'function') {
    $.ajaxPrefilter(applyConvertApiKeyPrefilter);
}

var themePreference = (typeof window !== 'undefined' && window.matchMedia)
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

function resolveStoredTheme() {
    try {
        var raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SETTINGS_STORAGE_KEY) : null;
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
    if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.dataset.theme = choice;
    }
}

function applyPalette(name) {
    if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.dataset.palette = name === 'slate' || name === 'grove' ? name : 'paper';
    }
}

var currentThemeChoice = resolveStoredTheme();
if (themePreference && typeof themePreference.addEventListener === 'function') {
    themePreference.addEventListener('change', function () {
        if (currentThemeChoice === 'system') {
            applyTheme('system');
        }
    });
}

var guidanceEditor = null;

function ensureGuidanceEditor() {
    if (guidanceEditor || typeof CodeMirror === 'undefined' || typeof document === 'undefined') {
        return;
    }
    var field = document.getElementById('settings-ai-prompt');
    if (!field) {
        return;
    }
    guidanceEditor = CodeMirror.fromTextArea(field, {
        mode: 'markdown',
        theme: 'fhir',
        lineWrapping: true,
        lineNumbers: false
    });
    guidanceEditor.setSize(null, 220);
}

function guidanceText() {
    if (guidanceEditor) {
        return guidanceEditor.getValue();
    }
    return $('#settings-ai-prompt').val() || '';
}

function setGuidanceText(text) {
    var value = text || '';
    if (guidanceEditor) {
        if (guidanceEditor.getValue() !== value) {
            guidanceEditor.setValue(value);
        }
        return;
    }
    $('#settings-ai-prompt').val(value);
}

function showSettingsTab(name) {
    $('#settings-modal [role="tab"]').each(function () {
        var on = $(this).attr('data-settings-tab') === name;
        $(this).toggleClass('is-active', on).attr('aria-selected', on ? 'true' : 'false');
    });
    $('#settings-modal [role="tabpanel"]').each(function () {
        $(this).prop('hidden', $(this).attr('data-settings-tab') !== name);
    });
    if (name === 'ai') {
        ensureGuidanceEditor();
        if (guidanceEditor) {
            setTimeout(function () {
                guidanceEditor.refresh();
            }, 0);
        }
    }
}

function showFhirAuthFields() {
    var auth = $('#settings-fhir-auth').val();
    $('#settings-fhir-token-row').toggle(auth === 'bearer');
    $('#settings-fhir-user-row').toggle(auth === 'basic');
    $('#settings-fhir-password-row').toggle(auth === 'basic');
}

function showHl7GwAuthFields() {
    var auth = $('#settings-hl7gw-auth').val();
    $('#settings-hl7gw-token-row').toggle(auth === 'bearer');
    $('#settings-hl7gw-user-row').toggle(auth === 'basic');
    $('#settings-hl7gw-password-row').toggle(auth === 'basic');
}

_settingsGlobal.SETTINGS_STORAGE_KEY = SETTINGS_STORAGE_KEY;
_settingsGlobal.DEFAULT_EDITOR_SETTINGS = DEFAULT_EDITOR_SETTINGS;
_settingsGlobal.currentEditorSettings = currentEditorSettings;
_settingsGlobal.getSettings = getSettings;
_settingsGlobal.setSettings = setSettings;
_settingsGlobal.applyConvertApiKeyPrefilter = applyConvertApiKeyPrefilter;
_settingsGlobal.resolveStoredTheme = resolveStoredTheme;
_settingsGlobal.resolveStoredPalette = resolveStoredPalette;
_settingsGlobal.applyTheme = applyTheme;
_settingsGlobal.applyPalette = applyPalette;
_settingsGlobal.ensureGuidanceEditor = ensureGuidanceEditor;
_settingsGlobal.guidanceText = guidanceText;
_settingsGlobal.setGuidanceText = setGuidanceText;
_settingsGlobal.showSettingsTab = showSettingsTab;
_settingsGlobal.showFhirAuthFields = showFhirAuthFields;
_settingsGlobal.showHl7GwAuthFields = showHl7GwAuthFields;

if (typeof $ === 'function' && typeof document !== 'undefined') {
    $(document).ready(function () {
        applyTheme(currentThemeChoice);
        applyPalette(resolveStoredPalette());

        $('#settings-modal [role="tab"]').on('click', function () {
            showSettingsTab($(this).attr('data-settings-tab'));
        });

        $('#settings-modal').on('show.bs.modal', function () {
            var settings = getSettings();
            var themeChoice = resolveStoredTheme();
            $('input[name="settings-theme"][value="' + themeChoice + '"]').prop('checked', true);
            $('input[name="settings-palette"][value="' + resolveStoredPalette() + '"]').prop('checked', true);
            $('#settings-convert-while-typing').prop('checked', settings.convertWhileTyping !== false);
            $('#settings-timezone').val(settings.timezone || '');
            $('#settings-convert-api-key').val(settings.convertApiKey || '');
            $('#settings-fhir-url').val(settings.fhirBaseUrl || '');
            $('#settings-fhir-auth').val(settings.fhirAuth || 'none');
            $('#settings-fhir-token').val(settings.fhirToken || '');
            $('#settings-fhir-username').val(settings.fhirUsername || '');
            $('#settings-fhir-password').val(settings.fhirPassword || '');
            var updateOn = settings.fhirUpdate === true;
            $('#settings-fhir-conditional').prop('checked', settings.fhirConditional === true && !updateOn);
            $('#settings-fhir-update').prop('checked', updateOn);
            $('#settings-fhir-profile').val(settings.fhirProfile || '');
            showFhirAuthFields();
            $('#settings-hl7gw-url').val(settings.hl7GwUrl || '');
            $('#settings-hl7gw-format').val(settings.hl7GwFormat || 'json_envelope');
            $('#settings-hl7gw-auth').val(settings.hl7GwAuth || 'none');
            $('#settings-hl7gw-token').val(settings.hl7GwToken || '');
            $('#settings-hl7gw-username').val(settings.hl7GwUsername || '');
            $('#settings-hl7gw-password').val(settings.hl7GwPassword || '');
            showHl7GwAuthFields();
            if (typeof populateAiSettingsModal === 'function') {
                populateAiSettingsModal();
            }
        });

        $('#settings-modal').on('shown.bs.modal', function () {
            if (!$('#settings-panel-ai').prop('hidden')) {
                ensureGuidanceEditor();
                if (guidanceEditor) {
                    guidanceEditor.refresh();
                }
            }
        });

        $('#settings-modal').on('hidden.bs.modal', function () {
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
        $('#settings-hl7gw-auth').on('change', showHl7GwAuthFields);
        $('#settings-fhir-conditional').on('change', function () {
            if (this.checked) {
                $('#settings-fhir-update').prop('checked', false);
            }
        });
        $('#settings-fhir-update').on('change', function () {
            if (this.checked) {
                $('#settings-fhir-conditional').prop('checked', false);
            }
        });

        $('#settings-save-button').on('click', function () {
            var settings = getSettings();
            settings.theme = $('input[name="settings-theme"]:checked').val() || settings.theme || 'light';
            settings.palette = $('input[name="settings-palette"]:checked').val() || settings.palette || 'paper';
            settings.convertWhileTyping = $('#settings-convert-while-typing').prop('checked');
            settings.timezone = $('#settings-timezone').val();
            settings.convertApiKey = $('#settings-convert-api-key').val().trim();
            settings.fhirBaseUrl = $('#settings-fhir-url').val().trim();
            settings.fhirAuth = $('#settings-fhir-auth').val();
            settings.fhirToken = $('#settings-fhir-token').val();
            settings.fhirUsername = $('#settings-fhir-username').val();
            settings.fhirPassword = $('#settings-fhir-password').val();
            settings.fhirConditional = $('#settings-fhir-conditional').prop('checked');
            settings.fhirUpdate = $('#settings-fhir-update').prop('checked');
            settings.fhirProfile = $('#settings-fhir-profile').val().trim();
            settings.hl7GwUrl = ($('#settings-hl7gw-url').val() || '').trim();
            settings.hl7GwFormat = $('#settings-hl7gw-format').val() || 'json_envelope';
            settings.hl7GwAuth = $('#settings-hl7gw-auth').val() || 'none';
            settings.hl7GwToken = $('#settings-hl7gw-token').val() || '';
            settings.hl7GwUsername = $('#settings-hl7gw-username').val() || '';
            settings.hl7GwPassword = $('#settings-hl7gw-password').val() || '';
            if (typeof saveAiFieldsFromModal === 'function') {
                saveAiFieldsFromModal(settings);
            }
            setSettings(settings);
            if (typeof updateValidateButton === 'function') {
                updateValidateButton();
            }
            if (typeof syncSessionChrome === 'function') {
                syncSessionChrome();
            }
        });
    });
}
