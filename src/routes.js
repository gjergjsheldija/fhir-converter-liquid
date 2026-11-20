// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import express from "express";
import os from "os";
import promMid from "express-prom-bundle";
import * as constants from "./lib/constants/constants.js";
import {
    CODE_MIRROR_LOCATION,
    SAMPLE_DATA_LOCATION,
    STATIC_LOCATION,
    TEMPLATE_FILES_LOCATION,
    USER_SAMPLE_DATA_LOCATION
} from "./lib/constants/constants.js";
import {createConversionRecorder} from "./lib/conversions/runConversion.js";
import fileSystemCache from "./lib/fsCache/cache.js";
import customLogging from "./lib/logging/custom.js";
import WorkerPool from "./lib/workers/workerPool.js";
import {createAuthMiddlewares, headlessGuard} from "./middleware/headlessAndAuth.js";
import registerConvertRoutes from "./routes/convert.routes.js";
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
    return new WorkerPool("./src/lib/workers/worker.js", Math.max(1, os.cpus().length));
}

export default function (app, poolOrOptions) {
    const workerPool = resolveWorkerPool(poolOrOptions);
    const studioState = {
        templateCache: new fileSystemCache(TEMPLATE_FILES_LOCATION),
        sampleDataLocation: SAMPLE_DATA_LOCATION,
        userSampleDataLocation: USER_SAMPLE_DATA_LOCATION,
        messageCache: new fileSystemCache(SAMPLE_DATA_LOCATION)
    };
    studioState.templateCache.init();
    studioState.messageCache.init();

    const recorder = createConversionRecorder();
    const {requireConvertKey, requireApiKey} = createAuthMiddlewares({
        auditConvert: recorder.auditConvert
    });

    app.use(metricsMiddleware);
    app.use(customLogging());
    app.use(express.json({limit: "50mb"}));
    app.use(express.text({limit: "50mb"}));
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
        workerPool.broadcast({type: "constantsUpdated", data: JSON.stringify(c)});
    };

    registerStudioRoutes(app, {studioState, requireApiKey});
    registerConvertRoutes(app, {workerPool, recorder, requireConvertKey, requireApiKey});
    registerProjectsRoutes(app, {requireApiKey});
    registerFhirAndOpsRoutes(app, {requireApiKey});

    return app;
}
