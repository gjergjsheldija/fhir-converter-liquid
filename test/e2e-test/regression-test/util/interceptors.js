// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------
import pkg from 'lodash';
const { isPlainObject, isArray } = pkg;

/**
 * Normalizes ISO8601 datetime strings with timezone offsets to UTC ('Z' suffix).
 * This handles fixture portability where timestamps may represent the same instant
 * but with different timezone representations (e.g., "11:26+02:15" vs "14:41+05:30").
 * @param {string} str - Potential datetime string
 * @returns {string} - UTC normalized string if valid datetime, otherwise original string
 */
function normalizeTimestampToUTC(str) {
    if (typeof str !== 'string') return str;
    
    // Match FHIR/ISO8601 datetime with timezone offset: YYYY-MM-DDTHH:MM:SS[.mmm]±HH:MM
    // Supports optional milliseconds (.mmm)
    const isoWithOffsetRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?([+-]\d{2}:\d{2})$/;
    if (!isoWithOffsetRegex.test(str)) return str;
    
    try {
        const date = new Date(str);
        if (isNaN(date.getTime())) return str;
        return date.toISOString().replace(/\.\d{3}Z$/, 'Z'); // Remove milliseconds for cleaner comparison
    } catch {
        return str;
    }
}

/**
 * Recursively normalizes all timestamp strings in an object/array to UTC
 */
function normalizeAllTimestamps(obj) {
    if (typeof obj === 'string') {
        return normalizeTimestampToUTC(obj);
    }
    if (isArray(obj)) {
        return obj.map(item => normalizeAllTimestamps(item));
    }
    if (isPlainObject(obj)) {
        const result = {};
        for (const key of Object.keys(obj)) {
            result[key] = normalizeAllTimestamps(obj[key]);
        }
        return result;
    }
    return obj;
}

/**
 * Sorts an array of FHIR identifiers by a stable key for comparison.
 * Uses system > type.coding[0].code > value as sort keys.
 * Also de-duplicates identifiers with identical content.
 */
function sortIdentifiers(identifiers) {
    if (!isArray(identifiers)) return identifiers;
    // De-duplicate by stringify (same content = same entry)
    const seen = new Set();
    const unique = identifiers.filter(id => {
        const key = JSON.stringify(id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    return unique.sort((a, b) => {
        const keyA = (a.system || '') + '|' + ((a.type?.coding?.[0]?.code) || '') + '|' + (a.value || '');
        const keyB = (b.system || '') + '|' + ((b.type?.coding?.[0]?.code) || '') + '|' + (b.value || '');
        return keyA.localeCompare(keyB);
    });
}

/**
 * Sorts an array of FHIR addresses by a stable key for comparison.
 * Uses use > city > postalCode > line[0] as sort keys.
 * Also de-duplicates addresses with identical content.
 */
function sortAddresses(addresses) {
    if (!isArray(addresses)) return addresses;
    // De-duplicate by stringify
    const seen = new Set();
    const unique = addresses.filter(addr => {
        const key = JSON.stringify(addr);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    return unique.sort((a, b) => {
        const keyA = (a.use || '') + '|' + (a.city || '') + '|' + (a.postalCode || '') + '|' + (a.line?.[0] || '');
        const keyB = (b.use || '') + '|' + (b.city || '') + '|' + (b.postalCode || '') + '|' + (b.line?.[0] || '');
        return keyA.localeCompare(keyB);
    });
}

/**
 * Normalizes identifier and address arrays in resources for stable comparison
 */
function normalizeArrayFields(obj) {
    if (isArray(obj)) {
        return obj.map(item => normalizeArrayFields(item));
    }
    if (isPlainObject(obj)) {
        const result = {};
        for (const key of Object.keys(obj)) {
            if (key === 'identifier' && isArray(obj[key])) {
                result[key] = sortIdentifiers(obj[key]);
            } else if (key === 'address' && isArray(obj[key])) {
                result[key] = sortAddresses(obj[key]);
            } else {
                result[key] = normalizeArrayFields(obj[key]);
            }
        }
        return result;
    }
    return obj;
}

class Interceptor {
    constructor (next) {
        this.__next = next;
    }

    handle (data) {
        if (!!this.__next && this.__next instanceof Interceptor) {
            return this.__next.handle(data);
        }
        return data;
    }
}

export class DoNothingInterceptor extends Interceptor {
    handle (data) {
        return super.handle(data);
    }
}

export class ExtraDynamicFieldInterceptor extends Interceptor {
    constructor (next) {
        super(next);
        this.__placeholder = 'removed';
        this.__removeUUIDResourceTypes = [
            'DocumentReference', 'Composition', 'Immunization', 'MedicationStatement',
            'Condition', 'Observation'
        ];
    }

    handle (data) {
        if (!isPlainObject(data)) {
            return data;
        }
        data = this.__handle(data);
        // Normalize all timestamps to UTC for comparison (handles timezone representation differences)
        data = normalizeAllTimestamps(data);
        // Normalize identifier and address arrays for stable ordering comparison
        data = normalizeArrayFields(data);
        return super.handle(data);
    }

    __handle (data) {
        if (!('entry' in data) || !isArray(data['entry'])) {
            return data;
        }
        const entries = data['entry'];

        for (const entry of entries) {
            if (!entry || !('resource' in entry) || !('resourceType' in entry['resource'])) {
                continue;
            }

            const resource = entry['resource'];
            this.__removeDocumentReference(resource);
            this.__removeSectionReferences(resource);
            this.__removeResourceIds(resource, entry);
            this.__normalizeProvenanceTextDiv(resource);
        }
        return data;
    }

    __normalizeProvenanceTextDiv(resource) {
        // Normalize dynamic timestamp in Provenance text.div
        if (resource['resourceType'] !== 'Provenance') {
            return;
        }
        if (resource['text'] && resource['text']['div']) {
            // Replace the dynamic timestamp with a placeholder
            // Pattern: "Resource bundle generated on YYYY-MM-DDTHH:MM:SS[.m{1-3}]Z"
            // Supports 0-3 millisecond digits to handle variations in expected files
            resource['text']['div'] = resource['text']['div'].replace(
                /Resource bundle generated on \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z/,
                'Resource bundle generated on TIMESTAMP_PLACEHOLDER'
            );
        }
    }

    __removeDocumentReference(resource) {
        if (resource['resourceType'] != 'DocumentReference') {
            return;
        }
        resource['date'] = this.__placeholder;

        // The zlib.gzip result will be different on different platforms, see https://stackoverflow.com/questions/26516369/zlib-gzip-produces-different-results-for-same-input-on-different-oses.
        // Hence the hash result will be different too, which will trigger NodeJS CI error and need to be removed.

        if (!('content' in resource) || !isArray(resource['content'])) {
            return;
        }
        for (const ele of resource['content']) {
            if ('attachment' in ele) {
                if ('hash' in ele['attachment']) {
                    ele['attachment']['hash'] = 'removed-hash';
                }
                if ('data' in ele['attachment']) {
                    ele['attachment']['data'] = 'removed-data';
                }
            }
        }
    }

    __removeSectionReferences(resource) {
        if (!('section' in resource)) {
            return;
        }
        for (const section of resource['section']) {
            if ('entry' in section) {
                for (let i = 0; i < section['entry'].length; ++ i) {
                    const item = section['entry'][i];
                    if ('reference' in item && this.__removeUUIDResourceTypes.some(e => item['reference'].includes(e))) {
                        section['entry'][i] = this.__placeholder;
                    }
                }
            }
        }
    }

    __removeResourceIds(resource, entry) {
        const request = ('request' in entry) ? entry['request'] : null;
        for (const rmUUIDType of this.__removeUUIDResourceTypes) {
            if (resource['resourceType'] != rmUUIDType) {
                continue;
            }

            entry['fullUrl'] = this.__placeholder;
            resource['id'] = this.__placeholder;

            if (request && ('url' in request)) {
                request['url'] = this.__placeholder;
            }
        }
    }
}

export default {
    DoNothingInterceptor,
    ExtraDynamicFieldInterceptor,
};
