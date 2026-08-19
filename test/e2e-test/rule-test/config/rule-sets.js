// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

// define your own rule set as you want
import { onePatient, noDefaultGuid, noSameGuid } from "../util/test-rule-functions.js";
export const commonRules = [onePatient, noDefaultGuid, noSameGuid];
export const guidRules = [noDefaultGuid, noSameGuid];