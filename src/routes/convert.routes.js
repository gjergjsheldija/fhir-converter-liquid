// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import {stat} from "fs/promises";
import {dirname, join, resolve, sep} from "path";
import {fileURLToPath} from "url";
import {flushFailureWrites, listFailures} from "../lib/conversions/failureLog.js";
import {
    parseConversionQueryFlags,
    readProjectTemplateSource,
    runConversion
} from "../lib/conversions/runConversion.js";
import {errorCodes, errorMessage} from "../lib/error/error.js";
import {prepareProjectConversion} from "../lib/projects/convertProject.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROJECTS_ROOT = join(__dirname, "../../projects");

function sendProjectConvertError(res, err) {
    const status = err && Number.isInteger(err.status) ? err.status : 400;
    const code = status === 404 ? errorCodes.NotFound : errorCodes.BadRequest;
    res.status(status).json(errorMessage(code, err && err.message ? err.message : "Project request failed."));
}

function prefersRawHl7v2(req) {
    const accept = String((req.headers && req.headers.accept) || "").toLowerCase();
    return accept.includes("application/hl7-v2") || accept.includes("x-application/hl7-v2+er7");
}

function normalizeAuditSrcData(srcData) {
    if (typeof srcData === "string") {
        return srcData;
    }
    if (srcData && typeof srcData === "object") {
        try {
            return JSON.stringify(srcData);
        } catch (err) {
            return "";
        }
    }
    return "";
}

function extractTemplateRouteSrcData(req) {
    if (req.params.srcDataType === "fhir") {
        if (typeof req.body === "string") {
            return req.body;
        }
        if (Buffer.isBuffer(req.body)) {
            return req.body.toString("utf8");
        }
        if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
            if (req.body.resourceType === "Bundle") {
                return req.body;
            }
            if (req.body.srcData !== undefined) {
                return req.body.srcData;
            }
            if (Object.keys(req.body).length === 0) {
                return "";
            }
            return req.body;
        }
        return "";
    }
    return req.body != null ? req.body.toString() : "";
}

export default function registerConvertRoutes(app, {workerPool, recorder, requireConvertKey, requireApiKey, enableProjectConvert = true}) {
    app.get("/api/v1/conversions/failures", requireApiKey, function (req, res) {
        flushFailureWrites().then(() => {
            res.status(200).json({
                failures: listFailures(50),
                failed: recorder.counts.failed,
                succeeded: recorder.counts.succeeded
            });
        });
    });

    /**
     * @swagger
     * /api/v1/convert/{srcDataType}:
     *   post:
     *     summary: Converts source data using an inline Liquid template (HL7v2/C-CDA -> FHIR or FHIR -> HL7v2)
     *     description: Supports srcDataType 'hl7v2' (returns fhirResource), 'ccda' (returns fhirResource), and 'fhir' (accepts a FHIR R4 Bundle JSON string or object and returns hl7v2Message).
     *     produces:
     *       - application/json
     *       - application/hl7-v2
     *     consumes:
     *       - application/json
     *       - application/fhir+json
     *     parameters:
     *       - name: srcDataType
     *         description: Source data type ('hl7v2', 'ccda', or 'fhir')
     *         in: path
     *         required: true
     *         type: string
     *         enum: [hl7v2, ccda, fhir]
     *       - name: conversion
     *         description: Conversion task envelope
     *         in: body
     *         required: true
     *         schema:
     *           type: object
     *           properties:
     *             srcData:
     *               description: Raw HL7v2/C-CDA string, or FHIR R4 Bundle JSON object/string when srcDataType is 'fhir'
     *               type: string
     *             template:
     *               type: string
     *             templatesOverride:
     *               type: object
     *           required:
     *             - srcData
     *       - name: api-version
     *         in: query
     *         description: API version to use.
     *         required: false
     *         type: string
     *       - name: unusedSegments
     *         in: query
     *         description: 'Flag about whether to return the "unusedSegments", only used in web portal'
     *         required: false
     *         type: boolean
     *       - name: invalidAccess
     *         in: query
     *         description: 'Flag about whether to return the "invalidAccess", only used in web portal'
     *         required: false
     *         type: boolean
     *       - name: debug
     *         in: query
     *         description: 'Flag about whether to return the "debugInfo" (runtime debug metadata), only used in web portal'
     *         required: false
     *         type: boolean
     *       - name: timezone
     *         in: header
     *         description: The timezone of the incoming message in numeric form, ex. +0400
     *         required: false
     *         type: string
     *     responses:
     *       200:
     *         description: Converted message ({ fhirResource } for hl7v2/ccda, or { hl7v2Message } for fhir)
     *       400:
     *         description: Bad request
     *       401:
     *         description: Unauthorized
     *       422:
     *         description: Missing required hospital correlation IDs when requireCorrelationIds is enabled
     */
    app.post("/api/v1/convert/:srcDataType", requireConvertKey(), function (req, res, next) {
        const flags = parseConversionQueryFlags(req.query);
        const body = req.body || {};
        runConversion({
            workerPool,
            workerTask: {
                type: "/api/convert/:srcDataType",
                srcDataType: req.params.srcDataType,
                srcData: body.srcData,
                template: body.template,
                templatesOverride: body.templatesOverride,
                customerContext: body.customerContext,
                requireCorrelationIds: body.requireCorrelationIds === true,
                timezone: req.headers.timezone,
                debug: flags.retDebug
            },
            flags,
            auditContext: {
                srcData: normalizeAuditSrcData(body.srcData),
                template: body.template
            },
            recorder,
            recordFailure: true,
            requestId: req.requestId
        })
            .then(({status, resultMessage}) => {
                if (status === 200 && req.params.srcDataType === "fhir" && prefersRawHl7v2(req) && resultMessage && typeof resultMessage.hl7v2Message === "string") {
                    res.status(200).type("application/hl7-v2; charset=utf-8").send(resultMessage.hl7v2Message);
                    return;
                }
                res.status(status).json(resultMessage);
            })
            .catch(next);
    });

    /**
     * @swagger
     * /api/v1/convert/{srcDataType}/{template}:
     *   post:
     *     summary: Converts source data using a named server template (HL7v2 -> FHIR or FHIR -> HL7v2)
     *     description: For srcDataType='hl7v2', send raw ER7 text/plain (e.g. template 'ADT_A01.liquid'). For srcDataType='fhir', send a self-contained FHIR R4 Bundle JSON (e.g. template 'MDM_T02', 'ADT_A03', or 'ORU_R01'). Set Accept to 'application/hl7-v2' to receive raw ER7 directly.
     *     produces:
     *       - application/json
     *       - application/hl7-v2
     *     consumes:
     *       - text/plain
     *       - application/hl7-v2
     *       - application/fhir+json
     *       - application/json
     *     parameters:
     *       - name: srcDataType
     *         description: Source data type ('hl7v2' or 'fhir')
     *         in: path
     *         required: true
     *         type: string
     *         enum: [hl7v2, fhir]
     *       - name: template
     *         description: Name of template (e.g. 'ADT_A01.liquid' for hl7v2, or 'MDM_T02' / 'ADT_A03' / 'ORU_R01' for fhir)
     *         in: path
     *         required: true
     *         type: string
     *       - name: srcData
     *         description: Raw HL7v2 text or FHIR R4 Bundle JSON object
     *         in: body
     *         required: true
     *         schema:
     *           type: object
     *       - name: api-version
     *         in: query
     *         description: API version to use. The current version is 1.0.
     *         required: false
     *         type: string
     *       - name: unusedSegments
     *         in: query
     *         description: 'Flag about whether to return the "unusedSegments", only used in web portal'
     *         required: false
     *         type: boolean
     *       - name: invalidAccess
     *         in: query
     *         description: 'Flag about whether to return the "invalidAccess", only used in web portal'
     *         required: false
     *         type: boolean
     *       - name: timezone
     *         in: header
     *         description: The timezone of the incoming message in numeric form, ex. +0400
     *         required: false
     *         type: string
     *     responses:
     *       200:
     *         description: Converted message ({ fhirResource } or { hl7v2Message }, or raw application/hl7-v2)
     *       400:
     *         description: Bad request
     *       401:
     *         description: Unauthorized
     *       404:
     *         description: Template not found
     */
    app.post("/api/v1/convert/:srcDataType/:template(*)", requireConvertKey((req) => req.params.template), function (req, res, next) {
        const flags = {
            ...parseConversionQueryFlags(req.query),
            retDebug: false
        };
        const srcData = extractTemplateRouteSrcData(req);
        runConversion({
            workerPool,
            workerTask: {
                type: "/api/convert/:srcDataType/:template",
                srcData,
                srcDataType: req.params.srcDataType,
                templateName: req.params.template,
                timezone: req.headers.timezone
            },
            flags,
            auditContext: {
                srcData: normalizeAuditSrcData(srcData),
                template: req.params.template
            },
            recorder,
            recordFailure: false,
            requestId: req.requestId
        })
            .then(({status, resultMessage}) => {
                if (status === 200 && req.params.srcDataType === "fhir" && prefersRawHl7v2(req) && resultMessage && typeof resultMessage.hl7v2Message === "string") {
                    res.status(200).type("application/hl7-v2; charset=utf-8").send(resultMessage.hl7v2Message);
                    return;
                }
                res.status(status).json(resultMessage);
            })
            .catch(next);
    });

    if (enableProjectConvert === false) {
        return;
    }

    app.post("/api/v1/projects/convert", requireConvertKey(), function (req, res) {
        const flags = parseConversionQueryFlags(req.query);
        const body = req.body || {};

        prepareProjectConversion(body)
            .then((prep) =>
                runConversion({
                    workerPool,
                    workerTask: {
                        type: "/api/convert/:srcDataType",
                        srcDataType: prep.srcDataType,
                        srcData: body.srcData,
                        template: body.template,
                        templatesOverride: prep.templatesOverride,
                        templateDirectory: prep.templateDirectory,
                        strictOverridesOnly: prep.strictOverridesOnly,
                        fallbackTemplateDirectory: prep.fallbackTemplateDirectory,
                        declaredSegments: prep.declaredSegments,
                        timezone: req.headers.timezone,
                        debug: flags.retDebug
                    },
                    flags,
                    projectRoot: prep.projectRoot,
                    auditContext: {
                        srcData: body.srcData,
                        template: body.template
                    },
                    recorder,
                    recordFailure: true,
                    requestId: req.requestId
                })
            )
            .then(({status, resultMessage}) => {
                res.status(status).json(resultMessage);
            })
            .catch((err) => {
                const status = err && Number.isInteger(err.status) ? err.status : 400;
                recorder.recordConversion(status, {error: {message: err && err.message}}, body.srcData, body.template);
                sendProjectConvertError(res, err);
            });
    });

    app.post("/api/v1/projects/:projectId/convert/:template(*)", requireConvertKey((req) => req.params.template), async function (req, res) {
        const flags = parseConversionQueryFlags(req.query);
        const rawTemplate = req.params.template || "";
        const projectId = req.params.projectId || "";

        let srcData = "";
        if (typeof req.body === "string") {
            srcData = req.body;
        } else if (Buffer.isBuffer(req.body)) {
            srcData = req.body.toString("utf8");
        } else if (req.body && typeof req.body === "object" && typeof req.body.srcData === "string") {
            srcData = req.body.srcData;
        }

        if (!/^[A-Za-z0-9._-]+$/.test(projectId) || projectId === "." || projectId === ".." || projectId.includes("..")) {
            const payload = errorMessage(errorCodes.BadRequest, "Invalid project ID.");
            recorder.recordConversion(400, payload, srcData, rawTemplate);
            res.status(400).json(payload);
            return;
        }

        const projectsBase = resolve(process.env.PROJECTS_ROOT || DEFAULT_PROJECTS_ROOT);
        const projectDir = resolve(projectsBase, projectId);
        if (!projectDir.startsWith(projectsBase + sep)) {
            const payload = errorMessage(errorCodes.BadRequest, "Invalid project ID.");
            recorder.recordConversion(400, payload, srcData, rawTemplate);
            res.status(400).json(payload);
            return;
        }

        let projectInfo = null;
        try {
            projectInfo = await stat(projectDir);
        } catch (err) {
            projectInfo = null;
        }
        if (!projectInfo || !projectInfo.isDirectory()) {
            const payload = errorMessage(errorCodes.NotFound, "Project not found.");
            recorder.recordConversion(404, payload, srcData, rawTemplate);
            res.status(404).json(payload);
            return;
        }

        if (!srcData || !srcData.trim()) {
            const payload = errorMessage(errorCodes.BadRequest, "No srcData provided.");
            recorder.recordConversion(400, payload, srcData, rawTemplate);
            res.status(400).json(payload);
            return;
        }

        try {
            const prep = await prepareProjectConversion({
                project: {kind: "local", path: projectDir},
                srcData,
                template: ""
            });

            const templateSource = await readProjectTemplateSource(prep, rawTemplate);
            if (templateSource === null) {
                const payload = errorMessage(errorCodes.NotFound, "Template not found");
                recorder.recordConversion(404, payload, srcData, rawTemplate);
                res.status(404).json(payload);
                return;
            }

            const {status, resultMessage} = await runConversion({
                workerPool,
                workerTask: {
                    type: "/api/convert/:srcDataType",
                    srcDataType: prep.srcDataType,
                    srcData,
                    template: templateSource,
                    templatesOverride: {},
                    templateDirectory: prep.templateDirectory,
                    strictOverridesOnly: false,
                    fallbackTemplateDirectory: prep.fallbackTemplateDirectory,
                    declaredSegments: prep.declaredSegments,
                    timezone: req.headers.timezone,
                    debug: flags.retDebug
                },
                flags,
                projectRoot: prep.projectRoot,
                auditContext: {
                    srcData,
                    template: rawTemplate
                },
                recorder,
                recordFailure: true,
                requestId: req.requestId
            });

            res.status(status).json(resultMessage);
        } catch (err) {
            const status = err && Number.isInteger(err.status) ? err.status : 400;
            recorder.recordConversion(status, {error: {message: err && err.message}}, srcData, rawTemplate);
            sendProjectConvertError(res, err);
        }
    });
}
