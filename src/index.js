// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------
import express from 'express';
import messageBroker from './lib/message-broker/messaging-service.js';
import routes from './routes.js';
import nconf from 'nconf';
import logging from "./lib/logging/logging.js";

let logger = logging();

nconf.argv()
    .env()
    .file({ file: './config/default.json' });

logger.info(`Enable message broker is set to: ${nconf.get('enable_message_broker')}`);
if (nconf.get('enable_message_broker') == "true") {
    messageBroker(nconf);
}
var app = routes(express());

var port = process.env.PORT || 2019;

var server = app.listen(port, function () {
    var host = server.address().address;
    logger.info(`HealthConverter listening at http://${host}:${port}`);
});
