// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import { equal, rejects } from 'node:assert';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';
import path, { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fsCache from './cache.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('fsCache', function () {
    const folderPath = join(__dirname, 'test-fsCache');
    const fileName = 'fsCacheTempFile.liquid';
    const filePath = join(folderPath, fileName);

    beforeEach(function () {
        rmSync(folderPath, { recursive: true, force: true });
        mkdirSync(folderPath, { recursive: true });
        writeFileSync(filePath, 'hello');
    });

    after(function () {
        rmSync(folderPath, { recursive: true, force: true });
    });

    it('should use Cache for get', async function () {
        const cache = new fsCache(folderPath);
        const data1 = await cache.get(fileName);
        equal(data1, 'hello');

        rmSync(filePath, { force: true });
        const data2 = await cache.get(fileName);
        equal(data2, 'hello');
    });

    it('Cache should get expired on file update', async function () {
        const cache = new fsCache(folderPath);
        const data1 = await cache.get(fileName);
        equal(data1, 'hello');

        await cache.set(fileName, 'world');
        rmSync(filePath, { force: true });
        await rejects(() => cache.get(fileName));
    });

    it('Cache has() should return false for non-existent file', async function () {
        const cache = new fsCache(folderPath);
        const result = await cache.has('nonExistentFile');
        equal(result, false);
    });

    it('Cache has() should return true for existing file', async function () {
        const cache = new fsCache(folderPath);
        const result = await cache.has(fileName);
        equal(result, true);
    });
});
