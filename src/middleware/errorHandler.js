// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import {errorCodes, errorMessage} from "../lib/error/error.js";

function resolveErrorCode(status, err) {
    if (err && err.code && typeof err.code === "string") {
        return err.code;
    }
    if (status === 404) {
        return errorCodes.NotFound;
    }
    if (status === 401) {
        return errorCodes.Unauthorized;
    }
    return errorCodes.BadRequest;
}

export function jsonErrorHandler(err, req, res, next) {
    if (res.headersSent) {
        next(err);
        return;
    }

    let status;
    let code;
    let message;

    if (err && (err.type === "entity.too.large" || err.status === 413)) {
        status = 413;
        code = errorCodes.BadRequest;
        message = "Request payload exceeds MAX_BODY_SIZE limit.";
    } else if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
        status = 400;
        code = errorCodes.BadRequest;
        message = "Malformed JSON request body.";
    } else {
        status = err && Number.isInteger(err.status) ? err.status : 500;
        code = resolveErrorCode(status, err);
        if (status >= 500 && !(err && err.expose)) {
            message = (err && err.message) || "Internal server error.";
        } else {
            message = (err && err.message) || "Request failed.";
        }
    }

    const payload = errorMessage(code, message);
    if (req && req.requestId) {
        payload.requestId = req.requestId;
    }
    if (err && err.phase) {
        payload.phase = err.phase;
    }
    if (err && err.detail !== undefined) {
        payload.detail = err.detail;
    }

    res.status(status).json(payload);
}

export default jsonErrorHandler;
