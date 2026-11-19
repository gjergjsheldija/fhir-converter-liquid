// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import { Liquid } from "liquidjs";
import { getNamespace } from "cls-hooked";
import fs from "fs";
import path from "path";
import evaluate from "./tags/evaluate.js";
import { external as filters } from "./liquid-helpers.js";
import { applyDotLiquidCompatTransforms } from "./dotLiquidCompat.js";
import { CLS_NAMESPACE } from "../constants/constants.js";
import { DEBUG_COLLECTOR_KEY } from "./debugCollector.js";
import { suppressStringIndexAccess } from "./stringIndexAccess.js";

var liquidInstances = {};

// Per-request debug collector lookup (undefined outside an active ?debug=true conversion).
// getNamespace returns the namespace the worker registered via createNamespace(CLS_NAMESPACE);
// if no namespace exists yet (e.g. unit tests that never import worker.js) the hooks are no-ops.
function getDebugCollector() {
    const namespace = getNamespace(CLS_NAMESPACE);
    return namespace ? namespace.get(DEBUG_COLLECTOR_KEY) : undefined;
}

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

        const engine = new Liquid({
            root: resolvedRoot,
            extname: ".liquid",
            strictFilters: true,
            strictVariables: false,
            fs: {
                readFileSync(templateFilePath) {
                    let relativeName = path.resolve(templateFilePath)
                        .replace(resolvedRoot, "")
                        .replace(/^[/\\]/, "");
                    // Normalize path separators to forward slashes for override key matching
                    relativeName = relativeName.split(path.sep).join('/');
                    // Partial-load marker for the opt-in debug collector: in this pipeline the
                    // ROOT template is parsed from a string, so every fs read during a render is
                    // a partial ({% include %} / {% evaluate %}). The wrapped renderer (below)
                    // consumes the marker when that partial's renderTemplates runs.
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
                    return applyDotLiquidCompatTransforms(
                        fs.readFileSync(templateFilePath, "utf8")
                    );
                },
                existsSync(templateFilePath) {
                    let relativeName = path.resolve(templateFilePath)
                        .replace(resolvedRoot, "")
                        .replace(/^[/\\]/, "");
                    // Normalize path separators to forward slashes for override key matching
                    relativeName = relativeName.split(path.sep).join('/');
                    if (relativeName in overrides) {
                        return true;
                    }
                    if (strictOverridesOnly) {
                        return false;
                    }
                    return fs.existsSync(templateFilePath);
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

        // Opt-in debug collector seam (?debug=true, Web UI only). The fs hook above marks
        // the partial being loaded; the ROOT template is parsed from a string and never
        // marks. When the marked partial's render runs, snapshot its Context scope so the
        // Web UI can show per-partial runtime values. Both {% include %} and the custom
        // {% evaluate %} tag reach here after their fs read (and after their hash values
        // are assigned to the child scope), so one wrapper covers both. Non-debug requests
        // pay nothing: getDebugCollector() is undefined outside an active debug conversion.
        const originalRenderTemplates = engine.renderer.renderTemplates.bind(engine.renderer);
        engine.renderer.renderTemplates = function (templates, ctx, emitter) {
            const collector = getDebugCollector();
            if (collector && collector.pendingPartial) {
                collector.recordPartialRender(collector.takePendingPartial(), ctx);
            }
            return originalRenderTemplates(templates, suppressStringIndexAccess(ctx), emitter);
        };

        liquidInstances[dataType] = engine;
    }

    return liquidInstances[dataType];
}
