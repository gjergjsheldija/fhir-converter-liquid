// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------
import dataHandler from '../../dataHandler/dataHandler.js';
import { parseHl7v2FieldModel } from './hl7v2FieldModel.js';
import { trackAccess, buildUnusedSegmentsReport } from './hl7v2AccessTracking.js';
import { applyDotLiquidCompatTransforms } from '../../liquid-converter/dotLiquidCompat.js';

export default class hl7v2Liquid extends dataHandler {
    constructor() {
        super("hl7v2");
    }

    parseSrcData(msg) {
        return new Promise((fulfill, reject) => {
            try {
                fulfill({ v2: trackAccess(parseHl7v2FieldModel(msg)) });
            } catch (err) {
                reject(err);
            }
        });
    }

    preProcessTemplate(templateStr) {
        return applyDotLiquidCompatTransforms(templateStr);
    }

    getConversionResultMetadata(context) {
        return {
            unusedSegments: buildUnusedSegmentsReport(context.v2)
        };
    }
}
