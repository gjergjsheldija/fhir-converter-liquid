// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------


import {join} from 'path';
import {readFile} from 'fs';
import Promise from 'promise';
import pkg from 'memory-cache';
import {
    CLS_NAMESPACE,
    TEMPLATE_FILES_LOCATION,
    TIMEZONE
} from '../constants/constants.js';
import {errorCodes, errorMessage} from '../error/error.js';
import {instance as _liquidInstance} from '../liquid-converter/liquid-converter.js';
import {HL7V2_LIQUID_TEMPLATE_LOCATION} from '../constants/constants.js';
import {workerTaskProcessor} from './workerUtils.js';
import dataHandlerFactory from '../dataHandler/dataHandlerFactory.js';
import pkg2 from 'cls-hooked';

const {clear, get, put} = pkg;

const {createNamespace} = pkg2;
var session = createNamespace(CLS_NAMESPACE);

var rebuildLiquidCache = true;

function GetLiquidInstance(dataTypeHandler, templatesMap) {
    let needToUseMap = templatesMap && Object.entries(templatesMap).length > 0 && templatesMap.constructor === Object;
    var instance = _liquidInstance(needToUseMap ? true : rebuildLiquidCache, dataTypeHandler, HL7V2_LIQUID_TEMPLATE_LOCATION, templatesMap);
    rebuildLiquidCache = needToUseMap ? true : false;

    return instance;
}

function expireCache() {
    rebuildLiquidCache = true;
    clear();
}

workerTaskProcessor((msg) => {
    return new Promise((fulfill, reject) => {
        session.run(() => {
            switch (msg.type) {
                case '/api/convert/:srcDataType': {
                    try {
                        const base64RegEx = /^[a-zA-Z0-9/\r\n+]*={0,2}$/;

                        if (!base64RegEx.test(msg.srcDataBase64)) {
                            reject({
                                'status': 400,
                                'resultMsg': errorMessage(errorCodes.BadRequest, "srcData is not a base 64 encoded string.")
                            });
                        }

                        if (!base64RegEx.test(msg.templateBase64)) {
                            reject({
                                'status': 400,
                                'resultMsg': errorMessage(errorCodes.BadRequest, "Template is not a base 64 encoded string.")
                            });
                        }

                        var templatesMap = undefined;
                        if (msg.templatesOverrideBase64) {
                            if (!base64RegEx.test(msg.templatesOverrideBase64)) {
                                reject({
                                    'status': 400,
                                    'resultMsg': errorMessage(errorCodes.BadRequest, "templatesOverride is not a base 64 encoded string.")
                                });
                            }
                            templatesMap = JSON.parse(Buffer.from(msg.templatesOverrideBase64, 'base64').toString());
                        }


                        var templateString = "";
                        if (msg.templateBase64) {
                            templateString = Buffer.from(msg.templateBase64, 'base64').toString();
                        }

                        try {
                            var b = Buffer.from(msg.srcDataBase64, 'base64');
                            var s = b.toString();
                        } catch (err) {
                            reject({
                                'status': 400,
                                'resultMsg': errorMessage(errorCodes.BadRequest, `Unable to parse input data. ${err.message}`)
                            });
                        }
                        var dataTypeHandler = dataHandlerFactory.createDataHandler(msg.srcDataType);

                        if (dataTypeHandler.dataType === 'hl7v2') {
                            let liquidInstance = GetLiquidInstance(dataTypeHandler, templatesMap);
                            session.set(TIMEZONE, msg.timezone);

                            dataTypeHandler.parseSrcData(s)
                                .then((parsedData) => {
                                    var dataContext = {msg: parsedData, hl7v2Data: parsedData.v2};
                                    if (templateString == null || templateString.length == 0) {
                                        var result = Object.assign(dataTypeHandler.getConversionResultMetadata(dataContext.msg), JSON.parse(JSON.stringify(dataContext.msg)));
                                        fulfill({'status': 200, 'resultMsg': result});
                                        return;
                                    }
                                    liquidInstance.parseAndRender(dataTypeHandler.preProcessTemplate(templateString), dataContext)
                                        .then((rendered) => {
                                            try {
                                                var result = dataTypeHandler.postProcessResult(rendered);
                                                fulfill({
                                                    'status': 200,
                                                    'resultMsg': Object.assign(dataTypeHandler.getConversionResultMetadata(dataContext.msg), {'fhirResource': result})
                                                });
                                            } catch (err) {
                                                reject({'status': 400, 'resultMsg': errorMessage(errorCodes.BadRequest, "Unable to create result: " + err.toString())});
                                            }
                                        })
                                        .catch((err) => {
                                            reject({'status': 400, 'resultMsg': errorMessage(errorCodes.BadRequest, "Unable to create result: " + err.toString())});
                                        });
                                })
                                .catch(err => {
                                    reject({
                                        'status': 400,
                                        'resultMsg': errorMessage(errorCodes.BadRequest, `Unable to parse input data. ${err.toString()}`)
                                    });
                                });
                        } else {
                            reject({
                                'status': 400,
                                'resultMsg': errorMessage(errorCodes.BadRequest, `Data type '${dataTypeHandler.dataType}' is not supported. This converter only supports HL7v2.`)
                            });
                        }
                    } catch (err) {
                        reject({'status': 400, 'resultMsg': errorMessage(errorCodes.BadRequest, `${err.toString()}`)});
                    }
                }
                    break;

                case '/api/convert/:srcDataType/:template': {
                    let srcData = msg.srcData;
                    let templateName = msg.templateName;
                    let srcDataType = msg.srcDataType;
                    let dataTypeHandler = dataHandlerFactory.createDataHandler(srcDataType);

                    if (!srcData || srcData.length == 0) {
                        reject({
                            'status': 400, 'resultMsg': errorMessage(errorCodes.BadRequest, "No srcData provided.")
                        });
                    }

                    if (dataTypeHandler.dataType === 'hl7v2') {
                        let liquidInstance = GetLiquidInstance(dataTypeHandler);
                        session.set(TIMEZONE, msg.timezone);

                        const getLiquidTemplate = (templateName) => {
                            return new Promise((fulfill, reject) => {
                                var template = get(templateName);
                                if (!template) {
                                    readFile(join(TEMPLATE_FILES_LOCATION, srcDataType, templateName), (err, templateContent) => {
                                        if (err) {
                                            reject({
                                                'status': 404,
                                                'resultMsg': errorMessage(errorCodes.NotFound, "Template not found")
                                            });
                                        } else {
                                            try {
                                                template = dataTypeHandler.preProcessTemplate(templateContent.toString());
                                                put(templateName, template);
                                                fulfill(template);
                                            } catch (convertErr) {
                                                reject({
                                                    'status': 400,
                                                    'resultMsg': errorMessage(errorCodes.BadRequest, "Error during template compilation. " + convertErr.toString())
                                                });
                                            }
                                        }
                                    });
                                } else {
                                    fulfill(template);
                                }
                            });
                        };

                        dataTypeHandler.parseSrcData(srcData)
                            .then((parsedData) => {
                                var dataContext = {msg: parsedData, hl7v2Data: parsedData.v2};
                                getLiquidTemplate(templateName)
                                    .then((preProcessedTemplate) => {
                                        liquidInstance.parseAndRender(preProcessedTemplate, dataContext)
                                            .then((rendered) => {
                                                try {
                                                    var result = dataTypeHandler.postProcessResult(rendered);
                                                    fulfill({
                                                        'status': 200,
                                                        'resultMsg': Object.assign(dataTypeHandler.getConversionResultMetadata(dataContext.msg), {'fhirResource': result})
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
                            .catch(err => {
                                reject({
                                    'status': 400,
                                    'resultMsg': errorMessage(errorCodes.BadRequest, `Unable to parse input data. ${err.toString()}`)
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
});
