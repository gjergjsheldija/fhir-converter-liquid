// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import { ok, equal } from 'assert';
import { makeCoverageArray, makeUndefinedAccessReporterArray } from './coverage-array.js';

describe('Utility Arrays', function () {
    it('should create a coverage array that records when an item has been accessed', function () {
        var coverageArray = makeCoverageArray();

        ok(coverageArray.accessed);
        equal(coverageArray.accessed.length, 0);

        coverageArray.push("new item");

        equal(coverageArray.accessed.length, 1);
        equal(coverageArray.accessed[0], false);

        coverageArray[0];

        equal(coverageArray.accessed[0], true);
    });

    it('should create an undefined access array that records when an index without a value is accessed', function () {
        var accessArray = makeUndefinedAccessReporterArray();

        ok(accessArray.undefinedFieldsAccessed);
        equal(accessArray.undefinedFieldsAccessed.length, 0);

        accessArray.push("new item");
        accessArray[0];

        equal(accessArray.undefinedFieldsAccessed.length, 0);

        accessArray[4];

        equal(accessArray.undefinedFieldsAccessed.length, 1);
        equal(accessArray.undefinedFieldsAccessed[0], 4);
    });

    it('should not record access for a non-numericly named record in an undefined access array', function () {
        var accessArray = makeUndefinedAccessReporterArray();

        accessArray['test'];

        equal(accessArray.undefinedFieldsAccessed.length, 0);
    });

    it('should handle a request for a symbol of undefined in an undefined access array', function () {
        var accessArray = makeUndefinedAccessReporterArray();

        accessArray[Symbol(undefined)];

        equal(accessArray.undefinedFieldsAccessed.length, 0);
    });
});