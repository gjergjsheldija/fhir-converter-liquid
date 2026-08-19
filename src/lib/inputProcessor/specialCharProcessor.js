// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import he from 'he';

let escapeRegex = /(\\|")/g;
let unescapeRegex = /(\\)(\\|")/g;

export function Escape (input) {
    return input.replace(escapeRegex, escaper);
}

export function Unescape (input) {
    return input.replace(unescapeRegex, unescaper);
}

export function UnescapeHtml (input) {
    return he.decode(input);
}

function escaper(match, p1) {
    return `\\${p1}`;
}

function unescaper(match, p1, p2) {
    return `${p2}`;
}