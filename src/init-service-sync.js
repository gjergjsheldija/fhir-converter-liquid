// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------
import fs from 'fs-extra';
import {join} from 'path';

// ponytail: fs.copy's default overwrite:true handles new/changed files; this does not
// delete files present in destDir but removed from baseDir (upgrade path if that's ever needed).
export async function syncBaseTemplates(baseDir, destDir) {
    await fs.ensureDir(destDir);
    const existingFiles = await fs.readdir(destDir);
    for (const fl of existingFiles) {
        if (fl.startsWith('.temp')) {
            const tempFolder = join(destDir, fl);
            console.log(`removing ${tempFolder}`);
            try {
                await fs.remove(tempFolder);
            } catch (err) {
                console.log(`${fl} removal failed with error ${err}`);
            }
        }
    }
    await fs.copy(baseDir, destDir, {overwrite: true});
}
