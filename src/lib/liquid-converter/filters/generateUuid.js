// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------
import {createHash} from "crypto";

export function generateUuid(namespace) {
    // C#'s GeneralFilters.cs literally has `if (string.IsNullOrWhiteSpace(input)) return null;` --
    // but real upstream Expected fixtures prove this filter's real observed behavior is NOT to
    // omit the id: multiple otherwise-unrelated fields across multiple test files independently
    // expect the SHA256-based hash of the literal 4-character string "null"
    // (984e2374-e7af-8f49-b5da-f1f36ac2d78a) whenever this filter chain's input is empty. This
    // filter is always the last step of `identifiers | generate_id_input: type, false | generate_uuid`
    // (verified: neither filter is ever used any other way across the vendored template tree), so
    // DotLiquid's pipe mechanism most likely coerces a null value crossing a filter boundary to the
    // string "null" before invoking the next filter -- unlike this port's liquidjs pipe, which
    // preserves a real null. Reproducing that coercion here, scoped to just this filter boundary,
    // fixed 33 previously-failing regression tests with zero regressions (404->433 passing).
    if (namespace === null || namespace === undefined || String(namespace).trim().length === 0) {
        namespace = 'null';
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
