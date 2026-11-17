// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------
/* eslint-disable no-undef, no-unused-vars */
function tabLabelHtml(templateName, closeHtml) {
    return templateName + "<span class=\"tab-dirty\" hidden></span>" + closeHtml;
}

function addTab(templateName, parentName) {
    if (!openTemplates.reduce((isOpen, template) => template.name === templateName ? true : isOpen, false)) {
        $.get(templateFileUrl(templateName), function (data) {
            currentTemplateReference[templateName] = data;

            var tabs = $('#template-tabs');
            var closeHtml = parentName
                ? "<button type=\"button\" class=\"close\" onclick=\"closeTab('" + templateName + "')\"><span>&times;</span></button>"
                : "";
            var tabHtml = "<a class=\"nav-item nav-link\" onclick=\"changeTab('" + templateName + "')\">" + tabLabelHtml(templateName, closeHtml) + "</a>";
            tabs.append(tabHtml);

            openTemplates.push({ name: templateName, parent: parentName, data: data, active: true, marks: [] });
            changeTab(templateName);
        });
    }
    else {
        changeTab(templateName);
    }
}

function changeTab(templateName) {
    var templateObj = openTemplates.find(template => template.name === templateName);

    if (templateObj) {
        var oldTab = getTab(activeTemplate.name);
        if (oldTab) {
            oldTab.removeClass('font-weight-bold');
        }

        openTemplates.forEach(template => template.active = false);
        templateObj.active = true;
        activeTemplate = templateObj;

        templateCodeEditor.setValue(templateObj.data);

        // TODO: This can be made more efficent. It shouldn't be nessisary to recheck the whole document after every load.
        underlinePartialTemplateNames(templateCodeEditor.getDoc());

        $('#template-open-name').text(templateName);
        var tab = getTab(templateName);
        if (tab) {
            tab.addClass('font-weight-bold');
        }
        if (typeof updateUnsavedDot === 'function') {
            updateUnsavedDot();
        }
        if (typeof renderIncludedPanel === 'function') {
            renderIncludedPanel();
        }
    }
}

function openLocalTemplate(templateName, text, dirty) {
    var existing = openTemplates.find(template => template.name === templateName);
    if (existing) {
        existing.data = text;
        currentTemplateReference[templateName] = dirty ? null : text;
        changeTab(templateName);
        return;
    }

    currentTemplateReference[templateName] = dirty ? null : text;
    var tabs = $('#template-tabs');
    tabs.append("<a class=\"nav-item nav-link\" onclick=\"changeTab('" + templateName + "')\">" + tabLabelHtml(templateName, "") + "</a>");
    openTemplates.push({name: templateName, parent: null, data: text, active: true, marks: []});
    changeTab(templateName);
}

function closeTab(templateName, force = false) {
    var canCloseTab = force;
    if (!force) {
        if (unchangedFromReference(templateName, openTemplates.find(template => template.name === templateName).data)) {
            canCloseTab = true;
        } else {
            canCloseTab = confirm('You have unsaved changes, closing template will lose changes.');
        }
    }

    if (canCloseTab) {
        var tabs = $('#template-tabs')[0];
        for (var tab of tabs.children) {
            if (tab.innerText.includes(templateName)) {
                tabs.removeChild(tab);
                break;
            }
        }

        if (activeTemplate.name === templateName && activeTemplate.parent) {
            changeTab(activeTemplate.parent);
        }

        var parent = openTemplates.find(template => template.name === templateName).parent;
        openTemplates.forEach(template => {
            if (template.parent === templateName) {
                template.parent = parent;
            }
        });

        openTemplates = openTemplates.filter(template => template.name !== templateName);
        delete currentTemplateReference[templateName];
    }
}

function renameTab(oldName, newName) {
    var tabs = $('#template-tabs')[0];
    for (var tab of tabs.children) {
        if (tab.innerText.includes(oldName)) {
            var regex = new RegExp(oldName, 'ig');
            tab.outerHTML = tab.outerHTML.replace(regex, newName);
        }
    }

    openTemplates.find(template => template.name === oldName).name = newName;
    openTemplates.forEach(template => {
        if (template.parent === oldName) {
            template.parent = newName;
        }
    });
}

function getTab(templateName) {
    var tabs = $('#template-tabs')[0];
    for (var tab of tabs.children) {
        if (tab.innerText.includes(templateName)) {
            return $(tab);
        }
    }
}