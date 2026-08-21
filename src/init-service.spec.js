// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------
import {expect} from 'chai';
import fs from 'fs-extra';
import {join} from 'path';
import os from 'os';

describe('init-service base-template sync', () => {
    let baseDir, destDir;

    beforeEach(async () => {
        baseDir = join(os.tmpdir(), `init-service-base-${Date.now()}`);
        destDir = join(os.tmpdir(), `init-service-dest-${Date.now()}`);
        await fs.ensureDir(baseDir);
        await fs.writeFile(join(baseDir, 'a.liquid'), 'original content');
    });

    afterEach(async () => {
        await fs.remove(baseDir);
        await fs.remove(destDir);
    });

    it('should overwrite a stale file already present in the destination with the current base content', async () => {
        // Simulate a destination seeded before base was updated: same filename, stale content.
        await fs.ensureDir(destDir);
        await fs.writeFile(join(destDir, 'a.liquid'), 'stale content');

        const {syncBaseTemplates} = await import('./init-service-sync.js');
        await syncBaseTemplates(baseDir, destDir);

        const result = await fs.readFile(join(destDir, 'a.liquid'), 'utf8');
        expect(result).to.equal('original content');
    });

    it('should still remove stray .temp* folders left by UpdateBaseTemplates', async () => {
        await fs.ensureDir(destDir);
        await fs.ensureDir(join(destDir, '.tempXYZ'));
        await fs.writeFile(join(destDir, 'a.liquid'), 'original content');

        const {syncBaseTemplates} = await import('./init-service-sync.js');
        await syncBaseTemplates(baseDir, destDir);

        expect(await fs.pathExists(join(destDir, '.tempXYZ'))).to.equal(false);
    });
});
