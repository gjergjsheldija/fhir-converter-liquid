// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------
import express from 'express';
import routes from './routes.js';
import logging from './lib/logging/logging.js';
import {attachGracefulShutdown} from './lib/server/lifecycle.js';

const logger = logging();
const app = routes(express());
const port = process.env.PORT || 2019;

const server = app.listen(port, function () {
    const host = server.address().address;
    logger.info(`HealthConverter listening at http://${host}:${port}`);
});

attachGracefulShutdown({
    server,
    workerPool: app.workerPool,
    logger,
    onSighup: async () => {
        const {clearCustomerCache} = await import('./lib/customers/customerConfig.js');
        if (typeof clearCustomerCache === 'function') {
            clearCustomerCache();
        }
        if (app.workerPool && typeof app.workerPool.broadcast === 'function') {
            app.workerPool.broadcast({type: 'templatesUpdated'});
        }
    }
});
