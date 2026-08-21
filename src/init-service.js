// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import {BASE_TEMPLATE_FILES_LOCATION, TEMPLATE_FILES_LOCATION} from './lib/constants/constants.js';
import {syncBaseTemplates} from './init-service-sync.js';

syncBaseTemplates(BASE_TEMPLATE_FILES_LOCATION, TEMPLATE_FILES_LOCATION);
