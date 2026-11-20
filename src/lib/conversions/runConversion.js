// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import {access, readFile} from "fs/promises";
import {resolve, sep} from "path";
import {applySitePack, collectUnmapped, loadSitePack} from "../projects/sitePack.js";
import {appendAuditAsync} from "./convertAudit.js";
import {appendFailureAsync, controlIdOf} from "./failureLog.js";

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
    function auditConvert(status, template, srcData) {
        appendAuditAsync({
            status,
            template: typeof template === "string" ? template : "",
            controlId: controlIdOf(srcData)
        }).catch(() => {});
    }

    function recordConversion(status, resultMessage, srcData, template) {
        auditConvert(status, template, srcData);
        if (status === 200) {
            counts.succeeded++;
            return;
        }
        counts.failed++;
        const detail = resultMessage && resultMessage.error && resultMessage.error.message;
        appendFailureAsync({
            template,
            message: detail || "Conversion failed.",
            raw: srcData
        }).catch(() => {});
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
    recordFailure = true
}) {
    const result = await workerPool.exec(workerTask);
    if (projectRoot && result.status === 200 && result.resultMsg && result.resultMsg.fhirResource) {
        const mapped = await applyProjectSitePack(projectRoot, result.resultMsg.fhirResource);
        result.resultMsg.unmapped = mapped.unmapped;
        result.resultMsg.fhirResource = mapped.fhirResource;
    }
    const resultMessage = pruneConversionMetadata(result.resultMsg, flags);
    if (recorder) {
        if (recordFailure) {
            recorder.recordConversion(result.status, resultMessage, auditContext.srcData, auditContext.template);
        } else {
            recorder.auditConvert(result.status, auditContext.template, auditContext.srcData);
        }
    }
    return {
        status: result.status,
        resultMessage
    };
}
