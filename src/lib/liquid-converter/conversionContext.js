// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import { AsyncLocalStorage } from 'node:async_hooks';

export const conversionStorage = new AsyncLocalStorage();

export function runWithConversionContext(initialValues, fn) {
    const store = Object.assign(Object.create(null), initialValues);
    return conversionStorage.run(store, fn);
}

export function getConversionValue(key) {
    const store = conversionStorage.getStore();
    return store ? store[key] : undefined;
}

export function setConversionValue(key, value) {
    const store = conversionStorage.getStore();
    if (store) {
        store[key] = value;
    }
}
