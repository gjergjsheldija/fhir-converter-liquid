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
import { traceRender, recordFieldRead } from "./lineage.js";
import { setFieldReadHook } from "../parsers/hl7v2/coverage-array.js";
import { suppressStringIndexAccess } from "./stringIndexAccess.js";
import { applyDotLiquidEquality } from "./dotLiquidEquality.js";

var liquidInstances = {};
let activeDebugRenders = 0;
const debugContextProxies = new WeakMap();
const IS_DEBUG_CTX_PROXY = Symbol('IS_DEBUG_CTX_PROXY');

// Per-request debug collector lookup (undefined outside an active ?debug=true conversion).
// getNamespace returns the namespace the worker registered via createNamespace(CLS_NAMESPACE);
// if no namespace exists yet (e.g. unit tests that never import worker.js) the hooks are no-ops.
function getDebugCollector() {
    const namespace = getNamespace(CLS_NAMESPACE);
    return namespace ? namespace.get(DEBUG_COLLECTOR_KEY) : undefined;
}

function resolveHl7FieldPath(collector, allScope, paths) {
    if (typeof collector.lookupHl7Ref !== 'function' || paths.length === 0) {
        return null;
    }
    const rootVal = allScope[paths[0]];
    let ref = collector.lookupHl7Ref(rootVal);
    let fieldSlot = 1;
    if (!ref && typeof collector.isPlainContainer === 'function'
        && collector.isPlainContainer(rootVal) && paths.length >= 2) {
        ref = collector.lookupHl7Ref(rootVal[paths[1]]);
        fieldSlot = 2;
    }
    if (!ref) {
        return null;
    }
    if (ref.kind === 'segment') {
        const fIdx = paths[fieldSlot];
        if ((typeof fIdx === 'string' || typeof fIdx === 'number') && /^\d+$/.test(String(fIdx))) {
            return ref.seg + '.' + String(fIdx);
        }
        return null;
    }
    if (ref.kind === 'field' || ref.kind === 'component') {
        return ref.path;
    }
    return null;
}

function wrapDebugContext(collector, targetCtx) {
    if (!targetCtx || typeof targetCtx !== 'object') {
        return targetCtx;
    }
    const existing = debugContextProxies.get(targetCtx);
    if (existing) {
        return existing;
    }
    const proxy = new Proxy(targetCtx, {
        get(target, prop, receiver) {
            if (prop === IS_DEBUG_CTX_PROXY) {
                return true;
            }
            if (prop === '_get' && typeof target._get === 'function') {
                return function (paths, ...rest) {
                    let fieldPath = null;
                    if (Array.isArray(paths) && paths.length > 0) {
                        const all = typeof target.getAll === 'function' ? target.getAll() : {};
                        if (all.hl7v2Data && typeof collector.indexHl7Model === 'function') {
                            collector.indexHl7Model(all.hl7v2Data);
                        }
                        const rootKey = paths[0];
                        if (typeof rootKey === 'string' && rootKey.length > 0
                            && !Object.prototype.hasOwnProperty.call(all, rootKey)
                            && typeof collector.recordCaseMismatch === 'function') {
                            const lower = rootKey.toLowerCase();
                            const keys = Object.keys(all);
                            for (let i = 0; i < keys.length; i++) {
                                if (keys[i] !== rootKey && keys[i].toLowerCase() === lower) {
                                    collector.recordCaseMismatch({
                                        template: typeof collector.currentTemplate === 'function'
                                            ? collector.currentTemplate()
                                            : '__root__',
                                        read: rootKey,
                                        actual: keys[i]
                                    });
                                    break;
                                }
                            }
                        }
                        fieldPath = resolveHl7FieldPath(collector, all, paths);
                        if (fieldPath && (paths.includes('Value') || paths.includes('Subcomponents'))) {
                            recordFieldRead(collector, fieldPath);
                        }
                    }
                    const result = target._get(paths, ...rest);
                    if (fieldPath && Array.isArray(paths) && paths[paths.length - 1] === 'Repeats'
                        && Array.isArray(result) && typeof collector.indexFieldRepeats === 'function') {
                        collector.indexFieldRepeats(fieldPath, result);
                    }
                    return result;
                };
            }
            const val = Reflect.get(target, prop, receiver);
            return typeof val === 'function' ? val.bind(target) : val;
        }
    });
    debugContextProxies.set(targetCtx, proxy);
    debugContextProxies.set(proxy, proxy);
    return proxy;
}

function* runDebugRenderGenerator(collector, templateLabel, templates, rawCtx, partialName, emitter, inner) {
    if (activeDebugRenders === 0) {
        setFieldReadHook((path) => {
            const active = getDebugCollector();
            if (active) {
                recordFieldRead(active, path);
            }
        });
    }
    activeDebugRenders++;
    if (typeof collector.pushTemplate === 'function') {
        collector.pushTemplate(templateLabel);
    }
    try {
        if (typeof collector.scanTemplateSource === 'function'
            && Array.isArray(templates) && templates.length > 0
            && templates[0] && templates[0].token && typeof templates[0].token.input === 'string') {
            const scopeKeys = rawCtx && typeof rawCtx.getAll === 'function' ? Object.keys(rawCtx.getAll()) : [];
            collector.scanTemplateSource(templateLabel, templates[0].token.input, scopeKeys);
        }
        if (partialName && emitter && typeof emitter.buffer === 'string') {
            return yield* traceRender(collector, partialName, emitter, inner);
        }
        return yield* inner;
    } finally {
        if (typeof collector.popTemplate === 'function') {
            collector.popTemplate();
        }
        activeDebugRenders--;
        if (activeDebugRenders <= 0) {
            activeDebugRenders = 0;
            setFieldReadHook(null);
        }
    }
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
        const fallbackRoot = !strictOverridesOnly && options && options.fallbackTemplateDirectory
            ? path.resolve(options.fallbackTemplateDirectory)
            : null;
        // Read-only fallback: the project file wins; otherwise the same relative path under the fallback root.
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
                    const fallbackPath = resolveFallbackPath(templateFilePath, relativeName);
                    return applyDotLiquidCompatTransforms(
                        fs.readFileSync(fallbackPath || templateFilePath, "utf8")
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
                    return fs.existsSync(templateFilePath) ||
                        resolveFallbackPath(templateFilePath, relativeName) !== null;
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

        applyDotLiquidEquality(engine);
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
            if (!collector) {
                return originalRenderTemplates(templates, suppressStringIndexAccess(ctx), emitter);
            }
            let partialName = null;
            if (collector.pendingPartial) {
                partialName = collector.takePendingPartial();
                collector.recordPartialRender(partialName, ctx);
            }
            const debugCtx = ctx && ctx[IS_DEBUG_CTX_PROXY]
                ? ctx
                : wrapDebugContext(collector, suppressStringIndexAccess(ctx));
            const rendering = originalRenderTemplates(templates, debugCtx, emitter);
            // Result lineage + case-mismatch diagnostics (debug only): an include that writes
            // into a shared output buffer has its text span and direct HL7 field reads recorded.
            return runDebugRenderGenerator(
                collector,
                partialName || '__root__',
                templates,
                ctx,
                partialName,
                emitter,
                rendering
            );
        };

        liquidInstances[dataType] = engine;
    }

    return liquidInstances[dataType];
}
