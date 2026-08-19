// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import { equal } from 'assert';
import { Escape, Unescape } from './specialCharProcessor.js';

describe('specialCharProcessor', function () {
    var escapeTests = [
        {in: String.raw`\E`, out: String.raw`\\E`},
        {in: 'E"', out: 'E\\"'},
        {in: String.raw`\"E`, out: String.raw`\\\"E`},
    ];

    escapeTests.forEach(t => {
        it(`specialCharProcessor.Escape(${t.in}) should return ${t.out}`, function() {
            equal(Escape(t.in), t.out);
        });
    });

    var unescapeTests = [
        {in: String.raw`\E`, out: String.raw`\E`},
        {in: 'E"', out: 'E"'},
        {in: '\\"E', out: '"E'},
        {in: '\\\\E', out: '\\E'},
        {in: '\\\\"E', out: '\\"E'},
    ];

    unescapeTests.forEach(t => {
        it(`specialCharProcessor.Unescape(${t.in}) should return ${t.out}`, function() {
            equal(Unescape(t.in), t.out);
        });
    });
});