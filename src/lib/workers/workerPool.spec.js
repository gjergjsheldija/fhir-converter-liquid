// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import { fail, equal, deepEqual, ok } from 'assert';
import WorkerPool, { resolveWorkerConcurrency } from './workerPool.js';

const testWorkerFileName = './src/lib/workers/testWorker.js';

describe('workerPool', function () {
    it('should replenish the pool if worker exits.', async () => {
        const pool = new WorkerPool(testWorkerFileName, 1);
        try {
            try {
                await pool.exec({ TestOnly: 'exit' });
                fail();
            } catch (err) {
                // ignore
            }
            const result = await pool.exec({ TestOnly: 'msg1' });
            equal(result, 'b'); // should come here only if worker pool is replenished
        } finally {
            await pool.destroy();
        }
    });

    it('worker thrown error should be passed as msg to parent.', async () => {
        const pool = new WorkerPool(testWorkerFileName, 1);
        try {
            const result = await pool.exec({ TestOnly: 'error' });
            equal(result, 'random error');
        } finally {
            await pool.destroy();
        }
    });

    it('worker responses should map to correct request.', async () => {
        const pool = new WorkerPool(testWorkerFileName, 2);
        try {
            const execArr = [];
            for (let i = 0; i < 3; i++) {
                execArr.push(pool.exec({ TestOnly: 'msg1' }));
                execArr.push(pool.exec({ TestOnly: 'msg2' }));
            }
            const resArr = await Promise.all(execArr);
            deepEqual(resArr, ['b', 'c', 'b', 'c', 'b', 'c']);
        } finally {
            await pool.destroy();
        }
    });

    it('should default to a single worker when size is 0.', async () => {
        const pool = new WorkerPool(testWorkerFileName, 0);
        try {
            equal(pool._workers.length, 1);
            const result = await pool.exec({ TestOnly: 'msg1' });
            equal(result, 'b');
        } finally {
            await pool.destroy();
        }
    });

    it('resolves concurrency from explicit size, WORKER_CONCURRENCY env, or bounded default.', () => {
        const prev = process.env.WORKER_CONCURRENCY;
        try {
            equal(resolveWorkerConcurrency(3), 3);
            equal(resolveWorkerConcurrency(0), 1);
            equal(resolveWorkerConcurrency(-2), 1);

            process.env.WORKER_CONCURRENCY = '5';
            equal(resolveWorkerConcurrency(undefined), 5);
            equal(resolveWorkerConcurrency(null), 5);

            delete process.env.WORKER_CONCURRENCY;
            const auto = resolveWorkerConcurrency(undefined);
            ok(auto >= 1 && auto <= 4);
        } finally {
            if (prev === undefined) {
                delete process.env.WORKER_CONCURRENCY;
            } else {
                process.env.WORKER_CONCURRENCY = prev;
            }
        }
    });

    it('reports readiness, stats, and rejects with 503 after destroy.', async () => {
        const pool = new WorkerPool(testWorkerFileName, 1);
        equal(pool.isReady(), true);
        const result = await pool.exec({ TestOnly: 'msg1' });
        equal(result, 'b');

        const s = pool.stats();
        equal(s.maxThreads, 1);
        ok(s.completed >= 1);
        equal(typeof s.threads, 'number');
        equal(typeof s.queueSize, 'number');

        await pool.destroy();
        equal(pool.isReady(), false);
        equal(pool._workers.length, 0);

        try {
            await pool.exec({ TestOnly: 'msg1' });
            fail('Expected destroyed pool to reject');
        } catch (err) {
            equal(err.status, 503);
        }
    });

    it('enforces queue backpressure with 503 ServiceUnavailable when maxQueue is exceeded.', async () => {
        const pool = new WorkerPool(testWorkerFileName, 1, { maxQueue: 1, taskTimeoutMs: 5000 });
        try {
            // Ensure the worker thread is ready before saturating the queue
            equal(await pool.exec({ TestOnly: 'msg1' }), 'b');
            const p1 = pool.exec({ TestOnly: 'slow', delayMs: 200 });
            const p2 = pool.exec({ TestOnly: 'slow', delayMs: 200 });
            let queueErr = null;
            try {
                await pool.exec({ TestOnly: 'slow', delayMs: 200 });
            } catch (err) {
                queueErr = err;
            }
            ok(queueErr, 'Expected 3rd concurrent task to be rejected by maxQueue');
            equal(queueErr.status, 503);
            equal(queueErr.code, 'ServiceUnavailable');
            await Promise.all([p1, p2]);
        } finally {
            await pool.destroy();
        }
    });

    it('enforces per-task timeout with 504 Timeout.', async () => {
        const pool = new WorkerPool(testWorkerFileName, 1, { taskTimeoutMs: 5000 });
        try {
            let timeoutErr = null;
            try {
                await pool.exec({ TestOnly: 'slow', delayMs: 400 }, { timeoutMs: 50 });
            } catch (err) {
                timeoutErr = err;
            }
            ok(timeoutErr, 'Expected slow task to time out');
            equal(timeoutErr.status, 504);
            equal(timeoutErr.code, 'Timeout');
        } finally {
            await pool.destroy();
        }
    });

    it('broadcast increments cache epoch synchronously without throwing.', async () => {
        const pool = new WorkerPool(testWorkerFileName, 1);
        try {
            equal(pool._cacheEpoch, 0);
            pool.broadcast({ type: 'templatesUpdated' });
            equal(pool._cacheEpoch, 1);
            pool.broadcast({ type: 'constantsUpdated', data: '{}' });
            equal(pool._cacheEpoch, 2);
            const result = await pool.exec({ TestOnly: 'msg1' });
            equal(result, 'b');
        } finally {
            await pool.destroy();
        }
    });
});
