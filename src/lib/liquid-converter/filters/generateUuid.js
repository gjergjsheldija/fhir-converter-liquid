// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------
import {createHash} from "crypto";

export function generateUuid(namespace) {
    // Matches upstream's GenerateUUID (GeneralFilters.cs): string.IsNullOrWhiteSpace(input) -> null.
    // No scope-sniffing fallback exists there; a prior version of this filter guessed at one
    // for an unresolved "multiple vars" TODO, which silently substituted unrelated render-context
    // data whenever the real piped value was legitimately empty, producing well-formed but
    // meaningless UUIDs.
    if (namespace === null || namespace === undefined || String(namespace).trim().length === 0) {
        return null;
    }
    const input = ''.concat(namespace);
    const hash = createHash('sha256').update(input, 'utf8').digest();
    const b = Buffer.from(hash.slice(0, 16));
    // Replicate .NET's `new Guid(byte[])` byte-order: bytes 0-3, 4-5, 6-7 reversed; 8-15 unchanged.
    [b[0], b[3]] = [b[3], b[0]];
    [b[1], b[2]] = [b[2], b[1]];
    [b[4], b[5]] = [b[5], b[4]];
    [b[6], b[7]] = [b[7], b[6]];
    const hex = b.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
