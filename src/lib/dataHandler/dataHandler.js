// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import { Process } from '../outputProcessor/jsonProcessor.js';
import { Process as resourceMergerProcessor }  from '../outputProcessor/resourceMerger.js';
import {UnescapeHtml} from "../inputProcessor/specialCharProcessor.js";

export default class dataHandler {
    constructor(dataType) {
        this.dataType = dataType;
    }

    parseSrcData(data) {
        return new Promise((fulfill) => {
            fulfill(data);
        });
    }

    preProcessTemplate(templateStr) {
        return templateStr;
    }

    postProcessResult(inResult) {
        return resourceMergerProcessor(
            JSON.parse(
                UnescapeHtml(Process(inResult))
            ));
    }

    getConversionResultMetadata() {
        return {};
    }
}

