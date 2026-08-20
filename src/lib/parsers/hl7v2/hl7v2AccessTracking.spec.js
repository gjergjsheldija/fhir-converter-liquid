// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------
import { strictEqual } from 'assert';
import { parseHl7v2FieldModel } from './hl7v2FieldModel.js';
import { trackAccess, buildUnusedSegmentsReport } from './hl7v2AccessTracking.js';

const MSG = 'MSH|^~\\&|AccMgr|1|||20050110045504||ADT^A01|599102|P|2.3|||\rPID|1||111111||DUCK^DONALD^D';

describe('hl7v2AccessTracking', function () {
    it('should report PID as having unused components when nothing was read', function () {
        const tracked = trackAccess(parseHl7v2FieldModel(MSG));
        const report = buildUnusedSegmentsReport(tracked);
        const pidReport = report.find(r => r.type === 'PID');
        strictEqual(pidReport !== undefined, true);
    });

    it('should stop reporting a component once its Value is read, matching upstream IsAccessed semantics', function () {
        const tracked = trackAccess(parseHl7v2FieldModel(MSG));
        void tracked.data[1].Fields[3].Components[1].Value; // simulate a template touching PID.3
        const report = buildUnusedSegmentsReport(tracked);
        const pidReport = report.find(r => r.type === 'PID');
        const field3Entry = pidReport.field.find(f => f.index === 3);
        strictEqual(field3Entry, undefined);
    });

    it('should skip MSH fields 1-2 (field separator + encoding characters), matching upstream', function () {
        const tracked = trackAccess(parseHl7v2FieldModel(MSG));
        const report = buildUnusedSegmentsReport(tracked);
        const mshReport = report.find(r => r.type === 'MSH');
        if (mshReport) {
            strictEqual(mshReport.field.some(f => f.index === 1 || f.index === 2), false);
        }
    });

    it('should mark a component accessed through the plain numeric-index chain real templates use, not only via .Fields/.Components', function () {
        // Mirrors segmentFilters.getFirstSegments(), which returns the raw segment object
        // (msg.data[i]) directly, and real templates (e.g. src/templates/Hl7v2/ADT_A01.liquid's
        // `firstSegments.MSH.7.Value`) index into it by plain field number -- this never touches
        // the `.Fields`/`.Components` named properties at all. MSH.7 (date/time) is Fields[7]
        // ("20050110045504") in this message.
        const tracked = trackAccess(parseHl7v2FieldModel(MSG));
        void tracked.data[0][7].Value;
        const report = buildUnusedSegmentsReport(tracked);
        const mshReport = report.find(r => r.type === 'MSH');
        strictEqual(mshReport === undefined || mshReport.field.some(f => f.index === 7), false);
    });

    it('should not report a non-MSH segment\'s own field 0 (the segment name itself) as unused', function () {
        const tracked = trackAccess(parseHl7v2FieldModel(MSG));
        const report = buildUnusedSegmentsReport(tracked);
        const pidReport = report.find(r => r.type === 'PID');
        strictEqual(pidReport !== undefined, true);
        strictEqual(pidReport.field.some(f => f.index === 0), false);
    });

    it('should return the same non-empty report on a second call, not erase itself by reading component.Value through the tracking proxy', function () {
        const tracked = trackAccess(parseHl7v2FieldModel(MSG));
        const firstReport = buildUnusedSegmentsReport(tracked);
        const secondReport = buildUnusedSegmentsReport(tracked);
        strictEqual(firstReport.length > 0, true);
        strictEqual(secondReport.length, firstReport.length);
        strictEqual(JSON.stringify(secondReport), JSON.stringify(firstReport));
    });
});
