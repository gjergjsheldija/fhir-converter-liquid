// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------
/* eslint-disable no-undef, no-unused-vars */

/**
 * Frontend project management (Specs 07–11 under specs/web-ui/projects/).
 *
 * Manages localStorage key `fhirConverterProject`, New project & Open project
 * modals, active family switching, project file listing/reading/writing, and
 * copying the 139 official HL7 v2 fixture samples into a local project.
 */
(function () {
    'use strict';

    var PROJECT_STORAGE_KEY = 'fhirConverterProject';
    var activeProject = null;
    var activeProjectFamily = 'hl7v2';
    var openedStartupForIdentity = null;
    var pendingConfirmRequest = null;

    function readStoredProject() {
        try {
            var raw = localStorage.getItem(PROJECT_STORAGE_KEY);
            if (!raw) {
                return null;
            }
            var parsed = JSON.parse(raw);
            if (parsed && (parsed.kind === 'local' || parsed.kind === 'github')) {
                return parsed;
            }
        } catch (ex) {
            return null;
        }
        return null;
    }

    function persistProject(proj) {
        activeProject = proj || null;
        try {
            if (activeProject) {
                localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(activeProject));
            } else {
                localStorage.removeItem(PROJECT_STORAGE_KEY);
            }
        } catch (ex) {
            // Storage unavailable; keep in-memory state.
        }
    }

    function familyDisplayName(fam) {
        return fam === 'ccda' ? 'C-CDA' : 'HL7 v2';
    }

    function formatProjectHeaderLabel(proj) {
        if (!proj) {
            return 'Built-in';
        }
        var m = proj.manifest;
        var name = (m && m.name) || (proj.kind === 'github' ? proj.repo : (proj.path || 'Project').split('/').pop());
        var fams = (m && Array.isArray(m.families) && m.families.length)
            ? m.families.map(familyDisplayName).join(', ')
            : familyDisplayName(activeProjectFamily);
        return name + ' · ' + fams;
    }

    function projectIdentity(proj) {
        if (!proj) {
            return '';
        }
        if (proj.kind === 'local') {
            return 'local:' + proj.path + ':' + activeProjectFamily;
        }
        return 'github:' + proj.repo + '@' + (proj.ref || '') + ':' + activeProjectFamily;
    }

    function updateProjectChrome() {
        var hasProj = Boolean(activeProject);
        $('#project-label').text(formatProjectHeaderLabel(activeProject));
        $('#project-label').attr('title', formatProjectHeaderLabel(activeProject));
        $('#project-use-builtin').prop('hidden', !hasProj);

        $('#source-switch').prop('hidden', hasProj);
        if (hasProj) {
            $('#source-github').prop('hidden', true);
            $('#source-folder').prop('hidden', true);
            $('#external-browser').prop('hidden', true);
            $('#builtin-lists').prop('hidden', false);
        }

        var manifest = activeProject && activeProject.manifest;
        var families = (manifest && Array.isArray(manifest.families)) ? manifest.families : [];
        var showFamilySelect = hasProj && families.length > 1;
        var showOfficialBtn = hasProj && activeProject.kind === 'local' && families.indexOf('hl7v2') !== -1;

        $('#project-family').prop('hidden', !showFamilySelect);
        if (showFamilySelect) {
            $('#project-family').val(activeProjectFamily);
        }
        $('#project-add-samples').prop('hidden', !showOfficialBtn);
        $('#project-controls').prop('hidden', !(showFamilySelect || showOfficialBtn));
    }

    function getActiveProject() {
        return activeProject;
    }

    function getActiveProjectFamily() {
        return activeProject ? activeProjectFamily : 'hl7v2';
    }

    function getActiveProjectRoots() {
        if (!activeProject || !activeProject.manifest || !activeProject.manifest.roots) {
            return null;
        }
        return activeProject.manifest.roots[activeProjectFamily] || null;
    }

    function fetchProjectFileText(relativePath, onSuccess, onError) {
        if (!activeProject) {
            if (typeof onError === 'function') {
                onError('No project is open.');
            }
            return;
        }
        $.ajax('/api/v1/projects/file', {
            type: 'POST',
            contentType: 'application/json',
            processData: false,
            dataType: 'text',
            data: JSON.stringify({
                project: activeProject,
                path: relativePath
            }),
            success: function (text) {
                if (typeof onSuccess === 'function') {
                    onSuccess(typeof text === 'string' ? text : String(text));
                }
            },
            error: function (xhr) {
                var msg = 'Could not read project file.';
                try {
                    var parsed = JSON.parse(xhr.responseText || '{}');
                    if (parsed.error && parsed.error.message) {
                        msg = parsed.error.message;
                    }
                } catch (ex) {
                    // keep default
                }
                if (typeof onError === 'function') {
                    onError(msg);
                } else if (typeof showConversionError === 'function') {
                    showConversionError(msg);
                }
            }
        });
    }

    function saveProjectFile(relativePath, targetKind, content, callback) {
        if (!activeProject) {
            callback({status: 400, message: 'No project is open.'});
            return;
        }
        if (activeProject.kind === 'github') {
            callback({
                status: 400,
                message: 'This GitHub project is open for reading. Save is available for a folder on this server.'
            });
            return;
        }
        $.ajax('/api/v1/projects/file', {
            type: 'PUT',
            contentType: 'text/plain',
            processData: false,
            dataType: 'json',
            headers: {
                'X-Project-Path': activeProject.path,
                'X-Project-File': relativePath,
                'X-Project-Target': targetKind || 'template'
            },
            data: content,
            success: function (res) {
                callback(null, res);
            },
            error: function (xhr) {
                var body = (xhr && xhr.responseJSON) || {};
                var msg = (body.error && body.error.message) ? body.error.message : 'Unable to save file to project.';
                callback({status: xhr ? xhr.status : 400, message: msg});
            }
        });
    }

    function applyCcdaNoConvertState() {
        if (typeof outputCode !== 'undefined' && outputCode) {
            outputCode.setValue('');
        }
        if (typeof hideResultError === 'function') {
            hideResultError();
        }
        if (typeof setUnusedLegend === 'function') {
            setUnusedLegend(false);
        }
        if (typeof clearLatestDebugInfo === 'function') {
            clearLatestDebugInfo();
        }
        $('#conversion-status').text('C-CDA conversion is not available yet.');
        if (typeof refreshEditors === 'function') {
            refreshEditors();
        }
    }

    function stripRootPrefix(relPath, rootPrefix) {
        var prefix = rootPrefix + '/';
        return relPath.indexOf(prefix) === 0 ? relPath.substring(prefix.length) : relPath;
    }

    function openProjectTemplateClean(shortName, fullRelPath, text) {
        openLocalTemplate(shortName, text, false);
        var entry = openTemplates.find(function (t) {
            return t.name === shortName;
        });
        if (entry) {
            entry.projectPath = fullRelPath;
        }
    }

    function loadStartupPairForProject(filesPayload) {
        var manifest = filesPayload.manifest;
        var fam = filesPayload.family;
        var roots = manifest.roots[fam];
        var startupSampleRel = null;
        var startupTplRel = null;

        if (manifest.startup && manifest.startup.family === fam) {
            if (manifest.startup.sample && !/\/\.gitkeep$/.test(manifest.startup.sample)) {
                startupSampleRel = manifest.startup.sample;
            }
            startupTplRel = manifest.startup.template;
        } else {
            startupSampleRel = (filesPayload.samples && filesPayload.samples[0]) || null;
            startupTplRel = (filesPayload.templates && filesPayload.templates[0]) || null;
        }

        if (typeof dataEditor !== 'undefined' && dataEditor) {
            dataEditor.setOption('mode', fam === 'ccda' ? 'xml' : 'hl7v2');
        }

        var sampleDone = !startupSampleRel;
        var tplDone = !startupTplRel;

        function maybeFinishStartup() {
            if (!sampleDone || !tplDone) {
                return;
            }
            if (fam === 'ccda') {
                applyCcdaNoConvertState();
            } else if (startupSampleRel) {
                convertData(true);
            }
        }

        if (startupSampleRel) {
            var shortSample = stripRootPrefix(startupSampleRel, roots.samples);
            selectedSample = startupSampleRel;
            fetchProjectFileText(startupSampleRel, function (sampleText) {
                dataEditor.setValue(sampleText);
                $('#message-name').text(shortSample);
                sampleDone = true;
                renderFileBrowser(cachedSamples);
                maybeFinishStartup();
            }, function () {
                sampleDone = true;
                maybeFinishStartup();
            });
        } else {
            dataEditor.setValue('');
            $('#message-name').text('No sample');
        }

        if (startupTplRel) {
            var shortTpl = stripRootPrefix(startupTplRel, roots.templates);
            selectedTemplate = shortTpl;
            fetchProjectFileText(startupTplRel, function (tplText) {
                closeAllTemplates();
                openProjectTemplateClean(shortTpl, startupTplRel, tplText);
                tplDone = true;
                renderFileBrowser(cachedSamples);
                maybeFinishStartup();
            }, function () {
                tplDone = true;
                maybeFinishStartup();
            });
        }
    }

    function refreshProjectFileBrowser(options) {
        var opts = options || {};
        if (!activeProject) {
            updateProjectChrome();
            return;
        }
        var reqPayload = Object.assign({}, activeProject, {family: activeProjectFamily});
        $.ajax('/api/v1/projects/files', {
            type: 'POST',
            contentType: 'application/json',
            processData: false,
            dataType: 'json',
            data: JSON.stringify(reqPayload),
            success: function (res) {
                activeProject.manifest = res.manifest;
                activeProjectFamily = res.family;
                persistProject(activeProject);
                updateProjectChrome();

                var roots = res.manifest.roots[res.family];
                window.templateNames = (res.templates || []).map(function (rel) {
                    return stripRootPrefix(rel, roots.templates);
                });
                cachedSamples = (res.samples || []).map(function (rel) {
                    return {
                        messageName: rel,
                        label: stripRootPrefix(rel, roots.samples),
                        projectSample: true,
                        source: 'project'
                    };
                });
                renderFileBrowser(cachedSamples);

                var idKey = projectIdentity(activeProject);
                if (opts.forceStartup || (opts.openStartup && openedStartupForIdentity !== idKey)) {
                    openedStartupForIdentity = idKey;
                    loadStartupPairForProject(res);
                }
            },
            error: function (xhr) {
                var body = (xhr && xhr.responseJSON) || {};
                var msg = (body.error && body.error.message) ? body.error.message : 'Could not load project files.';
                showConversionError(msg);
                updateProjectChrome();
            }
        });
    }

    function activateOpenedProject(proj) {
        var startupFam = (proj.manifest && proj.manifest.startup && proj.manifest.startup.family) || 'hl7v2';
        activeProjectFamily = startupFam;
        persistProject(proj);
        openedStartupForIdentity = null;
        selectedSample = null;
        selectedTemplate = null;
        suggestedTemplate = null;
        hideConversionError();
        updateProjectChrome();
        refreshProjectFileBrowser({forceStartup: true});
    }

    function switchToBuiltinMode() {
        if (!closeAllTemplates(true)) {
            return;
        }
        persistProject(null);
        activeProjectFamily = 'hl7v2';
        openedStartupForIdentity = null;
        selectedSample = null;
        selectedTemplate = null;
        suggestedTemplate = null;
        didOpenStartupExample = false;
        if (typeof dataEditor !== 'undefined' && dataEditor) {
            dataEditor.setValue('');
            dataEditor.setOption('mode', 'hl7v2');
        }
        if (typeof outputCode !== 'undefined' && outputCode) {
            outputCode.setValue('');
        }
        $('#conversion-status').text('');
        hideConversionError();
        updateProjectChrome();
        refreshFileBrowser();
    }

    // --- Modal helpers ----------------------------------------------------------------

    function syncNewProjectModalControls() {
        var fam = $('input[name="new-project-family"]:checked').val() || 'hl7v2';
        var baselineRadio = $('#new-project-start-baseline');
        var emptyRadio = $('#new-project-start-empty');
        if (fam === 'ccda') {
            baselineRadio.prop('checked', false).prop('disabled', true);
            emptyRadio.prop('checked', true);
            $('#new-project-baseline-help').text('C-CDA baseline is not installed on this server.');
        } else {
            baselineRadio.prop('disabled', false);
            if (!baselineRadio.prop('checked') && !emptyRadio.prop('checked')) {
                baselineRadio.prop('checked', true);
            }
            $('#new-project-baseline-help').text('Copies the pinned v7.0 template pack and four sample messages.');
        }
    }

    function syncOpenProjectModalKind() {
        var kind = $('input[name="open-project-kind"]:checked').val() || 'local';
        $('#open-project-local-fields').prop('hidden', kind !== 'local');
        $('#open-project-github-fields').prop('hidden', kind !== 'github');
    }

    function showModalError(selector, message) {
        $(selector).text(message).prop('hidden', false);
    }

    function hideModalError(selector) {
        $(selector).text('').prop('hidden', true);
    }

    function resetOpenProjectModal() {
        pendingConfirmRequest = null;
        hideModalError('#open-project-error');
        $('#open-project-confirm-step').prop('hidden', true);
        $('#open-project-form-step').prop('hidden', false);
        $('#open-project-go').prop('hidden', false).prop('disabled', false).text('Open');
        $('#open-project-confirm').prop('hidden', true).prop('disabled', false);
        $('#open-project-back').prop('hidden', true);
        syncOpenProjectModalKind();
    }

    function renderFamilyIconsInModals() {
        if (typeof icon !== 'function') {
            return;
        }
        $('.project-family-icon').each(function () {
            var $slot = $(this);
            if ($slot.children().length === 0) {
                var iconName = $slot.attr('data-icon');
                $slot.append(icon(iconName));
            }
        });
    }

    function showConfirmDetectedStep(detected, reqKind, reqBody) {
        pendingConfirmRequest = {kind: reqKind, body: reqBody, detected: detected};
        var list = $('#open-project-detected-list').empty();
        detected.forEach(function (fam) {
            var row = $('<label class="project-detected-item"></label>');
            row.append($('<input type="checkbox" checked disabled>'));
            if (typeof icon === 'function') {
                row.append(icon(fam === 'ccda' ? 'icon-ccda' : 'icon-hl7'));
            }
            row.append($('<span></span>').text(familyDisplayName(fam)));
            list.append(row);
        });
        hideModalError('#open-project-error');
        $('#open-project-form-step').prop('hidden', true);
        $('#open-project-confirm-step').prop('hidden', false);
        $('#open-project-go').prop('hidden', true);
        $('#open-project-back').prop('hidden', false);
        $('#open-project-confirm').prop('hidden', false).prop('disabled', false);
    }

    window.getActiveProject = getActiveProject;
    window.getActiveProjectFamily = getActiveProjectFamily;
    window.getActiveProjectRoots = getActiveProjectRoots;
    window.fetchProjectFileText = fetchProjectFileText;
    window.saveProjectFile = saveProjectFile;
    window.refreshProjectFileBrowser = refreshProjectFileBrowser;
    window.openProjectTemplateClean = openProjectTemplateClean;
    window.applyCcdaNoConvertState = applyCcdaNoConvertState;

    $(document).ready(function () {
        var initial = readStoredProject();
        if (initial) {
            activeProject = initial;
            activeProjectFamily = (initial.manifest && initial.manifest.startup && initial.manifest.startup.family) || 'hl7v2';
        }
        renderFamilyIconsInModals();
        updateProjectChrome();

        $('#new-project-open').on('click', function () {
            hideModalError('#new-project-error');
            $('#new-project-create').prop('disabled', false).text('Create');
            renderFamilyIconsInModals();
            syncNewProjectModalControls();
            $('#new-project-modal').modal('show');
        });

        $('input[name="new-project-family"]').on('change', function () {
            var fam = $(this).val();
            if (fam === 'hl7v2' && $('#new-project-start-baseline').prop('disabled')) {
                $('#new-project-start-baseline').prop('disabled', false).prop('checked', true);
            }
            syncNewProjectModalControls();
        });

        $('#new-project-create').on('click', function () {
            hideModalError('#new-project-error');
            var payload = {
                name: ($('#new-project-name').val() || '').trim(),
                parentPath: ($('#new-project-parent').val() || '').trim(),
                family: $('input[name="new-project-family"]:checked').val() || 'hl7v2',
                startingPoint: $('input[name="new-project-start"]:checked').val() || 'empty'
            };
            var $btn = $('#new-project-create');
            $btn.prop('disabled', true).text('Creating…');
            $.ajax('/api/v1/projects', {
                type: 'POST',
                contentType: 'application/json',
                processData: false,
                dataType: 'json',
                data: JSON.stringify(payload),
                success: function (res) {
                    $btn.prop('disabled', false).text('Create');
                    $('#new-project-modal').modal('hide');
                    activateOpenedProject({
                        kind: 'local',
                        path: res.path,
                        manifest: res.manifest
                    });
                },
                error: function (xhr) {
                    $btn.prop('disabled', false).text('Create');
                    var body = (xhr && xhr.responseJSON) || {};
                    var msg = (body.error && body.error.message) ? body.error.message : 'Could not create project.';
                    showModalError('#new-project-error', msg);
                }
            });
        });

        $('#open-project-open').on('click', function () {
            resetOpenProjectModal();
            $('#open-project-modal').modal('show');
        });

        $('input[name="open-project-kind"]').on('change', syncOpenProjectModalKind);

        $('#open-project-back').on('click', function () {
            resetOpenProjectModal();
        });

        $('#open-project-go').on('click', function () {
            hideModalError('#open-project-error');
            var kind = $('input[name="open-project-kind"]:checked').val() || 'local';
            var url = kind === 'github' ? '/api/v1/projects/open-github' : '/api/v1/projects/open';
            var reqBody = kind === 'github'
                ? {
                    repo: ($('#open-project-repo').val() || '').trim(),
                    ref: ($('#open-project-ref').val() || '').trim(),
                    token: $('#open-project-token').val() || ''
                }
                : {
                    path: ($('#open-project-path').val() || '').trim()
                };
            var $btn = $('#open-project-go');
            $btn.prop('disabled', true).text('Opening…');
            $.ajax(url, {
                type: 'POST',
                contentType: 'application/json',
                processData: false,
                dataType: 'json',
                data: JSON.stringify(reqBody),
                success: function (res) {
                    $btn.prop('disabled', false).text('Open');
                    if (res.needsConfirm) {
                        showConfirmDetectedStep(res.detected || [], kind, reqBody);
                        return;
                    }
                    $('#open-project-modal').modal('hide');
                    if (kind === 'github') {
                        activateOpenedProject({
                            kind: 'github',
                            repo: res.repo,
                            ref: res.ref || '',
                            token: reqBody.token || '',
                            manifest: res.manifest
                        });
                    } else {
                        activateOpenedProject({
                            kind: 'local',
                            path: res.path,
                            manifest: res.manifest
                        });
                    }
                },
                error: function (xhr) {
                    $btn.prop('disabled', false).text('Open');
                    var body = (xhr && xhr.responseJSON) || {};
                    var msg = (body.error && body.error.message) ? body.error.message : 'Could not open project.';
                    showModalError('#open-project-error', msg);
                }
            });
        });

        $('#open-project-confirm').on('click', function () {
            if (!pendingConfirmRequest) {
                return;
            }
            hideModalError('#open-project-error');
            var pending = pendingConfirmRequest;
            var url = pending.kind === 'github' ? '/api/v1/projects/open-github' : '/api/v1/projects/open';
            var confirmBody = Object.assign({}, pending.body, {confirmFamilies: pending.detected});
            var $btn = $('#open-project-confirm');
            $btn.prop('disabled', true);
            $.ajax(url, {
                type: 'POST',
                contentType: 'application/json',
                processData: false,
                dataType: 'json',
                data: JSON.stringify(confirmBody),
                success: function (res) {
                    $btn.prop('disabled', false);
                    $('#open-project-modal').modal('hide');
                    if (pending.kind === 'github') {
                        activateOpenedProject({
                            kind: 'github',
                            repo: res.repo,
                            ref: res.ref || '',
                            token: pending.body.token || '',
                            manifest: res.manifest
                        });
                    } else {
                        activateOpenedProject({
                            kind: 'local',
                            path: res.path,
                            manifest: res.manifest
                        });
                    }
                },
                error: function (xhr) {
                    $btn.prop('disabled', false);
                    var body = (xhr && xhr.responseJSON) || {};
                    var msg = (body.error && body.error.message) ? body.error.message : 'Could not confirm project.';
                    showModalError('#open-project-error', msg);
                }
            });
        });

        $('#project-use-builtin').on('click', function () {
            switchToBuiltinMode();
        });

        $('#project-family').on('change', function () {
            var nextFam = $(this).val();
            if (!activeProject || !nextFam || nextFam === activeProjectFamily) {
                return;
            }
            if (!closeAllTemplates(true)) {
                $(this).val(activeProjectFamily);
                return;
            }
            activeProjectFamily = nextFam;
            selectedSample = null;
            selectedTemplate = null;
            suggestedTemplate = null;
            refreshProjectFileBrowser({forceStartup: true});
        });

        $('#project-add-samples').on('click', function () {
            if (!activeProject || activeProject.kind !== 'local') {
                return;
            }
            if (!window.confirm('Copy the 139 official HL7 v2 samples into this project? Existing official files are updated if changed; your custom samples are kept.')) {
                return;
            }
            $.ajax('/api/v1/projects/official-samples', {
                type: 'POST',
                contentType: 'application/json',
                processData: false,
                dataType: 'json',
                data: JSON.stringify({path: activeProject.path}),
                success: function (res) {
                    hideConversionError();
                    if (res && res.copied > 0) {
                        $('#conversion-status').text('Added ' + res.copied + ' official samples.');
                    } else {
                        $('#conversion-status').text('Official samples already match.');
                    }
                    refreshProjectFileBrowser({openStartup: false});
                },
                error: function (xhr) {
                    var body = (xhr && xhr.responseJSON) || {};
                    var msg = (body.error && body.error.message) ? body.error.message : 'Could not copy official samples.';
                    showConversionError(msg);
                }
            });
        });
    });
})();
