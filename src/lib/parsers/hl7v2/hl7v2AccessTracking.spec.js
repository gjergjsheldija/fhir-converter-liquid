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
});
