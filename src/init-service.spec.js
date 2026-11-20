// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------
import { equal, rejects } from 'node:assert/strict';
import { mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
import os from 'node:os';

describe('init-service base-template sync', () => {
    let baseDir, destDir;

    beforeEach(async () => {
        baseDir = join(os.tmpdir(), `init-service-base-${Date.now()}`);
        destDir = join(os.tmpdir(), `init-service-dest-${Date.now()}`);
        await mkdir(baseDir, { recursive: true });
        await writeFile(join(baseDir, 'a.liquid'), 'original content');
    });

    afterEach(async () => {
        await rm(baseDir, { recursive: true, force: true });
        await rm(destDir, { recursive: true, force: true });
    });

    it('should overwrite a stale file already present in the destination with the current base content', async () => {
        // Simulate a destination seeded before base was updated: same filename, stale content.
        await mkdir(destDir, { recursive: true });
        await writeFile(join(destDir, 'a.liquid'), 'stale content');

        const { syncBaseTemplates } = await import('./init-service-sync.js');
        await syncBaseTemplates(baseDir, destDir);

        const result = await readFile(join(destDir, 'a.liquid'), 'utf8');
        equal(result, 'original content');
    });

    it('should still remove stray .temp* folders left by UpdateBaseTemplates', async () => {
        await mkdir(join(destDir, '.tempXYZ'), { recursive: true });
        await writeFile(join(destDir, 'a.liquid'), 'original content');

        const { syncBaseTemplates } = await import('./init-service-sync.js');
        await syncBaseTemplates(baseDir, destDir);

        await rejects(() => access(join(destDir, '.tempXYZ')), { code: 'ENOENT' });
    });
});
