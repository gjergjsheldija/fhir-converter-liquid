// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import { getConversionValue } from "./conversionContext.js";
import { DEBUG_COLLECTOR_KEY } from "./debugCollector.js";
import { traceRender, recordFieldRead } from "./lineage.js";
import { setFieldReadHook } from "../parsers/hl7v2/coverage-array.js";

let activeDebugRenders = 0;
const debugContextProxies = new WeakMap();
export const IS_DEBUG_CTX_PROXY = Symbol('IS_DEBUG_CTX_PROXY');

// Per-request debug collector lookup (undefined outside an active ?debug=true conversion).
export function getDebugCollector() {
    return getConversionValue(DEBUG_COLLECTOR_KEY);
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

export function instrumentLiquidRenderer(engine) {
    const originalRenderTemplates = engine.renderer.renderTemplates.bind(engine.renderer);
    engine.renderer.renderTemplates = function (templates, ctx, emitter) {
        const collector = getDebugCollector();
        if (!collector) {
            return originalRenderTemplates(templates, ctx, emitter);
        }
        let partialName = null;
        if (collector.pendingPartial) {
            partialName = collector.takePendingPartial();
            collector.recordPartialRender(partialName, ctx);
        }
        const debugCtx = ctx && ctx[IS_DEBUG_CTX_PROXY]
            ? ctx
            : wrapDebugContext(collector, ctx);
        const rendering = originalRenderTemplates(templates, debugCtx, emitter);
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
}
