// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import { join } from 'path';
import { readFile } from 'node:fs/promises';
import {
    CCDA_LIQUID_TEMPLATE_LOCATION,
    FHIR_TO_HL7V2_LIQUID_TEMPLATE_LOCATION,
    HL7V2_LIQUID_TEMPLATE_LOCATION,
    TIMEZONE
} from '../constants/constants.js';
import { errorCodes, errorMessage } from '../error/error.js';
import { instance as _liquidInstance } from '../liquid-converter/liquid-converter.js';
import { runWithConversionContext } from '../liquid-converter/conversionContext.js';
import dataHandlerFactory from '../dataHandler/dataHandlerFactory.js';
import { summarizeCcda } from '../parsers/ccda/ccda.js';
import { summarizeHl7v2Output } from '../parsers/fhir/fhir.js';
import { Context, toPromise } from 'liquidjs';
import { createDebugCollector, serializeHl7v2Debug, DEBUG_COLLECTOR_KEY } from '../liquid-converter/debugCollector.js';
import { buildLineage } from '../liquid-converter/lineage.js';
import { segmentIdsFromMessage, undeclaredSegments } from '../parsers/hl7v2/declaredSegments.js';

const compiledTemplateCache = new Map();

var rebuildLiquidCache = false;
let lastCacheEpoch = 0;

function GetLiquidInstance(dataTypeHandler, templatesMap, templateDirectory, strictOverridesOnly, fallbackTemplateDirectory, debug = false) {
    const defaultRoot = dataTypeHandler.dataType === 'ccda'
        ? CCDA_LIQUID_TEMPLATE_LOCATION
        : dataTypeHandler.dataType === 'fhir'
            ? FHIR_TO_HL7V2_LIQUID_TEMPLATE_LOCATION
            : HL7V2_LIQUID_TEMPLATE_LOCATION;
    const rootDir = templateDirectory || defaultRoot;
    const shouldClearCache = rebuildLiquidCache;
    rebuildLiquidCache = false;
    return _liquidInstance(
        shouldClearCache,
        dataTypeHandler,
        rootDir,
        templatesMap,
        { strictOverridesOnly: Boolean(strictOverridesOnly), fallbackTemplateDirectory, debug: Boolean(debug) }
    );
}

function expireCache() {
    rebuildLiquidCache = true;
    compiledTemplateCache.clear();
}

// Exact mirror of liquidjs Liquid#parseAndRender (parse + new Context(scope, options,
// {sync: false}) + renderer.renderTemplates consumed with toPromise) -- produces
// byte-identical output to liquidInstance.parseAndRender -- but keeps the root Context
// around so an active debug collector can snapshot the root scope once the render
// completes (every {% assign %} in the root template is visible at that point). When
// collector is null this is behaviorally identical to the previous parseAndRender call.
function renderTemplateWithOptionalDebug(liquidInstance, preProcessedTemplate, dataContext, collector) {
    // Non-debug requests keep the exact previous code path (parseAndRender) -- zero
    // behavior or regression risk. Only an active collector needs the root Context.
    if (!collector) {
        return liquidInstance.parseAndRender(preProcessedTemplate, dataContext);
    }
    const templates = liquidInstance.parse(preProcessedTemplate);
    const ctx = new Context(dataContext, liquidInstance.options, { sync: false });
    // renderTemplates returns a generator iterator (not a Promise); toPromise consumes it
    // exactly like Liquid#parseAndRender does, resolving with the rendered string.
    return toPromise(liquidInstance.renderer.renderTemplates(templates, ctx)).then((rendered) => {
        collector.setRootScope(ctx);
        return rendered;
    });
}

export function convertInlineHl7v2(msg) {
    return new Promise((fulfill, reject) => {
        try {
            var s = msg.srcData;

            if (msg.srcDataType === 'fhir') {
                const isValidFhirInput = typeof s === 'string' || (s !== null && typeof s === 'object' && !Array.isArray(s));
                if (!isValidFhirInput) {
                    reject({
                        'status': 400,
                        'resultMsg': errorMessage(errorCodes.BadRequest, "srcData must be a JSON string or Bundle object.")
                    });
                    return;
                }
            } else if (typeof s !== 'string') {
                reject({
                    'status': 400,
                    'resultMsg': errorMessage(errorCodes.BadRequest, "srcData must be a string.")
                });
                return;
            }

            var templateString = "";
            if (msg.template) {
                templateString = msg.template;
            }

            var templatesMap = undefined;
            if (msg.templatesOverride) {
                if (msg.templatesOverride.constructor !== Object) {
                    reject({
                        'status': 400,
                        'resultMsg': errorMessage(errorCodes.BadRequest, "templatesOverride must be a JSON object.")
                    });
                    return;
                }
                templatesMap = msg.templatesOverride;
            }

            var dataTypeHandler = dataHandlerFactory.createDataHandler(msg.srcDataType);

            const isCcda = dataTypeHandler.dataType === 'ccda';
            const isFhir = dataTypeHandler.dataType === 'fhir';
            if (dataTypeHandler.dataType === 'hl7v2' || isCcda || isFhir) {
                let liquidInstance = GetLiquidInstance(
                    dataTypeHandler,
                    templatesMap,
                    msg.templateDirectory,
                    msg.strictOverridesOnly,
                    msg.fallbackTemplateDirectory,
                    msg.debug === true
                );

                // Strictly opt-in debug metadata (Web UI ?debug=true). When active, a per-request
                // collector is stored on this request's conversion context so the liquid engine's
                // partial-render hooks (debugTelemetry.js) can attach to it. Non-debug requests
                // never create or store a collector and never pay for serialization.
                const collector = msg.debug === true ? createDebugCollector((isCcda || isFhir) ? '' : s) : null;
                const debugStartedAt = collector ? Date.now() : 0;

                runWithConversionContext(
                    {
                        [TIMEZONE]: msg.timezone,
                        ...(collector ? { [DEBUG_COLLECTOR_KEY]: collector } : {})
                    },
                    () => {
                        dataTypeHandler.parseSrcData(s)
                            .then((parsedData) => {
                                if (isFhir) {
                                    const customerCtx = (msg.customerContext && typeof msg.customerContext === 'object' && !Array.isArray(msg.customerContext))
                                        ? msg.customerContext
                                        : {};
                                    const dataContext = {
                                        ...parsedData,
                                        msg: parsedData.bundle,
                                        customer: customerCtx
                                    };
                                    if (templateString == null || templateString.length == 0) {
                                        fulfill({
                                            'status': 200,
                                            'resultMsg': {
                                                bundleType: parsedData.bundle.type,
                                                entryCount: parsedData.entries.length
                                            }
                                        });
                                        return;
                                    }
                                    renderTemplateWithOptionalDebug(liquidInstance, dataTypeHandler.preProcessTemplate(templateString), dataContext, collector)
                                        .then((rendered) => {
                                            try {
                                                const hl7v2Message = dataTypeHandler.postProcessResult(rendered, {
                                                    requireCorrelationIds: Boolean(msg.requireCorrelationIds)
                                                });
                                                const metadata = dataTypeHandler.getConversionResultMetadata(parsedData, hl7v2Message);
                                                const resultMsg = Object.assign(metadata, { hl7v2Message });
                                                if (collector) {
                                                    resultMsg.debugInfo = collector.buildDebugInfo(Date.now() - debugStartedAt, null);
                                                    resultMsg.debugInfo.hl7v2Summary = summarizeHl7v2Output(hl7v2Message);
                                                }
                                                fulfill({ 'status': 200, 'resultMsg': resultMsg });
                                            } catch (err) {
                                                if (err && err.code === 'MissingCorrelationId') {
                                                    reject({
                                                        'status': 422,
                                                        'resultMsg': errorMessage(errorCodes.BadRequest, err.message)
                                                    });
                                                    return;
                                                }
                                                reject({
                                                    'status': 400,
                                                    'resultMsg': errorMessage(errorCodes.BadRequest, "Unable to create result: " + err.toString())
                                                });
                                            }
                                        })
                                        .catch((err) => {
                                            reject({
                                                'status': 400,
                                                'resultMsg': errorMessage(errorCodes.BadRequest, "Unable to create result: " + err.toString())
                                            });
                                        });
                                    return;
                                }

                                var dataContext = isCcda ? { msg: parsedData } : { msg: parsedData, hl7v2Data: parsedData.v2 };
                                if (templateString == null || templateString.length == 0) {
                                    var result = Object.assign(dataTypeHandler.getConversionResultMetadata(dataContext.msg), JSON.parse(JSON.stringify(dataContext.msg)));
                                    fulfill({ 'status': 200, 'resultMsg': result });
                                    return;
                                }
                                renderTemplateWithOptionalDebug(liquidInstance, dataTypeHandler.preProcessTemplate(templateString), dataContext, collector)
                                    .then((rendered) => {
                                        try {
                                            var result = dataTypeHandler.postProcessResult(rendered);
                                            // getConversionResultMetadata (the unusedSegments report) MUST run before
                                            // debugInfo is built: serializeHl7v2Debug performs marking reads
                                            // (field.Repeats) that are only safe once this response's report is
                                            // already built -- the tracked model is per-request, so those reads
                                            // cannot influence this response's unusedSegments.
                                            const metadata = dataTypeHandler.getConversionResultMetadata(dataContext.msg);
                                            const resultMsg = Object.assign(metadata, { 'fhirResource': result });
                                            if (collector) {
                                                resultMsg.debugInfo = collector.buildDebugInfo(Date.now() - debugStartedAt, isCcda ? null : serializeHl7v2Debug(s, dataContext.msg.v2));
                                                if (isCcda) {
                                                    resultMsg.debugInfo.parsedCcda = summarizeCcda(dataContext.msg);
                                                }
                                                resultMsg.debugInfo.lineage = buildLineage(collector.lineageRenders, rendered, result);
                                                if (!isCcda && Array.isArray(msg.declaredSegments)) {
                                                    resultMsg.debugInfo.undeclaredSegments = undeclaredSegments(segmentIdsFromMessage(s), msg.declaredSegments);
                                                }
                                            }
                                            fulfill({ 'status': 200, 'resultMsg': resultMsg });
                                        } catch (err) {
                                            reject({ 'status': 400, 'resultMsg': errorMessage(errorCodes.BadRequest, "Unable to create result: " + err.toString()) });
                                        }
                                    })
                                    .catch((err) => {
                                        reject({ 'status': 400, 'resultMsg': errorMessage(errorCodes.BadRequest, "Unable to create result: " + err.toString()) });
                                    });
                            })
                            .catch((err) => {
                                reject({
                                    'status': 400,
                                    'resultMsg': errorMessage(errorCodes.BadRequest, `Unable to parse input data. ${err.toString()}`)
                                });
                            });
                    }
                );
            } else {
                reject({
                    'status': 400,
                    'resultMsg': errorMessage(errorCodes.BadRequest, `Data type '${dataTypeHandler.dataType}' is not supported. This converter only supports HL7v2.`)
                });
            }
        } catch (err) {
            reject({ 'status': 400, 'resultMsg': errorMessage(errorCodes.BadRequest, `${err.toString()}`) });
        }
    });
}

function executeWorkerTask(msg) {
    return new Promise((fulfill, reject) => {
        switch (msg.type) {
            case '/api/convert/:srcDataType': {
                convertInlineHl7v2(msg).then(fulfill, reject);
            }
                break;

            case '/api/convert/:srcDataType/:template': {
                let srcData = msg.srcData;
                let templateName = msg.templateName;
                let srcDataType = msg.srcDataType;
                let dataTypeHandler = dataHandlerFactory.createDataHandler(srcDataType);
                const isFhir = dataTypeHandler.dataType === 'fhir';
                const hasSrcData = isFhir
                    ? ((typeof srcData === 'string' && srcData.length > 0) || (srcData !== null && typeof srcData === 'object' && !Array.isArray(srcData)))
                    : Boolean(srcData && srcData.length > 0);

                if (!hasSrcData) {
                    reject({
                        'status': 400,
                        'resultMsg': errorMessage(errorCodes.BadRequest, "No srcData provided.")
                    });
                    return;
                }

                if (dataTypeHandler.dataType === 'hl7v2' || isFhir) {
                    let liquidInstance = GetLiquidInstance(dataTypeHandler);
                    const templateRootDir = isFhir ? FHIR_TO_HL7V2_LIQUID_TEMPLATE_LOCATION : HL7V2_LIQUID_TEMPLATE_LOCATION;

                    const getLiquidTemplate = async (name) => {
                        const cacheKey = `${dataTypeHandler.dataType}:${name}`;
                        let template = compiledTemplateCache.get(cacheKey);
                        if (template) {
                            return template;
                        }
                        let templateContent;
                        try {
                            templateContent = await readFile(join(templateRootDir, name));
                        } catch {
                            if (isFhir && typeof name === 'string' && !name.endsWith('.liquid')) {
                                try {
                                    templateContent = await readFile(join(templateRootDir, `${name}.liquid`));
                                } catch {
                                    throw {
                                        'status': 404,
                                        'resultMsg': errorMessage(errorCodes.NotFound, "Template not found")
                                    };
                                }
                            } else {
                                throw {
                                    'status': 404,
                                    'resultMsg': errorMessage(errorCodes.NotFound, "Template not found")
                                };
                            }
                        }
                        try {
                            template = dataTypeHandler.preProcessTemplate(templateContent.toString());
                            compiledTemplateCache.set(cacheKey, template);
                            return template;
                        } catch (convertErr) {
                            throw {
                                'status': 400,
                                'resultMsg': errorMessage(errorCodes.BadRequest, "Error during template compilation. " + convertErr.toString())
                            };
                        }
                    };

                    runWithConversionContext({ [TIMEZONE]: msg.timezone }, () => {
                        dataTypeHandler.parseSrcData(srcData)
                            .then((parsedData) => {
                                const customerCtx = (msg.customerContext && typeof msg.customerContext === 'object' && !Array.isArray(msg.customerContext))
                                    ? msg.customerContext
                                    : {};
                                var dataContext = isFhir
                                    ? { ...parsedData, msg: parsedData.bundle, customer: customerCtx }
                                    : { msg: parsedData, hl7v2Data: parsedData.v2 };
                                getLiquidTemplate(templateName)
                                    .then((preProcessedTemplate) => {
                                        liquidInstance.parseAndRender(preProcessedTemplate, dataContext)
                                            .then((rendered) => {
                                                try {
                                                    if (isFhir) {
                                                        const hl7Result = dataTypeHandler.postProcessResult(rendered, {
                                                            requireCorrelationIds: Boolean(msg.requireCorrelationIds)
                                                        });
                                                        fulfill({
                                                            'status': 200,
                                                            'resultMsg': Object.assign(dataTypeHandler.getConversionResultMetadata(parsedData, hl7Result), { 'hl7v2Message': hl7Result })
                                                        });
                                                        return;
                                                    }
                                                    var result = dataTypeHandler.postProcessResult(rendered);
                                                    fulfill({
                                                        'status': 200,
                                                        'resultMsg': Object.assign(dataTypeHandler.getConversionResultMetadata(dataContext.msg), { 'fhirResource': result })
                                                    });
                                                } catch (convertErr) {
                                                    if (isFhir && convertErr && convertErr.code === 'MissingCorrelationId') {
                                                        reject({
                                                            'status': 422,
                                                            'resultMsg': errorMessage(errorCodes.BadRequest, convertErr.message)
                                                        });
                                                        return;
                                                    }
                                                    reject({
                                                        'status': 400,
                                                        'resultMsg': errorMessage(errorCodes.BadRequest, "Error during template evaluation. " + convertErr.toString())
                                                    });
                                                }
                                            })
                                            .catch((err) => {
                                                reject({
                                                    'status': 400,
                                                    'resultMsg': errorMessage(errorCodes.BadRequest, "Error during template evaluation. " + err.toString())
                                                });
                                            });
                                    }, (err) => {
                                        reject(err);
                                    });
                            })
                            .catch((err) => {
                                reject({
                                    'status': 400,
                                    'resultMsg': errorMessage(errorCodes.BadRequest, `Unable to parse input data. ${err.toString()}`)
                                });
                            });
                    });
                } else {
                    reject({
                        'status': 400,
                        'resultMsg': errorMessage(errorCodes.BadRequest, `Data type '${dataTypeHandler.dataType}' is not supported. This converter only supports HL7v2.`)
                    });
                }
            }
                break;

            case 'templatesUpdated': {
                expireCache();
                fulfill();
            }
                break;

            case 'constantsUpdated': {
                JSON.parse(msg.data);
                expireCache();
                fulfill();
            }
                break;

            default:
                fulfill();
                break;
        }
    });
}

export default async function handleWorkerTask(msg) {
    if (msg && typeof msg._cacheEpoch === 'number' && msg._cacheEpoch !== lastCacheEpoch) {
        expireCache();
        lastCacheEpoch = msg._cacheEpoch;
    }
    try {
        return await executeWorkerTask(msg);
    } catch (err) {
        return err instanceof Error ? err.message : err;
    }
}
