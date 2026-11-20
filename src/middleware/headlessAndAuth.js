// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import {appendAuditAsync, authorizeConvert} from "../lib/conversions/convertAudit.js";
import {errorCodes, errorMessage} from "../lib/error/error.js";

export function isHeadlessRuntimeEnabled() {
    return process.env.HEADLESS_RUNTIME === "true" || process.env.HEADLESS_RUNTIME === "1";
}

export function isHeadlessAllowedRoute(req) {
    const pathname = req.path.length > 1 ? req.path.replace(/\/+$/, "") : req.path;
    if (req.method === "GET") {
        return (
            pathname === "/health" ||
            pathname === "/version" ||
            pathname === "/metrics" ||
            pathname === "/api/v1/conversions/failures"
        );
    }
    if (req.method === "POST") {
        if (/^\/api\/v1\/convert\/[^/]+(?:\/.+)?$/.test(pathname)) {
            return true;
        }
        if (pathname === "/api/v1/projects/convert") {
            return true;
        }
        if (/^\/api\/v1\/projects\/[^/]+\/convert\/.+$/.test(pathname)) {
            return true;
        }
    }
    return false;
}

export function headlessGuard(req, res, next) {
    if (!isHeadlessRuntimeEnabled() || isHeadlessAllowedRoute(req)) {
        next();
        return;
    }
    res.status(403).json({
        error: {
            code: "Forbidden",
            message: "Studio routes are disabled when HEADLESS_RUNTIME is enabled."
        }
    });
}

export function createAuthMiddlewares({auditConvert} = {}) {
    function requireApiKey(req, res, next) {
        if (authorizeConvert(process.env.CONVERT_API_KEY, req.headers.authorization)) {
            next();
            return;
        }
        res.status(401).json(errorMessage(errorCodes.Unauthorized, "Convert API key is required."));
    }

    // CONVERT_API_KEY is read on each request. Empty or unset leaves convert routes open.
    function requireConvertKey(templateOf) {
        return function (req, res, next) {
            if (authorizeConvert(process.env.CONVERT_API_KEY, req.headers.authorization)) {
                next();
                return;
            }
            // 401: the request body is not read, so MSH-10 stays empty.
            const template = templateOf ? templateOf(req) : "";
            if (typeof auditConvert === "function") {
                auditConvert(401, template);
            } else {
                appendAuditAsync({status: 401, template}).catch(() => {});
            }
            res.status(401).json(errorMessage(errorCodes.Unauthorized, "Convert API key is required."));
        };
    }

    return {
        requireConvertKey,
        requireApiKey
    };
}
