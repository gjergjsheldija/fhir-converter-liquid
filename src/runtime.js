// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import {pathToFileURL} from "url";
import express from "express";
import promMid from "express-prom-bundle";
import promClient from "prom-client";
import {createConversionRecorder} from "./lib/conversions/runConversion.js";
import customLogging from "./lib/logging/custom.js";
import logging from "./lib/logging/logging.js";
import {attachGracefulShutdown} from "./lib/server/lifecycle.js";
import WorkerPool from "./lib/workers/workerPool.js";
import jsonErrorHandler from "./middleware/errorHandler.js";
import {createAuthMiddlewares} from "./middleware/headlessAndAuth.js";
import requestContextMiddleware from "./middleware/requestContext.js";
import registerConvertRoutes from "./routes/convert.routes.js";
import registerCustomersRoutes from "./routes/customers.routes.js";
import registerFhirAndOpsRoutes from "./routes/fhirAndOps.routes.js";

let cachedMetricsMiddleware = null;

function getMetricsMiddleware() {
    if (!cachedMetricsMiddleware) {
        const promOptions = {includeMethod: true};
        if (promClient.register.getSingleMetric("http_request_duration_seconds")) {
            promOptions.promRegistry = new promClient.Registry();
        }
        cachedMetricsMiddleware = promMid(promOptions);
    }
    return cachedMetricsMiddleware;
}

function resolveWorkerPool(options = {}) {
    if (options.workerPool) {
        return options.workerPool;
    }
    if (options.pool) {
        return options.pool;
    }
    return new WorkerPool("./src/lib/workers/worker.js");
}

export function createRuntimeApp(options = {}) {
    const app = express();
    const workerPool = resolveWorkerPool(options);
    const recorder = createConversionRecorder();
    const {requireConvertKey, requireApiKey} = createAuthMiddlewares({
        auditConvert: recorder.auditConvert
    });
    const bodyLimit = options.bodyLimit || process.env.MAX_BODY_SIZE || "10mb";
    const enableSwagger = options.enableSwagger !== undefined
        ? options.enableSwagger
        : process.env.ENABLE_SWAGGER === "true";

    app.use(requestContextMiddleware);
    app.use(getMetricsMiddleware());
    app.use(customLogging());
    app.use(express.json({limit: bodyLimit, type: ["application/json", "application/*+json"]}));
    app.use(express.text({limit: bodyLimit, type: ["text/plain", "application/hl7-v2", "x-application/hl7-v2+er7"]}));

    registerConvertRoutes(app, {
        workerPool,
        recorder,
        requireConvertKey,
        requireApiKey,
        enableProjectConvert: false
    });
    registerCustomersRoutes(app, {
        workerPool,
        recorder,
        requireApiKey,
        secretResolver: options.secretResolver,
        customersRoot: options.customersRoot
    });
    registerFhirAndOpsRoutes(app, {
        requireApiKey,
        secretResolver: options.secretResolver,
        workerPool,
        enableSwagger
    });

    app.use(jsonErrorHandler);
    app.workerPool = workerPool;

    return app;
}

export default createRuntimeApp;

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
    const logger = logging();
    const app = createRuntimeApp();
    const port = process.env.PORT || 2019;

    const server = app.listen(port, function () {
        const host = server.address().address;
        logger.info(`HealthConverter runtime listening at http://${host}:${port}`);
    });

    attachGracefulShutdown({
        server,
        workerPool: app.workerPool,
        logger,
        onSighup: async () => {
            const {clearCustomerCache} = await import("./lib/customers/customerConfig.js");
            if (typeof clearCustomerCache === "function") {
                clearCustomerCache();
            }
            if (app.workerPool && typeof app.workerPool.broadcast === "function") {
                app.workerPool.broadcast({type: "templatesUpdated"});
            }
        }
    });
}
