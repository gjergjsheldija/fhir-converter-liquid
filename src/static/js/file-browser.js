/* eslint-disable no-undef, no-unused-vars */

var selectedSample = null;
var selectedTemplate = null;
var didOpenStartupExample = false;
var cachedSamples = [];
var openFolders = {};
var suggestedTemplate = null;
var openSections = { samples: true, templates: true, partials: false };
(function hydrateOpenSections() {
    var stored;
    try {
        stored = JSON.parse(localStorage.getItem('fhirConverterFileSectionsV2') || '{}');
    } catch (storageError) {
        stored = null;
    }
    if (stored && typeof stored === 'object') {
        ['samples', 'templates', 'partials'].forEach(function (section) {
            if (typeof stored[section] === 'boolean') {
                openSections[section] = stored[section];
            }
        });
    }
})();

function refreshFileBrowser() {
    if (typeof getActiveProject === 'function' && getActiveProject()) {
        var shouldOpenProjectStartup = !didOpenStartupExample;
        didOpenStartupExample = true;
        refreshProjectFileBrowser({openStartup: shouldOpenProjectStartup});
        return;
    }
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

function matchTemplateForSample(text) {
    if (typeof text !== 'string' || text.length === 0) {
        return null;
    }
    var line = text.split(/\r\n|\n|\r/)[0];
    if (line.charAt(line.length - 1) === '\r') {
        line = line.substring(0, line.length - 1);
    }
    if (line.indexOf('MSH') !== 0) {
        return null;
    }
    if (line.length < 5) {
        return null;
    }
    var fieldSeparator = line.charAt(3);
    var componentSeparator = line.charAt(4);
    var parts = line.split(fieldSeparator);
    if (parts.length < 9 || parts[8] === '') {
        return null;
    }
    var components = parts[8].split(componentSeparator);
    var type = components[0];
    var event = components[1];
    if (!type || !event
        || type.indexOf('/') !== -1 || type.indexOf('\\') !== -1 || type.indexOf('..') !== -1
        || event.indexOf('/') !== -1 || event.indexOf('\\') !== -1 || event.indexOf('..') !== -1) {
        return null;
    }
    var candidate = type + '_' + event + '.liquid';
    if (Array.isArray(templateNames) && templateNames.indexOf(candidate) !== -1) {
        return candidate;
    }
    return null;
}

function highlightMatchingTemplate(text) {
    suggestedTemplate = matchTemplateForSample(text);
    var filterValue = ($('#file-filter').val() || '').toLowerCase();
    if (suggestedTemplate && filterValue && suggestedTemplate.toLowerCase().indexOf(filterValue) === -1) {
        $('#file-filter').val('');
    }
    if (suggestedTemplate && openSections.templates === false) {
        openSections.templates = true;
        try {
            localStorage.setItem('fhirConverterFileSectionsV2', JSON.stringify(openSections));
        } catch (storageError) {
            // storage unavailable; keep working without persistence
        }
    }
    renderFileBrowser(cachedSamples);
    if (suggestedTemplate) {
        var escaped = suggestedTemplate.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        var row = $('[data-template-name="' + escaped + '"]');
        if (row.length) {
            row[0].scrollIntoView({block: 'nearest'});
        }
    }
}

function removeUserSample(sample) {
    if (!window.confirm('Delete sample "' + sample.label + '"?')) {
        return;
    }
    $.ajax({
        url: getUrl('sample-data', 'hl7v2/' + sample.label),
        type: 'DELETE',
        dataType: 'json'
    }).done(function () {
        if (selectedSample === sample.full) {
            selectedSample = null;
        }
        refreshFileBrowser();
    }).fail(function (xhr) {
        var body = (xhr && xhr.responseJSON) || {};
        var message = (body.error && typeof body.error.message === 'string') ? body.error.message : 'Could not delete sample.';
        showConversionError(message);
    });
}

function setFileRowTabOrder() {
    var rows = $('#file-browser .file-browser-row');
    rows.attr('tabindex', '-1');
    var target = null;
    var firstVisible = null;
    rows.each(function () {
        if (!$(this).is(':visible')) {
            return;
        }
        if (firstVisible === null) {
            firstVisible = $(this);
        }
        if ($(this).hasClass('is-selected')) {
            target = $(this);
            return false;
        }
    });
    if (target === null) {
        target = firstVisible;
    }
    if (target) {
        target.attr('tabindex', '0');
    }
}

function folderNameFromHeading(heading) {
    var stored = heading.attr('data-folder-name');
    if (stored) {
        return stored;
    }
    var text = heading.text();
    text = text.replace(/^[▸▾] ?/, '');
    text = text.replace(/ \(\d+\)$/, '');
    return text;
}

function renderFileBrowser(messages) {
    var filter = ($('#file-filter').val() || '').toLowerCase();
    var samples = messages.filter(function (item) {
        return item && item.messageName && (item.projectSample === true || item.messageName.toLowerCase().startsWith('hl7v2/'));
    }).map(function (item) {
        return {
            full: item.messageName,
            label: item.label || item.messageName.substring(item.messageName.indexOf('/') + 1),
            source: item.source
        };
    });

    $('#samples-list').empty();
    var renderedSamplesCount = 0;
    samples.forEach(function (sample) {
        if (filter && sample.label.toLowerCase().indexOf(filter) === -1) {
            return;
        }
        var row = $('<button type="button" class="file-browser-row"></button>');
        row.append(icon('icon-message'));
        row.append($('<span class="file-browser-label"></span>').text(sample.label));
        if (sample.source === 'user') {
            var remove = $('<span class="sample-remove" role="button" tabindex="0" aria-label="Remove ' + sample.label + '">×</span>');
            remove.on('click', function (event) {
                event.stopPropagation();
                removeUserSample(sample);
            });
            remove.on('keydown', function (event) {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    removeUserSample(sample);
                }
            });
            row.append(remove);
        }
        row.attr('title', sample.label);
        if (sample.full === selectedSample) {
            row.addClass('is-selected');
        }
        row.on('click', function () {
            selectedSample = sample.full;
            $('#samples-list .file-browser-row').removeClass('is-selected');
            row.addClass('is-selected');
            loadData(sample.full, function (text) {
                highlightMatchingTemplate(text);
            });
        });
        $('#samples-list').append(row);
        renderedSamplesCount++;
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
    var renderedRootsCount = 0;
    roots.forEach(function (name) {
        if (filter && name.toLowerCase().indexOf(filter) === -1) {
            return;
        }
        $('#templates-list').append(templateRow(name));
        renderedRootsCount++;
    });

    $('#partials-list').empty();
    var renderedPartialsFileCount = 0;
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
        var heading = $('<button type="button" class="file-browser-row"></button>');
        heading.append($('<span class="file-browser-chevron" aria-hidden="true"></span>'));
        heading.append($('<span class="file-browser-label"></span>').text(headingText));
        heading.attr('title', headingText);
        heading.attr('data-folder-name', folder);
        heading.on('click', function (event) {
            event.stopPropagation();
            openFolders[folder] = !openFolders[folder];
            block.toggleClass('open');
            setFileRowTabOrder();
        });
        var childBox = $('<div class="file-browser-children"></div>');
        shown.forEach(function (name) {
            if (filter && name.substring(folder.length + 1).toLowerCase().indexOf(filter) === -1 && folder.toLowerCase().indexOf(filter) === -1) {
                return;
            }
            childBox.append(templateRow(name, name.substring(name.lastIndexOf('/') + 1)));
            renderedPartialsFileCount++;
        });
        block.append(heading, childBox);
        $('#partials-list').append(block);
    });

    var templateGroup = (typeof getActiveProject === 'function' && getActiveProject()) ? 'This customer' : 'Starter pack';
    $('#samples-heading-label').text('Samples · ' + renderedSamplesCount);
    $('#templates-heading-label').text(templateGroup + ' · ' + renderedRootsCount);
    $('#partials-heading-label').text('Partials · ' + renderedPartialsFileCount);
    var sectionCounts = {
        samples: renderedSamplesCount,
        templates: renderedRootsCount,
        partials: renderedPartialsFileCount
    };
    ['samples', 'templates', 'partials'].forEach(function (section) {
        var block = $('.file-browser-section[data-section="' + section + '"]');
        var open = filter
            ? sectionCounts[section] > 0
            : openSections[section] !== false;
        block.toggleClass('open', open);
        block.children('.file-browser-section-toggle').attr('aria-expanded', open ? 'true' : 'false');
    });
    setFileRowTabOrder();
}

function iconIdForTemplate(fullName) {
    if (fullName.indexOf('/') === -1) {
        return /\.liquid$/i.test(fullName) ? 'icon-template' : null;
    }
    if (/\.json$/i.test(fullName)) {
        return 'icon-json';
    }
    return 'icon-partial';
}

function templateRow(fullName, label) {
    var text = label || fullName;
    var row = $('<button type="button" class="file-browser-row"></button>');
    var iconId = iconIdForTemplate(fullName);
    if (iconId) {
        row.append(icon(iconId));
    }
    row.append($('<span class="file-browser-label"></span>').text(text));
    row.attr('title', text);
    row.attr('data-template-name', fullName);
    if (fullName === selectedTemplate) {
        row.addClass('is-selected');
    }
    if (fullName === suggestedTemplate) {
        row.addClass('is-suggested');
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
        var up = $('<button type="button" class="file-browser-row"></button>');
        up.append($('<span class="file-browser-label"></span>').text('..'));
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
        var row = $('<button type="button" class="file-browser-row"></button>');
        row.append($('<span class="file-browser-label"></span>').text(label));
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
    setFileRowTabOrder();
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
                templateCodeEditor.setOption("mode", templateEditorModeForName(name));
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
            templateCodeEditor.setOption("mode", templateEditorModeForName(name));
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

function fieldMapFolder() {
    if (browseSource === 'github') {
        return {error: 'Field map reads a folder on this server. Browse a folder, or use the starter pack.'};
    }
    if (browseSource === 'folder') {
        var folder = ($('#folder-path').val() || externalPath || '').trim();
        if (!folder) {
            return {error: 'Choose a folder first.'};
        }
        return {path: folder};
    }
    if (typeof getActiveProject === 'function' && getActiveProject()) {
        var project = getActiveProject();
        if (!project || project.kind !== 'local' || !project.path) {
            return {error: 'Field map reads a folder on this server. Open a customer folder, or use the starter pack.'};
        }
        var roots = typeof getActiveProjectRoots === 'function' ? getActiveProjectRoots() : null;
        var templates = roots && roots.templates ? roots.templates : 'templates/Hl7v2';
        return {path: String(project.path).replace(/\/+$/, '') + '/' + templates};
    }
    return {};
}

function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

// Browser copy of src/lib/mappings/igCoverage.js (classic scripts cannot import it).
var igGuide = null;
var lastFieldMap = null;

function igGroupsOf(resource) {
    if (!resource || typeof resource !== 'object') {
        return [];
    }
    if (resource.resourceType === 'ConceptMap') {
        return Array.isArray(resource.group) ? resource.group : [];
    }
    if (resource.resourceType === 'Bundle' && Array.isArray(resource.entry)) {
        return resource.entry.reduce(function (all, entry) {
            var inner = entry && entry.resource;
            return inner && inner.resourceType === 'ConceptMap' && Array.isArray(inner.group) ? all.concat(inner.group) : all;
        }, []);
    }
    return [];
}

function igKeysOf(resource) {
    var keys = {};
    var count = 0;
    igGroupsOf(resource).forEach(function (group) {
        if (!group || typeof group !== 'object') {
            return;
        }
        (Array.isArray(group.element) ? group.element : []).forEach(function (element) {
            if (!element || typeof element !== 'object') {
                return;
            }
            var target = Array.isArray(element.target) && element.target[0] ? element.target[0].code : undefined;
            var key = [group.source, element.code, group.target, target].join('|');
            if (!Object.prototype.hasOwnProperty.call(keys, key)) {
                keys[key] = true;
                count += 1;
            }
        });
    });
    return {keys: keys, count: count};
}

function coverageScore(generated, guide) {
    var generatedKeys = igKeysOf(generated);
    var guideKeys = igKeysOf(guide);
    var shared = 0;
    Object.keys(generatedKeys.keys).forEach(function (key) {
        if (Object.prototype.hasOwnProperty.call(guideKeys.keys, key)) {
            shared += 1;
        }
    });
    return {shared: shared, onlyGenerated: generatedKeys.count - shared, onlyGuide: guideKeys.count - shared};
}

function showCoverageScore() {
    var $score = $('#ig-coverage-score');
    if (!lastFieldMap) {
        $score.text('');
        return;
    }
    if (!igGuide || !igGroupsOf(igGuide).length) {
        $score.text('No IG ConceptMap loaded');
        return;
    }
    var score = coverageScore(lastFieldMap, igGuide);
    $score.text('Shared ' + score.shared + ' · Only in template ' + score.onlyGenerated + ' · Only in IG ' + score.onlyGuide);
}

function addCoverageControls() {
    var $input = $('#ig-guide-file');
    var $open = $('#ig-guide-open');
    if (!$input.length || $input.data('bound')) {
        return;
    }
    $input.data('bound', true);
    $open.on('click', function () {
        $input.trigger('click');
    });
    $input.on('change', function () {
        var file = this.files && this.files[0];
        igGuide = null;
        $('#ig-guide-name').text(file ? file.name : '');
        if (!file) {
            showCoverageScore();
            return;
        }
        var reader = new FileReader();
        reader.onload = function () {
            try {
                igGuide = JSON.parse(String(reader.result));
            } catch (parseError) {
                igGuide = null;
                $('#ig-guide-name').text('That file is not JSON.');
            }
            showCoverageScore();
        };
        reader.onerror = function () {
            igGuide = null;
            $('#ig-guide-name').text('Could not read that file.');
            showCoverageScore();
        };
        reader.readAsText(file);
    });
}

function generateFieldMaps() {
    var target = fieldMapFolder();
    if (target.error) {
        showConversionError(target.error);
        return;
    }
    var $button = $('#generate-maps-button');
    $button.prop('disabled', true).text('Writing…');
    $('#conversion-status').text('Writing field maps…');
    hideConversionError();
    target.write = true;
    fetch('/api/v1/field-map', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(target)
    }).then(function (response) {
        if (!response.ok) {
            return response.json().then(function (body) {
                var message = body && body.error && body.error.message ? body.error.message : 'Could not write the field maps.';
                throw new Error(message);
            }, function () {
                throw new Error('Could not write the field maps.');
            });
        }
        return response.json();
    }).then(function (result) {
        $('#conversion-status').text('Wrote ' + result.files.length + ' files to ' + result.dir);
        lastFieldMap = result.conceptMap || null;
        showCoverageScore();
    }).catch(function (err) {
        $('#conversion-status').text('Failed');
        showConversionError(err && err.message ? err.message : 'Could not write the field maps.');
    }).finally(function () {
        $button.prop('disabled', false).text('Build field map');
    });
}

function downloadFieldMap() {
    var target = fieldMapFolder();
    if (target.error) {
        showConversionError(target.error);
        return;
    }
    var $button = $('#field-map-button');
    $button.prop('disabled', true).text('Writing…');
    $('#conversion-status').text('Writing field map…');
    hideConversionError();
    fetch('/api/v1/field-map', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(target)
    }).then(function (response) {
        if (!response.ok) {
            return response.json().then(function (body) {
                var message = body && body.error && body.error.message ? body.error.message : 'Could not write the field map.';
                throw new Error(message);
            }, function () {
                throw new Error('Could not write the field map.');
            });
        }
        return response.blob();
    }).then(function (blob) {
        downloadBlob(blob, 'hl7v2-field-map.zip');
        $('#conversion-status').text('Map exported');
    }).catch(function (err) {
        $('#conversion-status').text('Failed');
        showConversionError(err && err.message ? err.message : 'Could not write the field map.');
    }).finally(function () {
        $button.prop('disabled', false).text('Export map');
    });
}

$(document).ready(function () {
    $('#file-filter').on('input', function () {
        if (browseSource === 'builtin') {
            renderFileBrowser(cachedSamples);
        }
    });
    $('#builtin-lists').on('click', '.file-browser-section-toggle', function () {
        var block = $(this).closest('.file-browser-section');
        var section = block.attr('data-section');
        var open = !block.hasClass('open');
        block.toggleClass('open', open);
        $(this).attr('aria-expanded', open ? 'true' : 'false');
        if (!($('#file-filter').val() || '')) {
            openSections[section] = open;
            try {
                localStorage.setItem('fhirConverterFileSectionsV2', JSON.stringify(openSections));
            } catch (storageError) {
                // storage unavailable; keep working without persistence
            }
        }
        setFileRowTabOrder();
    });
    $('#source-switch').on('click', 'button', function () {
        setBrowseSource($(this).data('source'));
    });
    addCoverageControls();
    $('#generate-maps-button').on('click', generateFieldMaps);
    $('#field-map-button').on('click', downloadFieldMap);
    $('#github-list').on('click', function () {
        externalPath = '';
        loadExternal('');
    });
    $('#folder-list').on('click', function () {
        externalPath = '';
        loadExternal($('#folder-path').val());
    });
    $('#folder-browse').on('click', function () {
        var $button = $(this);
        $button.prop('disabled', true).text('Opening…');
        $.ajax('/api/v1/browse/choose-folder', {
            type: 'POST',
            contentType: 'application/json',
            processData: false,
            dataType: 'json',
            data: '{}'
        }).done(function (result) {
            var chosen = result && result.path ? result.path : '';
            if (!chosen) {
                showConversionError('No folder was chosen.');
                return;
            }
            $('#folder-path').val(chosen);
            externalPath = '';
            loadExternal(chosen);
            hideConversionError();
        }).fail(function (xhr) {
            var message = 'Could not open the folder browser.';
            if (xhr.responseJSON && xhr.responseJSON.error && xhr.responseJSON.error.message) {
                message = xhr.responseJSON.error.message;
            }
            showConversionError(message);
        }).always(function () {
            $button.prop('disabled', false).text('Browse…');
        });
    });
    $('#file-browser').on('keydown', function (event) {
        var target = event.target;
        var $target = $(target);
        if (!$target.hasClass('file-browser-row')) {
            return;
        }
        var visibleRows = $('#file-browser .file-browser-row').filter(function () {
            return $(this).is(':visible');
        }).toArray();
        var index = visibleRows.indexOf(target);
        if (index === -1) {
            return;
        }
        function focusRow(row) {
            $(visibleRows[index]).attr('tabindex', '-1');
            $(row).attr('tabindex', '0');
            $(row).focus();
        }
        var folder = $target.parent();
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (index < visibleRows.length - 1) {
                focusRow(visibleRows[index + 1]);
            }
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (index > 0) {
                focusRow(visibleRows[index - 1]);
            }
        } else if (event.key === 'Home') {
            event.preventDefault();
            focusRow(visibleRows[0]);
        } else if (event.key === 'End') {
            event.preventDefault();
            focusRow(visibleRows[visibleRows.length - 1]);
        } else if (event.key === 'ArrowRight') {
            if (folder.hasClass('file-browser-folder') && !folder.hasClass('open')) {
                event.preventDefault();
                folder.addClass('open');
                openFolders[folderNameFromHeading($target)] = true;
                setFileRowTabOrder();
            }
        } else if (event.key === 'ArrowLeft') {
            if (folder.hasClass('file-browser-folder') && folder.hasClass('open')) {
                event.preventDefault();
                folder.removeClass('open');
                openFolders[folderNameFromHeading($target)] = false;
                setFileRowTabOrder();
            } else if ($target.closest('.file-browser-children').length) {
                event.preventDefault();
                var heading = $target.closest('.file-browser-folder').children('.file-browser-row').first();
                focusRow(heading[0]);
            }
        }
    });
    var fileBrowser = $('#file-browser');
    var resizer = $('#file-browser-resizer');
    var storedWidth = parseFloat(localStorage.getItem('fhirConverterFileBrowserWidth'));
    if (isFinite(storedWidth) && storedWidth >= 180 && storedWidth <= 480) {
        fileBrowser.css({width: storedWidth + 'px', 'flex-basis': storedWidth + 'px'});
    }
    function setFileBrowserCollapsed(collapsed, options) {
        var opts = options || {};
        var collapseBtn = $('#file-browser-collapse');
        var expandBtn = $('#file-browser-expand');
        if (collapsed) {
            fileBrowser.prop('hidden', true);
            resizer.prop('hidden', true);
            expandBtn.prop('hidden', false);
        } else {
            expandBtn.prop('hidden', true);
            fileBrowser.prop('hidden', false);
            resizer.prop('hidden', false);
        }
        collapseBtn.attr('aria-expanded', collapsed ? 'false' : 'true');
        expandBtn.attr('aria-expanded', collapsed ? 'false' : 'true');
        if (opts.persist !== false) {
            try {
                localStorage.setItem('fhirConverterFileBrowserCollapsed', collapsed ? 'true' : 'false');
            } catch (storageError) {
                // storage unavailable; keep working without persistence
            }
        }
        if (typeof refreshEditors === 'function') {
            refreshEditors();
        }
        if (opts.moveFocus === true) {
            (collapsed ? expandBtn : collapseBtn).focus();
        }
    }
    var storedCollapsed;
    try {
        var rawCollapsed = localStorage.getItem('fhirConverterFileBrowserCollapsed');
        if (rawCollapsed === null) {
            storedCollapsed = typeof window !== 'undefined' && window.innerWidth <= 960;
        } else {
            storedCollapsed = rawCollapsed === 'true';
        }
    } catch (storageError) {
        storedCollapsed = false;
    }
    setFileBrowserCollapsed(storedCollapsed, {persist: false, moveFocus: false});
    $('#file-browser-collapse').on('click', function () {
        setFileBrowserCollapsed(true, {moveFocus: true});
    });
    $('#file-browser-expand').on('click', function () {
        setFileBrowserCollapsed(false, {moveFocus: true});
    });
    $(document).on('keydown', function (event) {
        if (!((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey)) {
            return;
        }
        if (event.key !== 'b' && event.key !== 'B') {
            return;
        }
        if ($('.modal.show').length) {
            return;
        }
        event.preventDefault();
        setFileBrowserCollapsed(!fileBrowser.prop('hidden'), {moveFocus: false});
    });
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
