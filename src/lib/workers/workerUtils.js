// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import { parentPort } from 'worker_threads';

export function workerTaskProcessor (taskProcessor) {
    parentPort.on('message', (msg) => {
        taskProcessor(msg.msg)
            .then(data => { 
                msg.channelWorkerPort.postMessage(data);
            }).catch(err => {
                msg.channelWorkerPort.postMessage((err instanceof Error) ? err.message : err);
            });
    });
}

