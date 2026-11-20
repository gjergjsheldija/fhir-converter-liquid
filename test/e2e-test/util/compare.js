// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import { isDeepStrictEqual } from 'node:util';
import { ExtraDynamicFieldInterceptor } from './interceptors.js';
export const MAX_COMPARISION_DEPTH = 100;

const isPlainObject = (val) => {
    if (val === null || typeof val !== 'object') {
        return false;
    }
    const proto = Object.getPrototypeOf(val);
    return proto === Object.prototype || proto === null;
};

const union = (a, b) => [...new Set([...a, ...b])];

const xor = (a, b) => {
    const setA = new Set(a);
    const setB = new Set(b);
    return [
        ...[...setA].filter((x) => !setB.has(x)),
        ...[...setB].filter((x) => !setA.has(x))
    ];
};

const isEmpty = (arr) => arr.length === 0;

/**
 * Recursively sort object keys for stable JSON comparison.
 * This ensures property order doesn't affect comparison.
 */
const sortObjectKeys = (obj) => {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(sortObjectKeys);
    }
    const sorted = {};
    for (const key of Object.keys(obj).sort()) {
        sorted[key] = sortObjectKeys(obj[key]);
    }
    return sorted;
};

/**
 * Create a stable string key for sorting arrays of objects.
 * For FHIR Bundle entries, prioritizes resourceType to ensure entries
 * of the same type are grouped together during comparison.
 */
const stableStringify = (obj) => {
    // If this looks like a FHIR Bundle entry, prefix with resourceType
    // This ensures entries are grouped by type before content comparison
    const resourceType = obj?.resource?.resourceType;
    const prefix = resourceType ? `${resourceType}|` : '';
    return prefix + JSON.stringify(sortObjectKeys(obj));
};

export const getGroundTruthFileName = testCase => {
    if (testCase && testCase.templateFile && testCase.dataFile) {
        return `${testCase.templateFile}-${testCase.dataFile}.json`;
    }
    throw new Error(`The testCase should both have property [templateFile] and [dataFile].`);
};

const __compareContent = (propPrefix, left, right, depth) => {
    if (depth >= MAX_COMPARISION_DEPTH) {
        if (!isDeepStrictEqual(left, right)) {
            throw new Error(`The conversion result has different property: [${propPrefix}]`);
        }
        return true;
    }

    const objectFlag = isPlainObject(left) && isPlainObject(right);
    const arrayFlag = Array.isArray(left) && Array.isArray(right);

    if (objectFlag) {
        const leftPros = Object.keys(left);
        const rightPros = Object.keys(right);

        const totalPros = union(leftPros, rightPros);
        const leftDiffs = xor(leftPros, totalPros);
        const rightDiffs = xor(rightPros, totalPros);

        if (!isEmpty(leftDiffs)) {
            throw new Error(`The conversion result lacks these properties: [${propPrefix}[${leftDiffs.toString()}]]`);
        }
        else if (!isEmpty(rightDiffs)) {
            throw new Error(`The conversion result has these extra properties: [${propPrefix}[${rightDiffs.toString()}]]`);
        }
        else {
            return totalPros.every(prop => __compareContent(`${propPrefix}${prop}.`, left[prop], right[prop], depth + 1));
        }
    }
    // TODO: The array comparision can be done in a finer granularity
    else if (arrayFlag) {
        // Sort arrays using stable stringify (key-order independent)
        const sortedLeft = structuredClone(left).sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
        const sortedRight = structuredClone(right).sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
        // Use deep equality comparison (ignores property order)
        if (!isDeepStrictEqual(sortedLeft, sortedRight)) {
            throw new Error(`The conversion result has different property: [${propPrefix}Array]`);
        }
        return true;
    }
    else {
        if (isDeepStrictEqual(left, right)) {
            return true;
        }
        throw new Error(`The conversion result has different property: [${propPrefix}]`);
    }
};

export const compareContent = (content, groundTruth) => {
    if (typeof content !== 'string' || typeof groundTruth !== 'string') {
        throw new Error('The parameters must be both string type.');
    }

    const interceptor = new ExtraDynamicFieldInterceptor();
    const left = interceptor.handle(JSON.parse(content));
    const right = interceptor.handle(JSON.parse(groundTruth));
    return __compareContent('', left, right, 0);
};

export default {
    MAX_COMPARISION_DEPTH,
    getGroundTruthFileName,
    compareContent
};
