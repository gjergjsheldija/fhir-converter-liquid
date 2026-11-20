// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import { Liquid } from "liquidjs";
import fs from "fs";
import path from "path";
import evaluate from "./tags/evaluate.js";
import { external as filters } from "./liquid-helpers.js";
import { applyDotLiquidCompatTransforms } from "./dotLiquidCompat.js";
import { suppressStringIndexAccess } from "./stringIndexAccess.js";
import { applyDotLiquidEquality } from "./dotLiquidEquality.js";
import { getDebugCollector, instrumentLiquidRenderer } from "./debugTelemetry.js";

var liquidInstances = {};

export function instance(
    createNew,
    dataHandler,
    templateFilesLocation,
    currentContextTemplatesMap,
    options = {}
) {
    if (createNew) {
        liquidInstances = {};
    }

    let dataType = dataHandler.dataType;

    if (!liquidInstances[dataType]) {
        const overrides = currentContextTemplatesMap || {};
        const strictOverridesOnly = options && options.strictOverridesOnly === true;
        const resolvedRoot = path.resolve(templateFilesLocation || ".");
        const fallbackRoot = !strictOverridesOnly && options && options.fallbackTemplateDirectory
            ? path.resolve(options.fallbackTemplateDirectory)
            : null;
        const resolveFallbackPath = (templateFilePath, relativeName) => {
            if (!fallbackRoot || fs.existsSync(templateFilePath)) {
                return null;
            }
            const candidate = path.resolve(fallbackRoot, relativeName);
            if (!candidate.startsWith(fallbackRoot + path.sep)) {
                return null;
            }
            return fs.existsSync(candidate) ? candidate : null;
        };
        const toRelativeName = (templateFilePath) => path.resolve(templateFilePath)
            .replace(resolvedRoot, "")
            .replace(/^[/\\]/, "")
            .split(path.sep)
            .join("/");

        const engine = new Liquid({
            root: resolvedRoot,
            extname: ".liquid",
            strictFilters: true,
            strictVariables: false,
            fs: {
                readFileSync(templateFilePath) {
                    const relativeName = toRelativeName(templateFilePath);
                    const collector = getDebugCollector();
                    if (collector) {
                        collector.markPartialLoaded(relativeName);
                    }
                    if (relativeName in overrides) {
                        return relativeName.toLowerCase().endsWith(".json")
                            ? overrides[relativeName]
                            : applyDotLiquidCompatTransforms(overrides[relativeName]);
                    }
                    if (strictOverridesOnly) {
                        throw new Error(`ENOENT: template '${relativeName}' was not found in the open project.`);
                    }
                    const fallbackPath = resolveFallbackPath(templateFilePath, relativeName);
                    return applyDotLiquidCompatTransforms(
                        fs.readFileSync(fallbackPath || templateFilePath, "utf8")
                    );
                },
                existsSync(templateFilePath) {
                    const relativeName = toRelativeName(templateFilePath);
                    if (relativeName in overrides) {
                        return true;
                    }
                    if (strictOverridesOnly) {
                        return false;
                    }
                    return fs.existsSync(templateFilePath) ||
                        resolveFallbackPath(templateFilePath, relativeName) !== null;
                },
                resolve(root, file, ext) {
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

        applyDotLiquidEquality(engine);
        engine.registerTag("evaluate", evaluate);
        filters.forEach((filter) => engine.registerFilter(filter.name, filter.func));

        instrumentLiquidRenderer(engine);
        const renderWithTelemetry = engine.renderer.renderTemplates.bind(engine.renderer);
        engine.renderer.renderTemplates = function (templates, ctx, emitter) {
            return renderWithTelemetry(templates, ctx ? suppressStringIndexAccess(ctx) : ctx, emitter);
        };

        liquidInstances[dataType] = engine;
    }

    return liquidInstances[dataType];
}
