// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import {Parser} from 'xml2js';
import dataHandler from '../../dataHandler/dataHandler.js';

const TEXT_KEY = '_';

function prefixedName(name) {
    return name.replace(':', '_');
}

// Mirrors Newtonsoft SerializeXNode over the tree CcdaDataParser builds: attributes first
// (DictionaryJsonConverter removes the leading '@', so attribute `root` is the key `root`), each text node is a child element named '_', one child with a given
// name stays an object, repeated names become an array, an element with neither attributes
// nor children is null.
function convertElement(node, defaultNamespace) {
    const result = {};
    let hasContent = false;

    for (const [name, value] of Object.entries(node.$ || {})) {
        if (name.startsWith('xmlns:') && value === defaultNamespace) {
            continue;
        }
        result[name] = value;
        hasContent = true;
    }

    for (const child of node.$$ || []) {
        const isText = child['#name'] === '__text__';
        const key = isText ? TEXT_KEY : prefixedName(child['#name']);
        const converted = isText ? child._ : convertElement(child, defaultNamespace);
        hasContent = true;
        if (Object.prototype.hasOwnProperty.call(result, key)) {
            if (Array.isArray(result[key])) {
                result[key].push(converted);
            } else {
                result[key] = [result[key], converted];
            }
        } else {
            result[key] = converted;
        }
    }

    return hasContent ? result : null;
}

export function parseCcda(document) {
    if (typeof document !== 'string' || document.trim().length === 0) {
        return Promise.reject(new Error('C-CDA document must be a non-empty string.'));
    }
    const parser = new Parser({
        explicitChildren: true,
        preserveChildrenOrder: true,
        charsAsChildren: true,
        includeWhiteChars: false,
        explicitRoot: true,
        explicitArray: true,
        trim: false,
        normalize: false,
        xmlns: false
    });
    return parser.parseStringPromise(document).then((parsed) => {
        const rootName = Object.keys(parsed)[0];
        const root = parsed[rootName];
        const defaultNamespace = root.$ ? root.$.xmlns : undefined;
        return {
            [prefixedName(rootName)]: convertElement(root, defaultNamespace),
            _originalData: document.replace(/\r?\n/g, '').replace(/\r/g, '')
        };
    });
}

function summarizeElement(name, value) {
    const attributes = {};
    const children = [];
    let text = null;
    for (const [key, item] of Object.entries(value)) {
        if (key === TEXT_KEY) {
            if (typeof item === 'string') {
                text = item;
            } else if (Array.isArray(item)) {
                text = item.filter((part) => typeof part === 'string').join(' ');
            }
        } else if (typeof item === 'string') {
            attributes[key] = item;
        } else if (Array.isArray(item)) {
            for (const entry of item) {
                if (entry && typeof entry === 'object') {
                    children.push(summarizeElement(key, entry));
                } else if (typeof entry === 'string') {
                    children.push({name: key, attributes: {}, text: entry, children: []});
                }
            }
        } else if (item && typeof item === 'object') {
            children.push(summarizeElement(key, item));
        }
    }
    return {name, attributes, text, children};
}

// Element/attribute summary of a parseCcda result for the Web UI Debug drawer.
// An array becomes one child per item; a null element is skipped; _originalData is ignored.
export function summarizeCcda(parsed) {
    const rootName = Object.keys(parsed || {}).find((key) => key !== '_originalData');
    if (rootName === undefined) {
        return null;
    }
    return summarizeElement(rootName, parsed[rootName] || {});
}

export default class ccda extends dataHandler {
    constructor() {
        super('ccda');
    }

    parseSrcData(data) {
        return parseCcda(data);
    }
}
