// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------
import express from 'express';
import routes from './routes.js';
import logging from './lib/logging/logging.js';

const logger = logging();
const app = routes(express());
const port = process.env.PORT || 2019;

const server = app.listen(port, function () {
    const host = server.address().address;
    logger.info(`HealthConverter listening at http://${host}:${port}`);
});
