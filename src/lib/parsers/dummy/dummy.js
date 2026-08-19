// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import { parseString } from 'xml2js';
import dataHandler from '../../dataHandler/dataHandler.js';

export default class dummy extends dataHandler {
    constructor() {
        super("dummy");
    }

    parseSrcData(data) {
        return new Promise((fulfill, reject) => {
            parseString(data, { trim: true, explicitCharkey :true, mergeAttrs: true, explicitArray:false }, function (err, result) {
                if (err) {
                    reject(err);
                }
                result._originalData=data;
                fulfill(result);
            });
        });
    }

    preProcessTemplate(templateStr) {
        return super.preProcessTemplate(templateStr);
    }

    postProcessResult(inResult) {
        return super.postProcessResult(inResult);
    }

    getConversionResultMetadata(context) {
        return super.getConversionResultMetadata(context);
    }
}
