// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import path, {join} from "path";
import {fileURLToPath} from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let serviceTemplateFolder = "../../service-templates";
let sampleDataFolder = "../../sample-data";

export const AVAILABLE_PARSERS = join(__dirname, "../parsers");
export const BASE_TEMPLATE_FILES_LOCATION = join(__dirname, "../../templates/");
export const TEMPLATE_FILES_LOCATION = join(__dirname, serviceTemplateFolder);
export const SAMPLE_DATA_LOCATION = join(__dirname, sampleDataFolder);
export const STATIC_LOCATION = join(__dirname, "../../static");
export const CODE_MIRROR_LOCATION = join(
    __dirname,
    "../../../node_modules/codemirror/"
);
export const MOVE_TO_GLOBAL_KEY_NAME = "_moveResourceToGlobalScope";
export const HL7V2_TEMPLATE_LOCATION = join(
    __dirname,
    serviceTemplateFolder,
    "hl7v2"
);
export const HL7V2_LIQUID_TEMPLATE_LOCATION = join(
    __dirname,
    serviceTemplateFolder,
    "Hl7v2"
);
export const HL7V2_DATA_LOCATION = join(__dirname, sampleDataFolder, "hl7v2");
export const CLS_NAMESPACE = "conversionRequest";
export const CLS_KEY_TEMPLATE_LOCATION = "templateLocation";
export const TIMEZONE = "TIMEZONE";

export let constants = [AVAILABLE_PARSERS, BASE_TEMPLATE_FILES_LOCATION, TEMPLATE_FILES_LOCATION, SAMPLE_DATA_LOCATION,
    STATIC_LOCATION, CODE_MIRROR_LOCATION, MOVE_TO_GLOBAL_KEY_NAME, HL7V2_TEMPLATE_LOCATION, HL7V2_LIQUID_TEMPLATE_LOCATION, HL7V2_DATA_LOCATION,
    CLS_NAMESPACE, CLS_KEY_TEMPLATE_LOCATION, TIMEZONE];
