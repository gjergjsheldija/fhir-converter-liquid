// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import express from "express";
import promMid from "express-prom-bundle";
import * as constants from "./lib/constants/constants.js";
import {
    CODE_MIRROR_LOCATION,
    REVERSE_SAMPLE_DATA_LOCATION,
    REVERSE_TEMPLATE_FILES_LOCATION,
    SAMPLE_DATA_LOCATION,
    STATIC_LOCATION,
    TEMPLATE_FILES_LOCATION,
    USER_REVERSE_SAMPLE_DATA_LOCATION,
    USER_SAMPLE_DATA_LOCATION
} from "./lib/constants/constants.js";
import {createConversionRecorder} from "./lib/conversions/runConversion.js";
import fileSystemCache from "./lib/fsCache/cache.js";
import customLogging from "./lib/logging/custom.js";
import WorkerPool from "./lib/workers/workerPool.js";
import jsonErrorHandler from "./middleware/errorHandler.js";
import {createAuthMiddlewares, headlessGuard} from "./middleware/headlessAndAuth.js";
import requestContextMiddleware from "./middleware/requestContext.js";
import registerConvertRoutes from "./routes/convert.routes.js";
import registerCustomersRoutes from "./routes/customers.routes.js";
import registerFhirAndOpsRoutes from "./routes/fhirAndOps.routes.js";
import registerProjectsRoutes from "./routes/projects.routes.js";
import registerStudioRoutes from "./routes/studio.routes.js";

const metricsMiddleware = promMid({includeMethod: true});

function resolveWorkerPool(poolOrOptions) {
    if (poolOrOptions && typeof poolOrOptions.exec === "function") {
        return poolOrOptions;
    }
    if (poolOrOptions && poolOrOptions.pool) {
        return poolOrOptions.pool;
    }
    if (poolOrOptions && poolOrOptions.workerPool) {
        return poolOrOptions.workerPool;
    }
    return new WorkerPool("./src/lib/workers/worker.js");
}

export default function (app, poolOrOptions) {
    const workerPool = resolveWorkerPool(poolOrOptions);
    const options = (poolOrOptions && typeof poolOrOptions === "object" && typeof poolOrOptions.exec !== "function")
        ? poolOrOptions
        : {};
    const studioState = {
        templateCache: new fileSystemCache(TEMPLATE_FILES_LOCATION),
        sampleDataLocation: SAMPLE_DATA_LOCATION,
        userSampleDataLocation: USER_SAMPLE_DATA_LOCATION,
        messageCache: new fileSystemCache(SAMPLE_DATA_LOCATION),
        reverseTemplateCache: new fileSystemCache(REVERSE_TEMPLATE_FILES_LOCATION),
        reverseSampleDataLocation: REVERSE_SAMPLE_DATA_LOCATION,
        userReverseSampleDataLocation: USER_REVERSE_SAMPLE_DATA_LOCATION,
        reverseMessageCache: new fileSystemCache(REVERSE_SAMPLE_DATA_LOCATION)
    };
    studioState.templateCache.init();
    studioState.messageCache.init();
    studioState.reverseTemplateCache.init().catch(() => {});
    studioState.reverseMessageCache.init().catch(() => {});

    const recorder = createConversionRecorder();
    const {requireConvertKey, requireApiKey} = createAuthMiddlewares({
        auditConvert: recorder.auditConvert
    });

    const bodyLimit = process.env.MAX_BODY_SIZE || "10mb";

    app.use(requestContextMiddleware);
    app.use(metricsMiddleware);
    app.use(customLogging());
    app.use(express.json({limit: bodyLimit, type: ["application/json", "application/*+json"]}));
    app.use(express.text({limit: bodyLimit, type: ["text/plain", "application/hl7-v2", "x-application/hl7-v2+er7"]}));
    app.use(headlessGuard);

    app.use(express.static(STATIC_LOCATION));
    app.use("/codemirror", express.static(CODE_MIRROR_LOCATION));

    // access function for constants (test instrumentation)
    app.getConstants = function () {
        return constants;
    };

    // access function for constants (test instrumentation)
    app.setConstants = function (c) {
        studioState.templateCache = new fileSystemCache(c.TEMPLATE_FILES_LOCATION);
        studioState.sampleDataLocation = c.SAMPLE_DATA_LOCATION;
        studioState.userSampleDataLocation = c.USER_SAMPLE_DATA_LOCATION;
        studioState.messageCache = new fileSystemCache(studioState.sampleDataLocation);
        studioState.reverseTemplateCache = new fileSystemCache(c.REVERSE_TEMPLATE_FILES_LOCATION || REVERSE_TEMPLATE_FILES_LOCATION);
        studioState.reverseSampleDataLocation = c.REVERSE_SAMPLE_DATA_LOCATION || REVERSE_SAMPLE_DATA_LOCATION;
        studioState.userReverseSampleDataLocation = c.USER_REVERSE_SAMPLE_DATA_LOCATION || USER_REVERSE_SAMPLE_DATA_LOCATION;
        studioState.reverseMessageCache = new fileSystemCache(studioState.reverseSampleDataLocation);
        workerPool.broadcast({type: "constantsUpdated", data: JSON.stringify(c)});
    };

    registerStudioRoutes(app, {studioState, requireApiKey});
    registerConvertRoutes(app, {workerPool, recorder, requireConvertKey, requireApiKey});
    registerCustomersRoutes(app, {
        workerPool,
        recorder,
        requireApiKey,
        secretResolver: options.secretResolver,
        customersRoot: options.customersRoot
    });
    registerProjectsRoutes(app, {requireApiKey});
    registerFhirAndOpsRoutes(app, {
        requireApiKey,
        secretResolver: options.secretResolver,
        workerPool
    });

    app.use(jsonErrorHandler);
    app.workerPool = workerPool;

    return app;
}
