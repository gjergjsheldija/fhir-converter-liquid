// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

function getSegmentListsInternal(msg, segmentIds) {
    var ret = {};
    for (var i = 0; i < msg.meta.length; i++) {
        if (segmentIds.indexOf(msg.meta[i]) !== -1 && !!msg.data[i]) {
            if (ret[msg.meta[i]]) {
                ret[msg.meta[i]].push(msg.data[i]);
            } else {
                ret[msg.meta[i]] = [msg.data[i]];
            }
        }
    }
    return ret;
}

export function getSegmentLists(msg, segmentIdContent) {
    var segmentIds = segmentIdContent.split('|');
    return getSegmentListsInternal(msg, segmentIds);
}

export function getFirstSegments(msg, segmentIdContent) {
    var segmentIds = segmentIdContent.split('|');
    var ret = {};
    var inSegments = {};
    for (var s = 0; s < segmentIds.length; s++) {
        inSegments[segmentIds[s]] = true;
    }
    for (var i = 0; i < msg.meta.length; i++) {
        if (inSegments[msg.meta[i]] && !ret[msg.meta[i]]) {
            ret[msg.meta[i]] = msg.data[i];
        }
    }
    return ret;
}

export function getRelatedSegmentList(msg, parentSegment, childSegmentId) {
    var ret = {};
    var segOut = [];
    var parentFound = false;
    var childIndex = -1;

    for (var i = 0; i < msg.meta.length; i++) {
        if (msg.data[i] === parentSegment) {
            parentFound = true;
        } else if (parentFound && msg.meta[i].toUpperCase() === childSegmentId.toUpperCase()) {
            childIndex = i;
            break;
        }
    }

    if (childIndex > -1) {
        while (childIndex < msg.meta.length && msg.meta[childIndex].toUpperCase() === childSegmentId.toUpperCase()) {
            if (msg.data[childIndex]) {
                segOut.push(msg.data[childIndex]);
            }
            childIndex++;
        }
        ret[childSegmentId] = segOut;
    }

    return ret;
}

export function getParentSegment(msg, childSegment, childIndex, parentSegment) {
    var ret = {};
    var msgIndex = -1;
    var parentIndex = -1;
    var foundChildSegmentCount = -1;

    for (var i = 0; i < msg.meta.length; i++) {
        if (msg.meta[i].toUpperCase() === childSegment.toUpperCase()) {
            foundChildSegmentCount++;
            if (foundChildSegmentCount == childIndex) {
                msgIndex = i;
                break;
            }
        }
    }

    for (i = msgIndex; i > -1; i--) {
        if (msg.meta[i].toUpperCase() === parentSegment.toUpperCase()) {
            parentIndex = i;
            break;
        }
    }

    if (parentIndex > -1) {
        ret[parentSegment] = msg.data[parentIndex];
    }

    return ret;
}

export function hasSegments(msg, segmentIdContent) {
    var segmentIds = segmentIdContent.split('|');
    var exSeg = getSegmentListsInternal(msg, segmentIds);
    for (var s = 0; s < segmentIds.length; s++) {
        if (!exSeg[segmentIds[s]] || exSeg[segmentIds[s]].length == 0) {
            return false;
        }
    }
    return true;
}

export function splitDataBySegments(msg, segmentIdContent) {
    var results = [];
    var currentData = [];
    var currentMeta = [];
    var segmentIds = new Set(segmentIdContent.split('|').filter(function (id) { return id !== ''; }));

    var anyPresent = false;
    for (var m = 0; m < msg.meta.length; m++) {
        if (segmentIds.has(msg.meta[m])) {
            anyPresent = true;
            break;
        }
    }

    if (segmentIdContent === '' || !anyPresent) {
        results.push(msg);
        return results;
    }

    for (var i = 0; i < msg.meta.length; i++) {
        if (segmentIds.has(msg.meta[i])) {
            results.push({ data: currentData, meta: currentMeta });
            currentData = [];
            currentMeta = [];
        }
        currentData.push(msg.data[i]);
        currentMeta.push(msg.meta[i]);
    }

    if (currentMeta.length > 0) {
        results.push({ data: currentData, meta: currentMeta });
    }

    return results;
}
