/* eslint-disable no-undef, no-unused-vars */

var ICON_IDS = {
    'icon-message': true,
    'icon-template': true,
    'icon-partial': true,
    'icon-json': true,
    'icon-hl7': true,
    'icon-ccda': true,
    'icon-builtin': true,
    'icon-repo': true,
    'icon-folder': true,
    'icon-close': true,
    'icon-chevron-left': true,
    'icon-chevron-down': true,
    'icon-chevron-up': true,
    'icon-play': true,
    'icon-sparkle': true,
    'icon-fold-all': true,
    'icon-unfold-all': true
};

function icon(id) {
    if (typeof id !== 'string' || !ICON_IDS[id]) {
        return document.createElement('span');
    }
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '/icons.svg#' + id);
    svg.appendChild(use);
    return svg;
}
