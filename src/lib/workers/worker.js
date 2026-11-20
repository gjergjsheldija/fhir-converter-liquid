// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import { join } from 'path';
import { readFile } from 'node:fs/promises';
import {
    CCDA_LIQUID_TEMPLATE_LOCATION,
    HL7V2_LIQUID_TEMPLATE_LOCATION,
    TIMEZONE
} from '../constants/constants.js';
import { errorCodes, errorMessage } from '../error/error.js';
import { instance as _liquidInstance } from '../liquid-converter/liquid-converter.js';
import { runWithConversionContext } from '../liquid-converter/conversionContext.js';
import { parentPort } from 'worker_threads';
import { workerTaskProcessor } from './workerUtils.js';
import dataHandlerFactory from '../dataHandler/dataHandlerFactory.js';
import { summarizeCcda } from '../parsers/ccda/ccda.js';
import { Context, toPromise } from 'liquidjs';
import { createDebugCollector, serializeHl7v2Debug, DEBUG_COLLECTOR_KEY } from '../liquid-converter/debugCollector.js';
import { buildLineage } from '../liquid-converter/lineage.js';
import { segmentIdsFromMessage, undeclaredSegments } from '../parsers/hl7v2/declaredSegments.js';

const compiledTemplateCache = new Map();

var rebuildLiquidCache = true;

function GetLiquidInstance(dataTypeHandler, templatesMap, templateDirectory, strictOverridesOnly, fallbackTemplateDirectory) {
    const hasCustomProjectContext = Boolean(templateDirectory || strictOverridesOnly);
    const defaultRoot = dataTypeHandler.dataType === 'ccda' ? CCDA_LIQUID_TEMPLATE_LOCATION : HL7V2_LIQUID_TEMPLATE_LOCATION;
    const rootDir = templateDirectory || defaultRoot;
    let needToUseMap = hasCustomProjectContext || (templatesMap && Object.entries(templatesMap).length > 0 && templatesMap.constructor === Object);
    var instance = _liquidInstance(
        needToUseMap ? true : rebuildLiquidCache,
        dataTypeHandler,
        rootDir,
        templatesMap,
        { strictOverridesOnly: Boolean(strictOverridesOnly), fallbackTemplateDirectory }
    );
    rebuildLiquidCache = needToUseMap ? true : false;

    return instance;
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

            if (typeof s !== 'string') {
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
            if (dataTypeHandler.dataType === 'hl7v2' || isCcda) {
                let liquidInstance = GetLiquidInstance(
                    dataTypeHandler,
                    templatesMap,
                    msg.templateDirectory,
                    msg.strictOverridesOnly,
                    msg.fallbackTemplateDirectory
                );

                // Strictly opt-in debug metadata (Web UI ?debug=true). When active, a per-request
                // collector is stored on this request's conversion context so the liquid engine's
                // partial-render hooks (debugTelemetry.js) can attach to it. Non-debug requests
                // never create or store a collector and never pay for serialization.
                const collector = msg.debug === true ? createDebugCollector(isCcda ? '' : s) : null;
                const debugStartedAt = collector ? Date.now() : 0;

                runWithConversionContext(
                    {
                        [TIMEZONE]: msg.timezone,
                        ...(collector ? { [DEBUG_COLLECTOR_KEY]: collector } : {})
                    },
                    () => {
                        dataTypeHandler.parseSrcData(s)
                            .then((parsedData) => {
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

if (parentPort) {
    workerTaskProcessor((msg) => {
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

                    if (!srcData || srcData.length == 0) {
                        reject({
                            'status': 400,
                            'resultMsg': errorMessage(errorCodes.BadRequest, "No srcData provided.")
                        });
                        return;
                    }

                    if (dataTypeHandler.dataType === 'hl7v2') {
                        let liquidInstance = GetLiquidInstance(dataTypeHandler);

                        const getLiquidTemplate = async (name) => {
                            let template = compiledTemplateCache.get(name);
                            if (template) {
                                return template;
                            }
                            let templateContent;
                            try {
                                templateContent = await readFile(join(HL7V2_LIQUID_TEMPLATE_LOCATION, name));
                            } catch {
                                throw {
                                    'status': 404,
                                    'resultMsg': errorMessage(errorCodes.NotFound, "Template not found")
                                };
                            }
                            try {
                                template = dataTypeHandler.preProcessTemplate(templateContent.toString());
                                compiledTemplateCache.set(name, template);
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
                                    var dataContext = { msg: parsedData, hl7v2Data: parsedData.v2 };
                                    getLiquidTemplate(templateName)
                                        .then((preProcessedTemplate) => {
                                            liquidInstance.parseAndRender(preProcessedTemplate, dataContext)
                                                .then((rendered) => {
                                                    try {
                                                        var result = dataTypeHandler.postProcessResult(rendered);
                                                        fulfill({
                                                            'status': 200,
                                                            'resultMsg': Object.assign(dataTypeHandler.getConversionResultMetadata(dataContext.msg), { 'fhirResource': result })
                                                        });
                                                    } catch (convertErr) {
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
            }
        });
    });
}
