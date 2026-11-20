// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------
import { mkdir, readdir, rm, cp } from 'node:fs/promises';
import { join } from 'node:path';

// ponytail: cp with force:true handles new/changed files; this does not
// delete files present in destDir but removed from baseDir (upgrade path if that's ever needed).
export async function syncBaseTemplates(baseDir, destDir) {
    await mkdir(destDir, { recursive: true });
    const existingFiles = await readdir(destDir);
    for (const fl of existingFiles) {
        if (fl.startsWith('.temp')) {
            const tempFolder = join(destDir, fl);
            console.log(`removing ${tempFolder}`);
            try {
                await rm(tempFolder, { recursive: true, force: true });
            } catch (err) {
                console.log(`${fl} removal failed with error ${err}`);
            }
        }
    }
    await cp(baseDir, destDir, { recursive: true, force: true });
}
