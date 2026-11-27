// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import {existsSync, readFileSync} from "fs";
import {dirname, join, resolve} from "path";
import swaggerJSDoc from "swagger-jsdoc";
import swaggeruiexpress from "swagger-ui-express";
import {fileURLToPath} from "url";
import {
    BASE_TEMPLATE_FILES_LOCATION,
    TEMPLATE_FILES_LOCATION
} from "../lib/constants/constants.js";
import {errorCodes, errorMessage} from "../lib/error/error.js";
import {sendResource, validateResource} from "../lib/fhir/sendResource.js";
import {sendHl7v2ToGateway} from "../lib/hl7v2/sendHl7v2.js";

const {serve, setup} = swaggeruiexpress;

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(__dirname, "..");
const pkgVersion = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;

const swaggerSpec = swaggerJSDoc({
    swaggerDefinition: {
        info: {
            title: "FHIR Converter API",
            description: "Bidirectional HL7v2 / C-CDA <-> FHIR R4 Liquid converter with FHIR server delivery, HL7v2 REST gateway delivery, and Vault-backed per-customer pipelines.",
            // If changing the version update the checks in convert/hl7 and convert/hl7/:template
            version: "1.0"
        }
    },
    apis: [
        join(srcDir, "routes.js").replace(/\\/g, "/"),
        join(srcDir, "routes", "*.js").replace(/\\/g, "/")
    ]
});

function sendFhirError(req, res, err) {
    const status = err && err.status ? err.status : 400;
    const payload = errorMessage(
        status === 404 ? errorCodes.NotFound : errorCodes.BadRequest,
        err && err.message ? err.message : "FHIR request failed."
    );
    if (req && req.requestId) {
        payload.requestId = req.requestId;
    }
    if (err && err.phase) {
        payload.phase = err.phase;
    }
    if (err && err.detail) {
        payload.detail = err.detail;
    }
    res.status(status).json(payload);
}

function sendGatewayError(req, res, err) {
    const status = err && Number.isInteger(err.status) ? err.status : 400;
    const payload = errorMessage(
        status === 404 ? errorCodes.NotFound : errorCodes.BadRequest,
        err && err.message ? err.message : "HL7v2 gateway request failed."
    );
    if (req && req.requestId) {
        payload.requestId = req.requestId;
    }
    if (err && err.phase) {
        payload.phase = err.phase;
    }
    if (err && err.detail !== undefined) {
        payload.detail = err.detail;
    }
    res.status(status).json(payload);
}

function normalizeInlineAuth(body = {}) {
    if (body.auth && typeof body.auth === "object" && !Array.isArray(body.auth)) {
        return body.auth;
    }
    return body;
}

export default function registerFhirAndOpsRoutes(app, {requireApiKey, secretResolver, workerPool, enableSwagger = true}) {
    if (enableSwagger !== false) {
        app.use("/api-docs", serve, setup(swaggerSpec));

        app.get("/api-docs.json", (req, res) => {
            res.setHeader("Content-Type", "application/json");
            res.send(swaggerSpec);
        });
    }

    app.use("/api/v1/fhir", requireApiKey);

    /**
     * @swagger
     * /api/v1/fhir/send:
     *   post:
     *     summary: Sends a FHIR R4 resource or Bundle directly to a FHIR server
     *     description: Supports standard POST, conditional create (If-None-Exist), and conditional update (PUT?identifier=...) urn:uuid transactions, with bearer, basic, OAuth2 client_credentials, or Vault secretRef authentication.
     *     consumes:
     *       - application/json
     *     produces:
     *       - application/json
     *     parameters:
     *       - name: payload
     *         in: body
     *         required: true
     *         schema:
     *           type: object
     *           required:
     *             - baseUrl
     *             - resource
     *           properties:
     *             baseUrl:
     *               type: string
     *               example: https://hapi.fhir.org/baseR4
     *             resource:
     *               type: object
     *             conditional:
     *               type: boolean
     *             update:
     *               type: boolean
     *             auth:
     *               type: string
     *               description: Inline auth mode ('none', 'bearer', 'basic') or structured auth object with secretRef / oauth2_client_credentials
     *             token:
     *               type: string
     *             username:
     *               type: string
     *             password:
     *               type: string
     *     responses:
     *       200:
     *         description: FHIR server response metadata and body
     *       400:
     *         description: Invalid target URL, payload, or upstream FHIR error
     *       401:
     *         description: Unauthorized
     */
    app.post("/api/v1/fhir/send", function (req, res) {
        const body = req.body || {};
        if (body.conditional === true && body.update === true) {
            sendFhirError(req, res, Object.assign(new Error("Choose create or update, not both."), {status: 400}));
            return;
        }
        sendResource(body.baseUrl, body.resource, normalizeInlineAuth(body), {
            conditional: body.conditional === true,
            update: body.update === true,
            timeoutMs: body.timeoutMs,
            requestId: req.requestId,
            traceparent: req.traceparent,
            secretResolver
        })
            .then((result) => res.json(result))
            .catch((err) => sendFhirError(req, res, err));
    });

    /**
     * @swagger
     * /api/v1/fhir/validate:
     *   post:
     *     summary: Validates a FHIR R4 resource or Bundle against {baseUrl}/$validate
     *     consumes:
     *       - application/json
     *     produces:
     *       - application/json
     *     parameters:
     *       - name: payload
     *         in: body
     *         required: true
     *         schema:
     *           type: object
     *           required:
     *             - baseUrl
     *             - resource
     *           properties:
     *             baseUrl:
     *               type: string
     *             resource:
     *               type: object
     *             profile:
     *               type: string
     *     responses:
     *       200:
     *         description: OperationOutcome validation result
     *       400:
     *         description: Validation failed or invalid request
     *       401:
     *         description: Unauthorized
     */
    app.post("/api/v1/fhir/validate", function (req, res) {
        const body = req.body || {};
        validateResource(body.baseUrl, body.resource, normalizeInlineAuth(body), {
            profile: body.profile,
            timeoutMs: body.timeoutMs,
            requestId: req.requestId,
            traceparent: req.traceparent,
            secretResolver
        })
            .then((result) => {
                if (result.ok) {
                    res.json(result);
                    return;
                }
                const error = new Error(`FHIR server returned ${result.status}.`);
                error.status = 400;
                error.detail = result;
                throw error;
            })
            .catch((err) => sendFhirError(req, res, err));
    });

    /**
     * @swagger
     * /api/v1/hl7v2/send:
     *   post:
     *     summary: Sends a rendered HL7v2 message directly to a REST-exposed HL7v2 Gateway and verifies MSA ACK
     *     description: Supports json_envelope and raw_er7 wire formats, automatic Idempotency-Key from MSH-10, Vault secretRef or inline auth, and HL7v2 MSA/ERR Application ACK verification (AA/CA vs AE/AR).
     *     consumes:
     *       - application/json
     *     produces:
     *       - application/json
     *     parameters:
     *       - name: payload
     *         in: body
     *         required: true
     *         schema:
     *           type: object
     *           required:
     *             - gatewayUrl
     *             - hl7v2Message
     *           properties:
     *             gatewayUrl:
     *               type: string
     *               example: https://gw.hospital.example/api/v1/hl7v2/messages
     *             hl7v2Message:
     *               type: string
     *             format:
     *               type: string
     *               enum: [json_envelope, raw_er7]
     *               default: json_envelope
     *             requireApplicationAck:
     *               type: boolean
     *               default: true
     *             customerId:
     *               type: string
     *             correlationId:
     *               type: string
     *             auth:
     *               type: string
     *             token:
     *               type: string
     *             username:
     *               type: string
     *             password:
     *               type: string
     *     responses:
     *       200:
     *         description: Gateway accepted message (includes parsed MSA ACK)
     *       400:
     *         description: Invalid gateway URL or HL7v2 payload
     *       401:
     *         description: Unauthorized
     *       422:
     *         description: Gateway returned HL7v2 Application NACK (MSA|AE or MSA|AR)
     *       502:
     *         description: Downstream gateway HTTP/network failure
     */
    app.post("/api/v1/hl7v2/send", requireApiKey, function (req, res) {
        const body = req.body || {};
        const gatewayUrl = body.gatewayUrl || body.baseUrl;
        const hl7v2Message = body.hl7v2Message || body.message;
        sendHl7v2ToGateway(gatewayUrl, hl7v2Message, normalizeInlineAuth(body), {
            format: body.format || "json_envelope",
            requireApplicationAck: body.requireApplicationAck !== false,
            encoding: body.encoding,
            customerId: body.customerId,
            correlationId: body.correlationId,
            timeoutMs: body.timeoutMs,
            requestId: req.requestId,
            traceparent: req.traceparent,
            secretResolver
        })
            .then((result) => res.status(200).json(result))
            .catch((err) => sendGatewayError(req, res, err));
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
     *         description: Service healthy
     *       404:
     *         description: Not found
     */
    app.get("/health", (req, res) => {
        res.status(200).send({
            status: "OK"
        });
    });

    app.get("/healthz", (req, res) => {
        res.status(200).json({
            status: "OK"
        });
    });

    app.get("/readyz", (req, res) => {
        const poolReady = !workerPool || typeof workerPool.isReady !== "function" || workerPool.isReady();
        const templatesReady = existsSync(TEMPLATE_FILES_LOCATION) || existsSync(BASE_TEMPLATE_FILES_LOCATION);
        if (!poolReady || !templatesReady) {
            res.status(503).json({
                status: "NOT_READY"
            });
            return;
        }
        const payload = {status: "READY"};
        if (workerPool && typeof workerPool.stats === "function") {
            payload.workers = workerPool.stats();
        }
        res.status(200).json(payload);
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
        res.status(200).json({version: pkgVersion});
    });
}
