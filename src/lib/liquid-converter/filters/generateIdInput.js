// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

// Matches upstream's GenerateIdInput (GeneralFilters.cs): string.IsNullOrWhiteSpace(segment) -> null.
// No scope-sniffing fallback exists there; a prior version of this filter guessed at one for an
// unresolved "multiple vars" TODO, which silently substituted unrelated render-context data
// whenever the real piped value was legitimately empty.
export function generateIdInput(segment, resourceType, isBaseIdRequired, baseId) {
    // Handle empty/whitespace segment (including empty objects from Liquid context)
    if (!segment ||
        segment.length === 0 ||
        // liquidjs-specific: an empty {% capture %} block binds to {}, not '' -- no C# analog,
        // since upstream's `segment` parameter is a string and can never be an object.
        (typeof segment === 'object' && Object.keys(segment).length === 0) ||
        segment.toString().trim().length === 0) {
        return null;
    }

    if ((!resourceType || resourceType.length === 0) || (isBaseIdRequired && (baseId === undefined))) {
        throw new Error("invalid id generation input");
    }

    segment = segment.toString().trim();
    return baseId !== undefined ? `${resourceType}_${segment}_${baseId}` : `${resourceType}_${segment}`;
}
