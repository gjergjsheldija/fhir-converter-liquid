// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import { Process } from '../outputProcessor/jsonProcessor.js';
import { Process as resourceMergerProcessor }  from '../outputProcessor/resourceMerger.js';
import {UnescapeHtml} from "../inputProcessor/specialCharProcessor.js";
import {applyDotLiquidCompatTransforms} from "../liquid-converter/dotLiquidCompat.js";

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
        // Root/top-level message-type templates arrive here as raw request-payload content,
        // never passing through liquid-converter.js's custom fs.readFileSync hook that
        // {% include %}/{% evaluate %}-loaded sub-templates get -- apply the same DotLiquid
        // compat transforms here so root templates get the same fixes. See dotLiquidCompat.js.
        return applyDotLiquidCompatTransforms(templateStr);
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

