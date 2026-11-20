// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import {appendFileSync, mkdirSync, renameSync, statSync} from "fs";
import {appendFile, mkdir, rename, stat} from "fs/promises";
import {dirname} from "path";

export const MAX_LOG_BYTES = 5 * 1024 * 1024;

export function resolveMaxBytes(options) {
    if (options && typeof options.maxBytes === "number" && Number.isFinite(options.maxBytes) && options.maxBytes > 0) {
        return options.maxBytes;
    }
    return MAX_LOG_BYTES;
}

function rotateIfNeededSync(file, maxBytes) {
    try {
        const info = statSync(file);
        if (info.size >= maxBytes) {
            renameSync(file, file + ".1");
        }
    } catch (err) {
        if (!err || err.code !== "ENOENT") {
            throw err;
        }
    }
}

async function rotateIfNeededAsync(file, maxBytes) {
    try {
        const info = await stat(file);
        if (info.size >= maxBytes) {
            await rename(file, file + ".1");
        }
    } catch (err) {
        if (!err || err.code !== "ENOENT") {
            throw err;
        }
    }
}

export function appendJsonlLineSync(file, line, options) {
    const maxBytes = resolveMaxBytes(options);
    mkdirSync(dirname(file), {recursive: true});
    rotateIfNeededSync(file, maxBytes);
    appendFileSync(file, line + "\n");
    return line;
}

export function createAsyncJsonlQueue() {
    let writeChain = Promise.resolve();

    function appendJsonlLineAsync(file, line, options) {
        const maxBytes = resolveMaxBytes(options);
        const task = writeChain.then(async () => {
            await mkdir(dirname(file), {recursive: true});
            await rotateIfNeededAsync(file, maxBytes);
            await appendFile(file, line + "\n");
            return line;
        });
        writeChain = task.catch(() => {});
        return task;
    }

    appendJsonlLineAsync.flush = function () {
        return writeChain;
    };

    return appendJsonlLineAsync;
}
