// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import {access, readFile} from "fs/promises";
import {resolve, sep} from "path";
import {applySitePack, collectUnmapped, loadSitePack} from "../projects/sitePack.js";
import logging from "../logging/logging.js";
import {appendAuditAsync} from "./convertAudit.js";
import {appendFailureAsync, controlIdOf} from "./failureLog.js";

const logger = logging();

export function isStatelessRuntime() {
    return process.env.STATELESS_RUNTIME === "true" || process.env.STATELESS_RUNTIME === "1";
}

export async function fileExists(filePath) {
    try {
        await access(filePath);
        return true;
    } catch (err) {
        return false;
    }
}

export function resolveTemplatePath(templateDirectory, rawTemplate) {
    const name = typeof rawTemplate === "string" ? rawTemplate : "";
    const tplFile = name.endsWith(".liquid") ? name : `${name}.liquid`;
    const resolved = resolve(templateDirectory, tplFile);
    if (!name || name.includes("..") || !resolved.startsWith(templateDirectory + sep)) {
        const err = new Error("Invalid template name.");
        err.status = 400;
        throw err;
    }
    return resolved;
}

export async function resolveProjectTemplatePath(prep, rawTemplate) {
    const primary = resolveTemplatePath(prep.templateDirectory, rawTemplate);
    if (await fileExists(primary)) {
        return primary;
    }
    if (prep.fallbackTemplateDirectory) {
        const fallback = resolveTemplatePath(prep.fallbackTemplateDirectory, rawTemplate);
        if (await fileExists(fallback)) {
            return fallback;
        }
    }
    return primary;
}

export async function readProjectTemplateSource(prep, rawTemplate) {
    const resolvedPath = await resolveProjectTemplatePath(prep, rawTemplate);
    try {
        return await readFile(resolvedPath, "utf8");
    } catch (err) {
        if (err && err.code === "ENOENT") {
            return null;
        }
        throw err;
    }
}

export async function applyProjectSitePack(projectRoot, fhirResource) {
    const pack = await loadSitePack(projectRoot);
    const unmapped = collectUnmapped(fhirResource, pack);
    const mappedResource = applySitePack(fhirResource, pack);
    return {
        fhirResource: mappedResource,
        unmapped
    };
}

export function parseConversionQueryFlags(query = {}) {
    return {
        retUnusedSegments: query.unusedSegments == "true",
        retInvalidAccess: query.invalidAccess == "true",
        retDebug: query.debug == "true"
    };
}

export function pruneConversionMetadata(
    resultMessage,
    {retUnusedSegments = false, retInvalidAccess = false, retDebug = false} = {}
) {
    if (!resultMessage || typeof resultMessage !== "object") {
        return resultMessage;
    }
    if (!retUnusedSegments) {
        delete resultMessage["unusedSegments"];
    }
    if (!retInvalidAccess) {
        delete resultMessage["invalidAccess"];
    }
    if (!retDebug) {
        delete resultMessage["debugInfo"];
    }
    return resultMessage;
}

export function createConversionRecorder() {
    const counts = {failed: 0, succeeded: 0};

    // One audit line per convert attempt: status, template, MSH-10. Never the body or the key.
    function auditConvert(status, template, srcData, meta = {}) {
        const safeMeta = meta && typeof meta === "object" ? meta : {};
        const tpl = typeof template === "string" ? template : "";
        const controlId = controlIdOf(srcData);
        if (process.env.NODE_ENV !== "testing") {
            logger.info({
                event: "conversion.audit",
                status,
                template: tpl,
                controlId,
                requestId: safeMeta.requestId || undefined,
                customerId: safeMeta.customerId || undefined,
                durationMs: safeMeta.durationMs
            });
        }
        if (!isStatelessRuntime()) {
            appendAuditAsync({
                status,
                template: tpl,
                controlId
            }).catch(() => {});
        }
    }

    function recordConversion(status, resultMessage, srcData, template, meta = {}) {
        const safeMeta = meta && typeof meta === "object" ? meta : {};
        auditConvert(status, template, srcData, safeMeta);
        if (status === 200) {
            counts.succeeded++;
            return;
        }
        counts.failed++;
        const detail = (resultMessage && resultMessage.error && resultMessage.error.message) || "Conversion failed.";
        const tpl = typeof template === "string" ? template : "";
        const controlId = controlIdOf(srcData);
        if (process.env.NODE_ENV !== "testing") {
            logger.warn({
                event: "conversion.failed",
                status,
                template: tpl,
                controlId,
                requestId: safeMeta.requestId || undefined,
                customerId: safeMeta.customerId || undefined,
                message: detail
            });
        }
        if (!isStatelessRuntime()) {
            appendFailureAsync({
                template,
                message: detail,
                raw: srcData
            }).catch(() => {});
        }
    }

    return {
        counts,
        auditConvert,
        recordConversion
    };
}

export async function runConversion({
    workerPool,
    workerTask,
    flags = {},
    projectRoot = null,
    auditContext = {},
    recorder = null,
    recordFailure = true,
    requestId,
    customerId
}) {
    const startedAt = Date.now();
    const result = await workerPool.exec(workerTask);
    if (projectRoot && result.status === 200 && result.resultMsg && result.resultMsg.fhirResource) {
        const mapped = await applyProjectSitePack(projectRoot, result.resultMsg.fhirResource);
        result.resultMsg.unmapped = mapped.unmapped;
        result.resultMsg.fhirResource = mapped.fhirResource;
    }
    const resultMessage = pruneConversionMetadata(result.resultMsg, flags);
    const meta = {
        requestId,
        customerId,
        durationMs: Date.now() - startedAt
    };
    if (recorder) {
        if (recordFailure) {
            recorder.recordConversion(result.status, resultMessage, auditContext.srcData, auditContext.template, meta);
        } else {
            recorder.auditConvert(result.status, auditContext.template, auditContext.srcData, meta);
        }
    }
    return {
        status: result.status,
        resultMessage
    };
}
