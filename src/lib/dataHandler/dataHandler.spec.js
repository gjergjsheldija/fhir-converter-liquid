// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import assert, { equal, fail } from 'assert';
import dataHandler from './dataHandler.js';

describe('dataHandler', function () {
    it('should successfully parse any data.', function (done) {
        let data = 'abcd';
        new dataHandler().parseSrcData('abcd')
            .then(result => {
                equal(data, result);
                done();
            })
            .catch(() => fail());
    });

    it('should get empty object for conversion metdata.', function () {
        var result = new dataHandler().getConversionResultMetadata('abc');
        assert(JSON.stringify({}), JSON.stringify(result));
    });
});