// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import { fail, equal, deepEqual } from 'assert';
import WorkerPool from './workerPool.js';
import pkg from 'promise';
const { all } = pkg;

const testWorkerFileName = './src/lib/workers/testWorker.js';

describe('workerPool', function () {
    it('should replenish the pool if worker exits.', async () => {
        const pool = new WorkerPool(testWorkerFileName, 1);

        try {
            await pool.exec({TestOnly : 'exit'});
            fail();
        } catch (err) {
            //ignore
        }
        const result = await pool.exec({TestOnly : 'msg1'});
        equal(result, 'b'); //should come here only if worker pool is replenished
        pool.destroy();
    });

    it('worker thrown error should be passed as msg to parent.', async () => {
        const pool = new WorkerPool(testWorkerFileName, 1);
        const result = await pool.exec({TestOnly : 'error'});
        equal(result, 'random error');
        pool.destroy();
    });

    it('worker responses should map to correct request.', async () => {
        const pool = new WorkerPool(testWorkerFileName, 2);
        const execArr = [];
        for (let i = 0; i < 3; i++) {
            execArr.push(pool.exec({TestOnly : 'msg1'}));
            execArr.push(pool.exec({TestOnly : 'msg2'}));
        }
        const resArr = await all(execArr);
        deepEqual(resArr, ['b', 'c', 'b', 'c', 'b', 'c']);
        pool.destroy();
    });
});

