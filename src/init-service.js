// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import {BASE_TEMPLATE_FILES_LOCATION, TEMPLATE_FILES_LOCATION} from './lib/constants/constants.js';
import fs from 'fs-extra';
import {join} from 'path';

fs.ensureDir(TEMPLATE_FILES_LOCATION).then(function () {
    if (fs.readdir(TEMPLATE_FILES_LOCATION, function (err, files) {
        if (files.length == 0) {
            fs.copy(BASE_TEMPLATE_FILES_LOCATION, TEMPLATE_FILES_LOCATION);
        } else {
            // delete any temp folders (ceeated by UpdateBaseTemplates)
            var existingFiles = fs.readdirSync(TEMPLATE_FILES_LOCATION);
            existingFiles.forEach(function (fl) {
                try {
                    if (fl.startsWith('.temp')) {
                        let tempFolder = join(TEMPLATE_FILES_LOCATION, fl);
                        console.log(`removing ${tempFolder}`);
                        fs.removeSync(tempFolder);
                    }
                } catch (err) {
                    console.log(`${fl} removal failed with error ${err}`);
                }
            });
        }
    })) ;
});
