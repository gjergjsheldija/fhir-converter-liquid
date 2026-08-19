// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import { strictEqual, deepStrictEqual } from 'assert';
import { countOccurences, findDuplicates } from './utils.js';

describe('testUtils', function () {
    it('Function countOccurences should return the number of occurrences', function () {
        var resources1 = ['Patient', 'Patient', 'Compositon'];
        var resources2 = ['Patient', 'Compositon'];
        var resources3 = ['Compositon'];
        strictEqual(countOccurences(resources1, 'Patient'), 2);
        strictEqual(countOccurences(resources2, 'Patient'), 1);
        strictEqual(countOccurences(resources3, 'Patient'), 0);
    });

    it('Function findDuplicates should return a list of duplicates', function () {
        var resources = ['Patient', 'Patient', 'Encounter', 'Compositon', 'Encounter'];
        var ids = ['Patient/1','Patient/2','Patient/3','Patient/4','Patient/5','Patient/5','Patient/5','Encounter/4'];
        deepStrictEqual(findDuplicates(resources), ['Patient', 'Encounter']);
        deepStrictEqual(findDuplicates(ids), ['Patient/5']);
    });
});