// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------
import { readFileSync } from "fs";
import { join } from "path";
import { HL7V2_LIQUID_TEMPLATE_LOCATION } from "../../constants/constants.js";

let codeSystemMapping = null;

function loadMapping() {
    if (!codeSystemMapping) {
        const raw = readFileSync(join(HL7V2_LIQUID_TEMPLATE_LOCATION, "CodeSystem", "CodeSystem.json"), "utf8");
        codeSystemMapping = JSON.parse(raw).Mapping;
    }
    return codeSystemMapping;
}

export function getProperty(originalCode, mapping, property = "code") {
    if (!originalCode || !mapping || !property) return null;

    const map = loadMapping()[mapping];
    const codeMapping = (map && map[originalCode]) || (map && map["__default__"]);
    if (codeMapping && codeMapping[property] !== undefined) {
        return codeMapping[property];
    }
    return (property === "code" || property === "display") ? originalCode : null;
}
