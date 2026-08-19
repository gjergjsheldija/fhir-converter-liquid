// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import * as constants from "./lib/constants/constants.js";
import {
    AVAILABLE_PARSERS,
    CODE_MIRROR_LOCATION,
    SAMPLE_DATA_LOCATION,
    STATIC_LOCATION,
    TEMPLATE_FILES_LOCATION
} from "./lib/constants/constants.js";
import dataHandlerFactory from "./lib/dataHandler/dataHandlerFactory.js";
import cookieParser from "cookie-parser";
import {errorCodes, errorMessage} from "./lib/error/error.js";
import bodyparser from "body-parser";
import swaggeruiexpress from "swagger-ui-express";
import swaggerJSDoc from "swagger-jsdoc";
import WorkerPool from "./lib/workers/workerPool.js";
import fileSystemCache from "./lib/fsCache/cache.js";
import customLogging from "./lib/logging/custom.js";
import promMid from "express-prom-bundle";
import express from "express";
import os from "os";
import {fileURLToPath} from "url";

const {json, text} = bodyparser;

const {serve, setup} = swaggeruiexpress;

const metricsMiddleware = promMid({includeMethod: true});

const __filename = fileURLToPath(import.meta.url);

export default function (app) {
    const workerPool = new WorkerPool(
        "./src/lib/workers/worker.js",
        os.cpus().length
    );
    let templateCache = new fileSystemCache(TEMPLATE_FILES_LOCATION);
    templateCache.init();
    let messageCache = new fileSystemCache(SAMPLE_DATA_LOCATION);
    messageCache.init();

    app.use(metricsMiddleware);
    app.use(customLogging());
    app.use(json({limit: "50mb", extended: true}));
    app.use(text({limit: "50mb", extended: true}));
    app.use(express.static(STATIC_LOCATION));
    app.use("/codemirror", express.static(CODE_MIRROR_LOCATION));

    // access function for constants (test instrumentation)
    app.getConstants = function () {
        return constants;
    };

    // access function for constants  (test instrumentation)
    app.setConstants = function (c) {
        templateCache = new fileSystemCache(c.TEMPLATE_FILES_LOCATION);
        messageCache = new fileSystemCache(c.SAMPLE_DATA_LOCATION);
        workerPool.broadcast({type: "constantsUpdated", data: JSON.stringify(c)});
    };

    const swaggerSpec = swaggerJSDoc({
        swaggerDefinition: {
            info: {
                title: "FHIR Converter API",
                // If changing the version update the checks in convert/hl7 and convert/hl7/:template
                version: "1.0",
            },
        },
        apis: [__filename],
    });

    app.use("/api-docs", serve, setup(swaggerSpec));

    app.get("/api-docs.json", (req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.send(swaggerSpec);
    });

    app.use(cookieParser());

    /**
     * @swagger
     * /api/v1/helpers:
     *   get:
     *     description: Lists available template helpers
     *     produces:
     *       - application/json
     *     responses:
     *       200:
     *         description: List of available template helpers
     *       401:
     *         description: Unauthorized
     */
    app.get("/api/v1/helpers", function (req, res) {
        res.json({helpers: [], note: "This converter uses Liquid templates. See liquidjs.com/filters for available filters."});
        res.status(200);
    });

    /**
     * @swagger
     * /api/v1/parsers:
     *   get:
     *     description: Lists available parsers
     *     produces:
     *       - application/json
     *     responses:
     *       200:
     *         description: List of available parsers
     *       401:
     *         description: Unauthorized
     */
    app.get("/api/v1/parsers", function (req, res) {
        if (dataHandlerFactory.listParsers(AVAILABLE_PARSERS).length == 0) {
            res.status(404);
            res.json(
                errorMessage(errorCodes.NotFound, "Unable to access parsers location")
            );
        } else {
            res.json(dataHandlerFactory.listParsers(AVAILABLE_PARSERS));
        }
    });

    /**
     * @swagger
     * /api/v1/sample-data:
     *   get:
     *     description: Lists available sample data
     *     produces:
     *       - application/json
     *     responses:
     *       200:
     *         description: List of available sample data
     *       401:
     *         description: Unauthorized
     */
    app.get("/api/v1/sample-data", function (req, res) {
        messageCache
            .keys()
            .then((files) =>
                res.json({
                    messages: files.map((f) => {
                        return {messageName: f};
                    }),
                })
            )
            .catch(() => {
                res.status(404);
                res.json(
                    errorMessage(
                        errorCodes.NotFound,
                        "Unable to access sample data location"
                    )
                );
            });
    });

    /**
     * @swagger
     * /api/v1/sample-data/{file}:
     *   get:
     *     description: Returns a specific sample data
     *     produces:
     *       - text/plain
     *     parameters:
     *       - name: file
     *         description: Name of a specific file
     *         in: path
     *         required: true
     *         type: string
     *     responses:
     *       200:
     *         description: A specific sample data
     *       401:
     *         description: Unauthorized
     */
    app.get("/api/v1/sample-data/:file(*)", function (req, res) {
        messageCache
            .get(req.params.file)
            .then((content) => res.end(content.toString()))
            .catch(() => {
                res.status(404);
                res.json(errorMessage(errorCodes.NotFound, "Sample data not found"));
            });
    });

    /**
     * @swagger
     * /api/v1/templates:
     *   get:
     *     description: Lists available templates
     *     produces:
     *       - application/json
     *     responses:
     *       200:
     *         description: List of available templates
     *       401:
     *         description: Unauthorized
     *       404:
     *         description: Templates not found
     */
    app.get("/api/v1/templates", function (req, res) {
        templateCache
            .keys()
            .then((files) =>
                res.json({
                    templates: files.map((f) => {
                        return {templateName: f};
                    }),
                })
            )
            .catch(() => {
                res.status(404);
                res.json(
                    errorMessage(
                        errorCodes.NotFound,
                        "Unable to access templates location"
                    )
                );
            });
    });

    /**
     * @swagger
     * /api/v1/templates/{file}:
     *   get:
     *     description: Returns a specific template
     *     produces:
     *       - text/plain
     *     parameters:
     *       - name: file
     *         description: Name of a specific file
     *         in: path
     *         required: true
     *         type: string
     *     responses:
     *       200:
     *         description: A specific template
     *       401:
     *         description: Unauthorized
     *       404:
     *         description: Not found
     */
    app.get("/api/v1/templates/:file(*)", function (req, res) {
        templateCache
            .get(req.params.file)
            .then((content) => res.end(content.toString()))
            .catch(() => {
                res.status(404);
                res.json(errorMessage(errorCodes.NotFound, "Template not found"));
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
     *             templateBase64:
     *               type: string
     *             srcDataBase64:
     *               type: string
     *             templatesOverrideBase64:
     *               type: string
     *           required:
     *             - templateBase64
     *             - srcDataBase64
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
    app.post("/api/v1/convert/:srcDataType", function (req, res) {
        const retUnusedSegments = req.query.unusedSegments == "true";
        const retInvalidAcces = req.query.invalidAccess == "true";
        workerPool
            .exec({
                type: "/api/convert/:srcDataType",
                srcDataType: req.params.srcDataType,
                srcDataBase64: req.body.srcDataBase64,
                templateBase64: req.body.templateBase64,
                templatesOverrideBase64: req.body.templatesOverrideBase64,
                timezone: req.headers.timezone,
            })
            .then((result) => {
                const resultMessage = result.resultMsg;
                if (!retUnusedSegments) {
                    delete resultMessage["unusedSegments"];
                }
                if (!retInvalidAcces) {
                    delete resultMessage["invalidAccess"];
                }
                res.status(result.status);
                res.json(resultMessage);
            });
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
    app.post("/api/v1/convert/:srcDataType/:template(*)", function (req, res) {
        const retUnusedSegments = req.query.unusedSegments == "true";
        const retInvalidAcces = req.query.invalidAccess == "true";
        workerPool
            .exec({
                type: "/api/convert/:srcDataType/:template",
                srcData: req.body.toString(),
                srcDataType: req.params.srcDataType,
                templateName: req.params.template,
                timezone: req.headers.timezone,
            })
            .then((result) => {
                const resultMessage = result.resultMsg;
                if (!retUnusedSegments) {
                    delete resultMessage["unusedSegments"];
                }
                if (!retInvalidAcces) {
                    delete resultMessage["invalidAccess"];
                }
                res.status(result.status);
                res.json(resultMessage);
            });
    });

    /**
     * @swagger
     * /health:
     *   get:
     *     description: Returns OK if the application is started and working
     *     produces:
     *       - json
     *     responses:
     *       200:
     *         description: A specific template
     *       404:
     *         description: Not found
     */
    app.get("/health", (req, res) => {
        const data = {
            status: "OK",
        };

        res.status(200).send(data);
    });

    /**
     * @swagger
     * /version:
     *   get:
     *     description: Returns build version of the service
     *     produces:
     *       - json
     *     responses:
     *       200:
     *         description: Build version returned
     *       404:
     *         description: Not found
     */
    app.get("/version", function (req, res) {
        let response = {};
        response.version = "12";
        res.status(200).json(response);
    });

    return app;
}
