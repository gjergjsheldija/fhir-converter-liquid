// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import deepmerge from 'deepmerge';
import {uniq} from 'underscore';
import {createHash} from 'crypto';
import {ReplaceText} from './resourceMover.js';

export function Process(jsonObj, replacementDictionary) {
    try {
        let mergedEntry = [];
        let resourceKeyToIndexMap = {};

        if (Object.prototype.hasOwnProperty.call(jsonObj, 'entry')) {
            for (var item of jsonObj.entry) {
                let resourceKey = getKey(item);
                if (Object.prototype.hasOwnProperty.call(resourceKeyToIndexMap, resourceKey)) {
                    let index = resourceKeyToIndexMap[resourceKey];
                    mergedEntry[index] = merge(ReplaceText(mergedEntry[index], replacementDictionary),
                        ReplaceText(item, replacementDictionary));
                } else {
                    mergedEntry.push(item);
                    resourceKeyToIndexMap[resourceKey] = mergedEntry.length - 1;
                }
            }

            delete jsonObj.entry;
            jsonObj['entry'] = mergedEntry;
        }

        return jsonObj;
    } catch (err) {
        return jsonObj;
    }
}

function merge(r1, r2) {
    const merged = deepmerge(r1, r2, {
        arrayMerge: concatAndDedup
    });
    return merged;
}

const concatAndDedup = (target, source) => {
    let destination = target.concat(source);
    destination = uniq(destination, false, function (item) {
        return createHash('md5').update(JSON.stringify(item)).digest('hex');
    });
    return destination;
};

function getKey(res) {
    if (Object.prototype.hasOwnProperty.call(res, 'resource')
        && Object.prototype.hasOwnProperty.call(res.resource, 'resourceType')) {
        let key = res.resource.resourceType;
        if (Object.prototype.hasOwnProperty.call(res.resource, 'meta')) {
            if (Object.prototype.hasOwnProperty.call(res.resource.meta, 'versionId')) {
                key = key.concat('_', res.resource.meta.versionId);
            }
        }
        if (Object.prototype.hasOwnProperty.call(res.resource, 'id')) {
            key = key.concat('_', res.resource.id);
        }
        return key;
    }
    return JSON.stringify(res);
}
