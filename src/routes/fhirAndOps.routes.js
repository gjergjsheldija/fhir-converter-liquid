// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import {readFileSync} from "fs";
import {dirname, join, resolve} from "path";
import swaggerJSDoc from "swagger-jsdoc";
import swaggeruiexpress from "swagger-ui-express";
import {fileURLToPath} from "url";
import {errorCodes, errorMessage} from "../lib/error/error.js";
import {sendResource, validateResource} from "../lib/fhir/sendResource.js";

const {serve, setup} = swaggeruiexpress;

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(__dirname, "..");
const pkgVersion = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;

const swaggerSpec = swaggerJSDoc({
    swaggerDefinition: {
        info: {
            title: "FHIR Converter API",
            // If changing the version update the checks in convert/hl7 and convert/hl7/:template
            version: "1.0"
        }
    },
    apis: [
        join(srcDir, "routes.js").replace(/\\/g, "/"),
        join(srcDir, "routes", "*.js").replace(/\\/g, "/")
    ]
});

function sendFhirError(res, err) {
    const status = err && err.status ? err.status : 400;
    const payload = errorMessage(
        status === 404 ? errorCodes.NotFound : errorCodes.BadRequest,
        err && err.message ? err.message : "FHIR request failed."
    );
    if (err && err.detail) {
        payload.detail = err.detail;
    }
    res.status(status).json(payload);
}

export default function registerFhirAndOpsRoutes(app, {requireApiKey}) {
    app.use("/api-docs", serve, setup(swaggerSpec));

    app.get("/api-docs.json", (req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.send(swaggerSpec);
    });

    app.use("/api/v1/fhir", requireApiKey);

    app.post("/api/v1/fhir/send", function (req, res) {
        const body = req.body || {};
        if (body.conditional === true && body.update === true) {
            sendFhirError(res, Object.assign(new Error("Choose create or update, not both."), {status: 400}));
            return;
        }
        sendResource(body.baseUrl, body.resource, body, {
            conditional: body.conditional === true,
            update: body.update === true
        })
            .then((result) => res.json(result))
            .catch((err) => sendFhirError(res, err));
    });

    app.post("/api/v1/fhir/validate", function (req, res) {
        const body = req.body || {};
        validateResource(body.baseUrl, body.resource, body, {profile: body.profile})
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
            .catch((err) => sendFhirError(res, err));
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
        res.status(200).send({
            status: "OK"
        });
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
