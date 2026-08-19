// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import { Liquid } from "liquidjs";
import fs from "fs";
import path from "path";
import evaluate from "./tags/evaluate.js";
import { external as filters } from "./liquid-helpers.js";
import {
    stripDoubleBraceInsideTags,
    normalizeDoubleDotToSingleDot,
    normalizeElseifTagName,
    normalizeTripleBraceOutput,
    normalizeMalformedOutputCloser,
    normalizeVariableNameTypos
} from "./dotLiquidCompat.js";

var liquidInstances = {};

export function instance(
    createNew,
    dataHandler,
    templateFilesLocation,
    currentContextTemplatesMap
) {
    if (createNew) {
        liquidInstances = {};
    }

    let dataType = dataHandler.dataType;

    if (!liquidInstances[dataType]) {
        const overrides = currentContextTemplatesMap || {};

        const engine = new Liquid({
            root: templateFilesLocation,
            extname: ".liquid",
            strictFilters: true,
            strictVariables: false,
            fs: {
                readFileSync(templateFilePath) {
                    let relativeName = templateFilePath
                        .replace(templateFilesLocation, "")
                        .replace(/^[/\\]/, "");
                    // Normalize path separators to forward slashes for override key matching
                    relativeName = relativeName.split(path.sep).join('/');
                    if (relativeName in overrides) {
                        return overrides[relativeName];
                    }
                    return normalizeVariableNameTypos(
                        normalizeMalformedOutputCloser(
                            normalizeTripleBraceOutput(
                                normalizeElseifTagName(
                                    normalizeDoubleDotToSingleDot(
                                        stripDoubleBraceInsideTags(
                                            fs.readFileSync(templateFilePath, "utf8")
                                        )
                                    )
                                )
                            )
                        )
                    );
                },
                existsSync(templateFilePath) {
                    let relativeName = templateFilePath
                        .replace(templateFilesLocation, "")
                        .replace(/^[/\\]/, "");
                    // Normalize path separators to forward slashes for override key matching
                    relativeName = relativeName.split(path.sep).join('/');
                    return relativeName in overrides || fs.existsSync(templateFilePath);
                },
                resolve(root, file, ext) {
                    // Mirrors upstream's TemplateLocalFileSystem.GetAbsoluteTemplatePath
                    // (Microsoft.Health.Fhir.Liquid.Converter.DotLiquids.TemplateLocalFileSystem):
                    //   - single-segment reference (root-level template): append ext, no underscore.
                    //   - multi-segment reference (sub-directory template): prepend "_" to the LAST
                    //     segment and append ext, UNLESS the reference is a code-mapping template
                    //     (ends with "CodeSystem/CodeSystem" or "ValueSet/ValueSet", case-insensitive),
                    //     in which case the last segment gets ".json" appended instead, no underscore.
                    if (file.endsWith(ext) || file.endsWith(".json")) {
                        return path.resolve(root, file);
                    }

                    const segments = file.split("/");

                    if (segments.length === 1) {
                        segments[0] = `${segments[0]}${ext}`;
                    } else {
                        const lastIndex = segments.length - 1;
                        const lowerFile = file.toLowerCase();
                        const isCodeMappingTemplate =
                            lowerFile.endsWith("codesystem/codesystem") ||
                            lowerFile.endsWith("valueset/valueset");

                        segments[lastIndex] = isCodeMappingTemplate
                            ? `${segments[lastIndex]}.json`
                            : `_${segments[lastIndex]}${ext}`;
                    }

                    return path.resolve(root, ...segments);
                },
                exists(templateFilePath) {
                    return Promise.resolve(this.existsSync(templateFilePath));
                },
                readFile(templateFilePath) {
                    return Promise.resolve(this.readFileSync(templateFilePath));
                },
                dirname(templateFilePath) {
                    return path.dirname(templateFilePath);
                },
                sep: path.sep
            }
        });

        engine.registerTag("evaluate", evaluate);
        filters.forEach((filter) => engine.registerFilter(filter.name, filter.func));

        liquidInstances[dataType] = engine;
    }

    return liquidInstances[dataType];
}
