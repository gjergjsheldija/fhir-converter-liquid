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

export default function registerConvertRoutes(app, {workerPool, recorder, requireConvertKey, requireApiKey}) {
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
     *     description: Converts given data to FHIR using template
     *     produces:
     *       - application/json
     *     consumes:
     *       - text/plain
     *     parameters:
     *       - name: srcDataType
     *         description: Data type of the source (e.g. 'hl7v2')
     *         in: path
     *         required: true
     *         type: string
     *       - name: conversion
     *         description: Conversion task
     *         in: body
     *         required: true
     *         schema:
     *           type: object
     *           properties:
     *             srcData:
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
     *         description: Converted message
     *       400:
     *         description: Bad request
     *       401:
     *         description: Unauthorized
     */
    app.post("/api/v1/convert/:srcDataType", requireConvertKey(), function (req, res, next) {
        const flags = parseConversionQueryFlags(req.query);
        runConversion({
            workerPool,
            workerTask: {
                type: "/api/convert/:srcDataType",
                srcDataType: req.params.srcDataType,
                srcData: req.body.srcData,
                template: req.body.template,
                templatesOverride: req.body.templatesOverride,
                timezone: req.headers.timezone,
                debug: flags.retDebug
            },
            flags,
            auditContext: {
                srcData: req.body.srcData,
                template: req.body.template
            },
            recorder,
            recordFailure: true
        })
            .then(({status, resultMessage}) => {
                res.status(status).json(resultMessage);
            })
            .catch(next);
    });

    /**
     * @swagger
     * /api/v1/convert/{srcDataType}/{template}:
     *   post:
     *     description: Converts given data to FHIR using template
     *     produces:
     *       - application/json
     *     consumes:
     *       - text/plain
     *     parameters:
     *       - name: srcDataType
     *         description: Data type of the source (e.g. 'hl7v2')
     *         in: path
     *         required: true
     *         type: string
     *       - name: template
     *         description: Name of a specific template
     *         in: path
     *         required: true
     *         type: string
     *       - name: srcData
     *         description: the source data to convert
     *         in: body
     *         required: true
     *         schema:
     *           type: string
     *       - name: api-version
     *         in: query
     *         description: API version to use. The current version is 1.0. Previous versions, including passing no version, are deprecated.
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
     *         description: Converted message
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
        const srcData = req.body.toString();
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
                srcData,
                template: req.params.template
            },
            recorder,
            recordFailure: false
        })
            .then(({status, resultMessage}) => {
                res.status(status).json(resultMessage);
            })
            .catch(next);
    });

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
                    recordFailure: true
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
                recordFailure: true
            });

            res.status(status).json(resultMessage);
        } catch (err) {
            const status = err && Number.isInteger(err.status) ? err.status : 400;
            recorder.recordConversion(status, {error: {message: err && err.message}}, srcData, rawTemplate);
            sendProjectConvertError(res, err);
        }
    });
}
