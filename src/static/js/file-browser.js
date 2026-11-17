// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------
/* eslint-disable no-undef, no-unused-vars */

var selectedSample = null;
var selectedTemplate = null;
var didOpenStartupExample = false;
var cachedSamples = [];
var openFolders = {};

function refreshFileBrowser() {
    $.ajax({url: getUrl('sample-data'), dataType: 'json', cache: false, success: function (sampleList) {
        $.ajax({url: getUrl('templates'), dataType: 'json', cache: false, success: function (templateList) {
            applyTemplateList(templateList.templates || []);
            cachedSamples = sampleList.messages || [];
            renderFileBrowser(cachedSamples);
            if (didOpenStartupExample) {
                return;
            }
            didOpenStartupExample = true;
            var hasStartupSample = (sampleList.messages || []).some(function (item) {
                return item.messageName === 'hl7v2/ADT04-23.hl7';
            });
            var hasStartupTemplate = Array.isArray(templateNames) && templateNames.indexOf('ADT_A04.liquid') !== -1;
            var startupEditorsEmpty = dataEditor && dataEditor.getValue() === ''
                && activeTemplate && activeTemplate.name === 'untitled' && activeTemplate.data === ''
                && openTemplates.length === 1;
            if (startupEditorsEmpty && hasStartupSample && hasStartupTemplate) {
                selectedSample = 'hl7v2/ADT04-23.hl7';
                selectedTemplate = 'ADT_A04.liquid';
                renderFileBrowser(sampleList.messages || []);
                loadData('hl7v2/ADT04-23.hl7');
                loadTemplate('ADT_A04.liquid');
            }
        }});
    }});
}

function renderFileBrowser(messages) {
    var filter = ($('#file-filter').val() || '').toLowerCase();
    var samples = messages.filter(function (item) {
        return item.messageName && item.messageName.toLowerCase().startsWith('hl7v2/');
    }).map(function (item) {
        return {
            full: item.messageName,
            label: item.messageName.substring(item.messageName.indexOf('/') + 1)
        };
    });

    $('#samples-list').empty();
    samples.forEach(function (sample) {
        if (filter && sample.label.toLowerCase().indexOf(filter) === -1) {
            return;
        }
        var row = $('<div class="file-browser-row"></div>').text(sample.label);
        row.attr('title', sample.label);
        if (sample.full === selectedSample) {
            row.addClass('is-selected');
        }
        row.on('click', function () {
            selectedSample = sample.full;
            $('#samples-list .file-browser-row').removeClass('is-selected');
            row.addClass('is-selected');
            loadData(sample.full);
        });
        $('#samples-list').append(row);
    });

    var roots = [];
    var folders = {};
    (templateNames || []).forEach(function (name) {
        var slash = name.indexOf('/');
        if (slash === -1) {
            roots.push(name);
        } else {
            var folder = name.slice(0, slash);
            if (!folders[folder]) {
                folders[folder] = [];
            }
            folders[folder].push(name);
        }
    });

    $('#templates-list').empty();
    roots.forEach(function (name) {
        if (filter && name.toLowerCase().indexOf(filter) === -1) {
            return;
        }
        $('#templates-list').append(templateRow(name));
    });

    $('#partials-list').empty();
    Object.keys(folders).sort().forEach(function (folder) {
        var children = folders[folder].filter(function (name) {
            var label = name.substring(folder.length + 1);
            if (!filter) {
                return true;
            }
            return label.toLowerCase().indexOf(filter) !== -1 || folder.toLowerCase().indexOf(filter) !== -1;
        });
        if (filter && children.length === 0 && folder.toLowerCase().indexOf(filter) === -1) {
            return;
        }
        var shown = filter ? children.filter(function (name) {
            var label = name.substring(folder.length + 1);
            return label.toLowerCase().indexOf(filter) !== -1 || folder.toLowerCase().indexOf(filter) !== -1;
        }) : folders[folder];
        if (filter && folder.toLowerCase().indexOf(filter) !== -1) {
            shown = folders[folder];
        }
        if (!shown.length) {
            return;
        }
        var block = $('<div class="file-browser-folder"></div>');
        if (filter || openFolders[folder]) {
            block.addClass('open');
        }
        var headingText = folder + ' (' + shown.length + ')';
        var heading = $('<div class="file-browser-row"></div>');
        heading.append($('<span class="file-browser-chevron" aria-hidden="true"></span>'));
        heading.append(document.createTextNode(headingText));
        heading.attr('title', headingText);
        heading.on('click', function (event) {
            event.stopPropagation();
            openFolders[folder] = !openFolders[folder];
            block.toggleClass('open');
        });
        var childBox = $('<div class="file-browser-children"></div>');
        shown.forEach(function (name) {
            if (filter && name.substring(folder.length + 1).toLowerCase().indexOf(filter) === -1 && folder.toLowerCase().indexOf(filter) === -1) {
                return;
            }
            childBox.append(templateRow(name, name.substring(name.lastIndexOf('/') + 1)));
        });
        block.append(heading, childBox);
        $('#partials-list').append(block);
    });
}

function templateRow(fullName, label) {
    var text = label || fullName;
    var row = $('<div class="file-browser-row"></div>').text(text);
    row.attr('title', text);
    if (fullName === selectedTemplate) {
        row.addClass('is-selected');
    }
    row.on('click', function (event) {
        event.stopPropagation();
        selectedTemplate = fullName;
        $('#templates-list .file-browser-row, #partials-list .file-browser-row').removeClass('is-selected');
        row.addClass('is-selected');
        loadTemplate(fullName);
    });
    return row;
}

var browseSource = 'builtin';
var externalPath = '';

function setBrowseSource(source) {
    browseSource = source;
    $('#source-switch button').removeClass('is-active');
    $('#source-switch button[data-source="' + source + '"]').addClass('is-active');
    $('#source-github').prop('hidden', source !== 'github');
    $('#source-folder').prop('hidden', source !== 'folder');
    $('#builtin-lists').prop('hidden', source !== 'builtin');
    $('#external-browser').prop('hidden', source === 'builtin');
    if (source === 'builtin') {
        refreshFileBrowser();
    }
}

function renderExternalEntries(payload) {
    externalPath = payload.path || '';
    $('#external-path').text(payload.repo ? payload.repo + (externalPath ? ' / ' + externalPath : '') : externalPath);
    var list = $('#external-list');
    list.empty();
    if (externalPath) {
        var up = $('<div class="file-browser-row"></div>').text('..');
        up.attr('title', '..');
        up.on('click', function () {
            var parent = externalPath.split('/').slice(0, -1).join('/');
            if (browseSource === 'folder') {
                parent = externalPath.split('/').slice(0, -1).join('/') || '/';
            }
            loadExternal(parent);
        });
        list.append(up);
    }
    (payload.entries || []).forEach(function (entry) {
        var label = (entry.type === 'dir' ? '▸ ' : '') + entry.name;
        var row = $('<div class="file-browser-row"></div>').text(label);
        row.attr('title', label);
        row.on('click', function () {
            if (entry.type === 'dir') {
                loadExternal(entry.path);
                return;
            }
            openExternalFile(entry);
        });
        list.append(row);
    });
}

function loadExternal(path) {
    var url = browseSource === 'github' ? '/api/v1/browse/github' : '/api/v1/browse/folder';
    var body = browseSource === 'github'
        ? {repo: $('#github-repo').val(), path: path || '', token: $('#github-token').val()}
        : {path: path || $('#folder-path').val()};
    $.ajax(url, {
        data: JSON.stringify(body),
        type: 'POST',
        processData: false,
        contentType: 'application/json',
        success: renderExternalEntries,
        error: function (err) {
            var message = 'Could not list that location.';
            if (err.responseJSON && err.responseJSON.error) {
                message = err.responseJSON.error.message;
            }
            showConversionError(message);
        }
    });
}

function openExternalFile(entry) {
    var url = browseSource === 'github' ? '/api/v1/browse/github' : '/api/v1/browse/folder';
    var body = browseSource === 'github'
        ? {repo: $('#github-repo').val(), path: entry.path, token: $('#github-token').val(), file: true}
        : {path: entry.path, file: true};
    $.ajax(url, {
        data: JSON.stringify(body),
        type: 'POST',
        processData: false,
        contentType: 'application/json',
        dataType: 'text',
        success: function (text) {
            var name = entry.name;
            if (/\.liquid$/i.test(name)) {
                openLocalTemplate(name, text, true);
                $('#template-open-name').text(name);
                templateCodeEditor.setOption('mode', 'text/plain');
                templateCodeEditor.refresh();
                templateCodeEditor.focus();
                return;
            }
            if (/\.(hl7|txt|json)$/i.test(name)) {
                dataEditor.setValue(typeof text === 'string' ? text : String(text));
                $('#message-name').text(name);
                convertData(true);
                return;
            }
            openLocalTemplate(name, text, true);
            templateCodeEditor.refresh();
        },
        error: function (err) {
            var message = 'Could not open that file.';
            if (err.responseJSON && err.responseJSON.error) {
                message = err.responseJSON.error.message;
            }
            showConversionError(message);
        }
    });
}

$(document).ready(function () {
    $('#file-filter').on('input', function () {
        if (browseSource === 'builtin') {
            renderFileBrowser(cachedSamples);
        }
    });
    $('#source-switch').on('click', 'button', function () {
        setBrowseSource($(this).data('source'));
    });
    $('#github-list').on('click', function () {
        externalPath = '';
        loadExternal('');
    });
    $('#folder-list').on('click', function () {
        externalPath = '';
        loadExternal($('#folder-path').val());
    });
    var fileBrowser = $('#file-browser');
    var resizer = $('#file-browser-resizer');
    var storedWidth = parseFloat(localStorage.getItem('fhirConverterFileBrowserWidth'));
    if (isFinite(storedWidth) && storedWidth >= 180 && storedWidth <= 480) {
        fileBrowser.css({width: storedWidth + 'px', 'flex-basis': storedWidth + 'px'});
    }
    resizer.on('mousedown', function (event) {
        if (event.button !== 0) {
            return;
        }
        event.preventDefault();
        resizer.addClass('is-dragging');
        function onMouseMove(moveEvent) {
            var left = fileBrowser[0].getBoundingClientRect().left;
            var width = Math.max(180, Math.min(480, moveEvent.clientX - left));
            fileBrowser.css({width: width + 'px', 'flex-basis': width + 'px'});
        }
        function onMouseUp() {
            $(document).off('mousemove', onMouseMove).off('mouseup', onMouseUp);
            resizer.removeClass('is-dragging');
            localStorage.setItem('fhirConverterFileBrowserWidth', String(parseInt(fileBrowser.css('width'), 10)));
            if (typeof refreshEditors === 'function') {
                refreshEditors();
            }
        }
        $(document).on('mousemove', onMouseMove).on('mouseup', onMouseUp);
    });
    refreshFileBrowser();
});
