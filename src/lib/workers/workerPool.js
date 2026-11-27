// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import os from 'node:os';
import path from 'node:path';
import Piscina from 'piscina';

export function resolveWorkerConcurrency(explicitSize) {
    if (explicitSize !== undefined && explicitSize !== null) {
        return Math.max(1, Math.floor(Number(explicitSize)) || 1);
    }
    if (process.env.WORKER_CONCURRENCY) {
        return Math.max(1, Math.floor(Number(process.env.WORKER_CONCURRENCY)) || 1);
    }
    const available = typeof os.availableParallelism === 'function'
        ? os.availableParallelism()
        : os.cpus().length;
    return Math.min(4, Math.max(1, available));
}

export default class WorkerPool {
    constructor(filename, size, options = {}) {
        const resolvedFilename = path.resolve(filename);
        const workerCount = resolveWorkerConcurrency(size);
        const maxQueue = options.maxQueue !== undefined
            ? options.maxQueue
            : (Number(process.env.WORKER_MAX_QUEUE) || 256);
        const taskTimeoutMs = options.taskTimeoutMs !== undefined
            ? options.taskTimeoutMs
            : (Number(process.env.WORKER_TASK_TIMEOUT_MS) || 30000);

        this._piscina = new Piscina({
            filename: resolvedFilename,
            minThreads: workerCount,
            maxThreads: workerCount,
            maxQueue
        });
        this._destroyed = false;
        this._cacheEpoch = 0;
        this._size = workerCount;
        this._maxQueue = maxQueue;
        this._taskTimeoutMs = taskTimeoutMs;
    }

    get _workers() {
        return { length: this._destroyed ? 0 : this._size };
    }

    isReady() {
        return !this._destroyed && this._piscina != null;
    }

    stats() {
        return {
            threads: this._piscina.threads.length,
            maxThreads: this._size,
            queueSize: this._piscina.queueSize,
            completed: this._piscina.completed
        };
    }

    async exec(msg, execOptions = {}) {
        if (this._destroyed) {
            const err = new Error('Worker pool has been destroyed.');
            err.status = 503;
            err.code = 'ServiceUnavailable';
            throw err;
        }

        if (this._maxQueue > 0 && Number.isFinite(this._maxQueue) && this._piscina.queueSize >= this._maxQueue) {
            const queueErr = new Error('Conversion worker queue is full; try again shortly.');
            queueErr.status = 503;
            queueErr.code = 'ServiceUnavailable';
            throw queueErr;
        }

        const payload = (msg !== null && typeof msg === 'object' && !Array.isArray(msg))
            ? { ...msg, _cacheEpoch: this._cacheEpoch }
            : msg;

        const timeoutMs = execOptions.timeoutMs !== undefined
            ? execOptions.timeoutMs
            : this._taskTimeoutMs;
        const signal = execOptions.signal || (
            Number.isFinite(timeoutMs) && timeoutMs > 0 && typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
                ? AbortSignal.timeout(timeoutMs)
                : undefined
        );

        try {
            return await this._piscina.run(payload, signal ? { signal } : undefined);
        } catch (err) {
            if (err && (err.code === 'PISCINA_QUEUE_LIMIT_REACHED' || /queue/i.test(err.message))) {
                const queueErr = new Error('Conversion worker queue is full; try again shortly.');
                queueErr.status = 503;
                queueErr.code = 'ServiceUnavailable';
                throw queueErr;
            }
            if (err && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
                const timeoutErr = new Error('Conversion timed out.');
                timeoutErr.status = 504;
                timeoutErr.code = 'Timeout';
                throw timeoutErr;
            }
            throw err;
        }
    }

    broadcast() {
        this._cacheEpoch++;
    }

    destroy() {
        if (this._destroyed) {
            return Promise.resolve();
        }
        this._destroyed = true;
        return this._piscina.destroy();
    }
}
