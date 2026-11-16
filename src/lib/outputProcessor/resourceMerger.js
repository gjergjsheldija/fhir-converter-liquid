// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import deepmerge from 'deepmerge';
import {uniq} from 'underscore';
import {createHash} from 'crypto';
import {ReplaceText} from './resourceMover.js';

// The specific id produced by filters/generateUuid.js when its input resolves to null/empty:
// SHA256("null") formatted as a version-4 FHIR Guid. Upstream Expected fixtures never use this
// value as a resource id — instead they OMIT the resource whose id would be the "hash of null".
// Every `Resource/*` partial (Device/Organization/Account/...) emits `"id":"<sentinel>"` for such an
// empty-id resource, so up to one extra, individually-unique resource appears per bundle. Its value
// is also embedded legitimately elsewhere (references, fullUrl, request.url), so this guard must
// drop only the top-level `entry` resource whose *id* is the sentinel — never embedded references.
export const NULL_RESOURCE_ID = '984e2374-e7af-8f49-b5da-f1f36ac2d78a';
// ResourceTypes whose null-id resource is omitted upstream (kept as the sentinel elsewhere as a
// reference). Account/DiagnosticReport/etc. are deliberately EXCLUDED: upstream keeps those with a
// real id, so the local engine must not drop them — it must instead generate that real id.
const SKIP_RESOURCE_TYPES = new Set(['Device', 'Organization']);
// An entry carries this sentinel as its resource id exactly when its fullUrl is
// `urn:uuid:<sentinel>`, so keying on fullUrl avoids a regex over resource bodies.
const FULL_URL_SENTINEL = `urn:uuid:${NULL_RESOURCE_ID}`;

export function Process(jsonObj, replacementDictionary) {
    try {
        let mergedEntry = [];
        let resourceKeyToIndexMap = {};

        if (Object.prototype.hasOwnProperty.call(jsonObj, 'entry')) {
            for (var item of jsonObj.entry) {
                // Upstream omits a resource entirely when its id would resolve to the "hash of
                // null" sentinel. The local `Resource/*` partials instead emit that sentinel as the
                // resource id, so drop the extra entry here — but only a top-level entry whose fullUrl
                // is `urn:uuid:<sentinel>`, never embedded references to that id.
                if (isSentinelIdEntry(item)) {
                    continue;
                }
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

function isSentinelIdEntry(entry) {
    const fullUrl = entry.fullUrl;
    const isSentinel = fullUrl === FULL_URL_SENTINEL;
    const res = entry.resource;
    const bareSentinel = res && res.id === NULL_RESOURCE_ID;
    if (!isSentinel && !bareSentinel) return false;
    // Only drop the extra resource when its type is one upstream omits (Device/Organization). Leave
    // every other type (e.g. Account, which upstream keeps with a real id) intact.
    const rt = (res && res.resourceType) || (entry.resource && entry.resource.resourceType);
    return !!rt && SKIP_RESOURCE_TYPES.has(rt);
}

const merge = (r1, r2) => {
    const merged = deepmerge(r1, r2, {
        arrayMerge: concatAndDedup
    });
    return merged;
};

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
