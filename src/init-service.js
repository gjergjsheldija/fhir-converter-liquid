// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import {existsSync} from 'node:fs';
import {
    BASE_TEMPLATE_FILES_LOCATION,
    REVERSE_BASE_TEMPLATE_FILES_LOCATION,
    REVERSE_TEMPLATE_FILES_LOCATION,
    TEMPLATE_FILES_LOCATION
} from './lib/constants/constants.js';
import {syncBaseTemplates} from './init-service-sync.js';

await syncBaseTemplates(BASE_TEMPLATE_FILES_LOCATION, TEMPLATE_FILES_LOCATION);
if (existsSync(REVERSE_BASE_TEMPLATE_FILES_LOCATION)) {
    await syncBaseTemplates(REVERSE_BASE_TEMPLATE_FILES_LOCATION, REVERSE_TEMPLATE_FILES_LOCATION);
}
