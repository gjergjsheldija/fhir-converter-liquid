// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------
import { strictEqual } from 'assert';
import { parseHl7v2FieldModel } from './hl7v2FieldModel.js';

describe('parseHl7v2FieldModel', function () {
    it("should keep a repeated field's top-level Value as the full raw text, matching upstream Hl7v2DataParser.ParseFields", function () {
        // PID.3 has two repetitions separated by '~': "111111~222222"
        // Uses \n as the segment separator deliberately (not \r) -- this task is independent of
        // Task 4 (bare-\r segment splitting), which hasn't landed yet when this task runs.
        const msg = 'MSH|^~\\&|AccMgr|1|||20050110045504||ADT^A01|599102|P|2.3|||\nPID|1||111111~222222||DUCK^DONALD^D';
        const result = parseHl7v2FieldModel(msg);
        const pidSegment = result.data[result.meta.indexOf('PID')];
        strictEqual(pidSegment.Fields[3].Value, '111111~222222');
        strictEqual(pidSegment.Fields[3].Repeats[0].Value, '111111');
        strictEqual(pidSegment.Fields[3].Repeats[1].Value, '222222');
    });

    it('should keep a non-repeated field Value unchanged (regression guard)', function () {
        const msg = 'MSH|^~\\&|AccMgr|1|||20050110045504||ADT^A01|599102|P|2.3|||\nPID|1||111111||DUCK^DONALD^D';
        const result = parseHl7v2FieldModel(msg);
        const pidSegment = result.data[result.meta.indexOf('PID')];
        strictEqual(pidSegment.Fields[3].Value, '111111');
        strictEqual(pidSegment.Fields[3].Repeats[0].Value, '111111');
    });

    it('should split segments on a bare carriage return, matching upstream Hl7v2DataUtility.SplitMessageToSegments', function () {
        const msg = 'MSH|^~\\&|AccMgr|1|||20050110045504||ADT^A01|599102|P|2.3|||\rPID|1||111111||DUCK^DONALD^D';
        const result = parseHl7v2FieldModel(msg);
        strictEqual(result.meta.length, 2);
        strictEqual(result.meta[0], 'MSH');
        strictEqual(result.meta[1], 'PID');
    });

    it('should split segments on CRLF, matching upstream', function () {
        const msg = 'MSH|^~\\&|AccMgr|1|||20050110045504||ADT^A01|599102|P|2.3|||\r\nPID|1||111111||DUCK^DONALD^D';
        const result = parseHl7v2FieldModel(msg);
        strictEqual(result.meta.length, 2);
    });

    it('should ignore empty segments from consecutive separators, matching RemoveEmptyEntries', function () {
        const msg = 'MSH|^~\\&|AccMgr|1|||20050110045504||ADT^A01|599102|P|2.3|||\r\rPID|1||111111||DUCK^DONALD^D';
        const result = parseHl7v2FieldModel(msg);
        strictEqual(result.meta.length, 2);
    });
});
