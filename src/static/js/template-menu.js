// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------
/* eslint-disable no-undef, no-unused-vars */

function loadData(dataFile) {
    $.get(getUrl('sample-data', dataFile), function (data) {
        dataEditor.setValue(data);
        var slash = dataFile.indexOf('/');
        $('#message-name').text(slash === -1 ? dataFile : dataFile.substring(slash + 1));
        convertData(true);
    });
}

function loadParsersOptions() {
    $.getJSON(getUrl('parsers'), function (dataList) {
        $("#data-type-dropdown").html('');

        $.each(dataList, function (index, item) {
            const dataNameWithType = item.toUpperCase();

            $("#data-type-dropdown").append("<a class=\"dropdown-item\" href=\"#\" onClick=\"changeDataType('" + dataNameWithType + "');\">" + dataNameWithType + "</a>");
        });
    });
}

function loadTemplate(templateFile) {
    if (closeAllTemplates()) {
        addTab(templateFile, null);
    }
}

function closeAllTemplates(openDefault = false) {
    var okToClose;

    // Compare to cache while making sure line breaks are handled consistently
    if (openTemplates.reduce(
        (changesNotFound, template) => unchangedFromReference(template.name, template.data) && changesNotFound,
        true)) {
        okToClose = true;
    } else {
        okToClose = confirm('You have unsaved changes. Do you wish to discard changes?');
    }

    if (okToClose) {
        openTemplates.forEach(template => closeTab(template.name, true));
        openTemplates = [];
        currentTemplateReference = {};

        if (openDefault) {
            activeTemplate = {name: 'untitled', parent: null, data: '', active: true, marks: []};
            defaultTemplate = activeTemplate;
            openTemplates = [activeTemplate];
            currentTemplateReference = {untitled: ''};
            templateCodeEditor.setValue('');
            $('#template-tabs').html("<a class=\"nav-item nav-link font-weight-bold\" onclick=\"changeTab('untitled')\">untitled</a>");
            $('#template-open-name').text('untitled');
            $('#message-name').text('No sample');
            $('#unsaved-dot').attr('hidden', true);
        }
    }

    return okToClose;
}

function saveTemplate() {
    var reqBody = templateCodeEditor.getValue();
    var templateName = activeTemplate.name;

    $.ajax(templateFileUrl(templateName), {
        'data': reqBody,
        'type': 'PUT',
        'processData': false,
        'contentType': 'text/plain',
        'success': function () {
            currentTemplateReference[templateName] = reqBody;
            activeTemplate.data = reqBody;
            hideConversionError();
            updateUnsavedDot();
            refreshTemplateNames();
            if (typeof refreshFileBrowser === 'function') {
                refreshFileBrowser();
            }
        },
        'error': function (response) {
            var message = 'Unable to save the template.';
            if (response.responseJSON && response.responseJSON.error && response.responseJSON.error.message) {
                message = response.responseJSON.error.message;
            }
            showConversionError(message);
        }
    });
}

function loadDataOptions() {
    $.getJSON(getUrl('sample-data'), function (dataList) {
        $("#data-load-dropdown").html('');

        $.each(dataList.messages, function (index, item) {
            const dataNameWithType = item.messageName;

            if (dataNameWithType.startsWith(currentDataType)) {
                const dataName = dataNameWithType.substring(currentDataType.length + 1);
                $("#data-load-dropdown").append("<a class=\"dropdown-item\" href=\"#\" onClick=\"loadData('" + dataNameWithType + "');\">" + dataName + "</a>");
            }
        });
    });
}

function loadTemplateOptions() {
    $.getJSON(getUrl('templates'), function (templateList) {
        applyTemplateList(templateList.templates);

        $("#template-load-dropdown").html('');
        $.each(templateNames, function (index, item) {
            addToTemplateDropdown("#template-load-dropdown", item, item, 0);
        });
    });
}

var templateKeyPrefix = 'Hl7v2/';

function templateFileUrl(shortName) {
    return '/api/v1/templates/' + templateKeyPrefix + shortName;
}

function applyTemplateList(templates) {
    var names = templates.map(template => template.templateName);
    var match = names.find(name => name.toLowerCase().startsWith('hl7v2/'));
    if (match) {
        templateKeyPrefix = match.slice(0, match.indexOf('/') + 1);
    }
    templateNames = names
        .filter(name => name.toLowerCase().startsWith('hl7v2/'))
        .map(name => name.substring(name.indexOf('/') + 1));
}

function refreshTemplateNames() {
    $.ajax({url: getUrl('templates'), dataType: 'json', cache: false, success: function (templateList) {
        applyTemplateList(templateList.templates);
    }});
}

function addToTemplateDropdown(menuId, fullPath, templateName, level) {
    const baseMenuId = "template-load-dropdown-submenu-";
    const toggleId = "-toggle";
    const containerId = "-container";

    if (templateName.includes("/")) {
        var parent = templateName.split("/", 1)[0];
        templateName = templateName.substring(parent.length + 1);
        var childMenuId = "#" + baseMenuId + parent + "-" + level;

        var childMenu = $(childMenuId);
        if (childMenu.length === 0) {
            $(menuId).append(
                "<div id=\"" + childMenuId.substring(1) + containerId + "\" class=\"nav-item dropright\" role=\"menu\">"
                + "<a id=\"" + childMenuId.substring(1) + toggleId + "\" class=\"dropdown-item dropdown-toggle font-weight-bold\" href=\"#\" data-toggle=\"dropdown\" role=\"button\" aria-haspopup=\"true\" aria-expanded=\"false\">" + parent + "</a>"
                + "<div id=\"" + childMenuId.substring(1) + "\" class=\"dropdown-menu ml-0\"></div>"
                + "</div>");

            $(childMenuId + containerId).on("mouseenter", () => {
                $(childMenuId).addClass("show");
            });

            $(childMenuId + containerId).on("mouseleave", () => {
                $(childMenuId).removeClass("show");
            });

            $(childMenuId + toggleId).on("focus", () => {
                $(childMenuId).addClass("show");
            });

            $(childMenuId + toggleId).on("click", (e) => {
                $(this).next('div').toggle();
                e.stopPropagation();
                e.preventDefault();
            });
        }

        addToTemplateDropdown(childMenuId, fullPath, templateName, level + 1);
    } else {
        $(menuId).append("<a class=\"dropdown-item\" href=\"#\" onClick=\"loadTemplate('" + fullPath + "');\">" + templateName + "</a>");
    }
}

function isTemplateName(templateName) {
    return Array.isArray(templateNames) && templateNames.includes(templateName);
}
