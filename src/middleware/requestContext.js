// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import crypto from "crypto";

const VALID_REQUEST_ID_REGEX = /^[A-Za-z0-9._:/-]+$/;
const MAX_HEADER_LENGTH = 128;

function sanitizeRequestId(raw) {
    if (typeof raw !== "string") {
        return null;
    }
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length > MAX_HEADER_LENGTH || !VALID_REQUEST_ID_REGEX.test(trimmed)) {
        return null;
    }
    return trimmed;
}

function sanitizeTraceparent(raw) {
    if (typeof raw !== "string") {
        return undefined;
    }
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length > MAX_HEADER_LENGTH) {
        return undefined;
    }
    return trimmed;
}

export function requestContextMiddleware(req, res, next) {
    const incomingId = req && req.headers ? req.headers["x-request-id"] : undefined;
    const id = sanitizeRequestId(incomingId) || crypto.randomUUID();
    req.requestId = id;
    res.setHeader("X-Request-Id", id);

    const traceparent = sanitizeTraceparent(req && req.headers ? req.headers.traceparent : undefined);
    if (traceparent !== undefined) {
        req.traceparent = traceparent;
    }

    next();
}

export default requestContextMiddleware;
