// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import {realpath, stat} from "fs/promises";
import path from "path";
import {isValidGitRef, parseGithubRepo, readGithubFile} from "../browse/sources.js";
import {HL7V2_LIQUID_TEMPLATE_LOCATION} from "../constants/constants.js";
import {isSafeRelativePath, readManifest, validateManifest} from "./manifest.js";

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_REPO_CACHES = 5;
const repoPartialCache = new Map(); // repoKey -> { createdAt, files: Map<relName, content> }

function httpError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}

export function clearGithubConvertCache() {
    repoPartialCache.clear();
}

export function resolvePartialRelativePath(quoted) {
    const trimmed = String(quoted || "").trim();
    if (!trimmed || trimmed.includes("..") || trimmed.includes("\\") || trimmed.startsWith("/")) {
        return null;
    }
    if (trimmed.endsWith(".liquid") || trimmed.endsWith(".json")) {
        return isSafeRelativePath(trimmed) ? trimmed : null;
    }
    const segments = trimmed.split("/");
    if (segments.length === 1) {
        const candidate = `${segments[0]}.liquid`;
        return isSafeRelativePath(candidate) ? candidate : null;
    }
    const lower = trimmed.toLowerCase();
    const isCodeMapping = lower.endsWith("codesystem/codesystem") || lower.endsWith("valueset/valueset");
    const lastIdx = segments.length - 1;
    segments[lastIdx] = isCodeMapping
        ? `${segments[lastIdx]}.json`
        : `_${segments[lastIdx]}.liquid`;
    const candidate = segments.join("/");
    return isSafeRelativePath(candidate) ? candidate : null;
}

export function extractPartialReferences(templateSource) {
    const text = String(templateSource || "");
    const patterns = [
        /{%-?\s*(?:include|render)\s+['"]([^'"]+)['"]/g,
        /{%-?\s*evaluate\s+[A-Za-z_][\w]*\s+using\s+['"]([^'"]+)['"]/g
    ];
    const refs = new Set();
    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
            const rel = resolvePartialRelativePath(match[1]);
            if (rel) {
                refs.add(rel);
            }
        }
    }
    return Array.from(refs);
}

function getRepoFileCache(repoKey) {
    const now = Date.now();
    const hit = repoPartialCache.get(repoKey);
    if (hit && now - hit.createdAt < CACHE_TTL_MS) {
        repoPartialCache.delete(repoKey);
        repoPartialCache.set(repoKey, hit);
        return hit.files;
    }
    if (hit) {
        repoPartialCache.delete(repoKey);
    }
    while (repoPartialCache.size >= MAX_REPO_CACHES) {
        const oldestKey = repoPartialCache.keys().next().value;
        repoPartialCache.delete(oldestKey);
    }
    const entry = {createdAt: now, files: new Map()};
    repoPartialCache.set(repoKey, entry);
    return entry.files;
}

export async function prepareProjectConversion(body = {}) {
    const project = body && body.project;
    if (!project || (project.kind !== "local" && project.kind !== "github")) {
        throw httpError(400, "A valid local or GitHub project is required.");
    }
    const userOverrides = body.templatesOverride || {};
    if (userOverrides.constructor !== Object) {
        throw httpError(400, "templatesOverride must be a JSON object.");
    }

    if (project.kind === "local") {
        const inputPath = typeof project.path === "string" ? project.path.trim() : "";
        if (!inputPath || !path.isAbsolute(inputPath)) {
            throw httpError(400, "Enter an absolute folder path.");
        }
        const dirInfo = await stat(inputPath).catch(() => null);
        if (!dirInfo || !dirInfo.isDirectory()) {
            throw httpError(404, "Folder not found.");
        }
        const rootReal = await realpath(inputPath);
        const readRes = await readManifest(rootReal);
        if (!readRes.ok) {
            throw httpError(400, readRes.error);
        }
        const manifest = readRes.manifest;
        if (!manifest.families.includes("hl7v2")) {
            throw httpError(400, "This converter only supports HL7v2.");
        }
        const tplCandidate = path.resolve(rootReal, manifest.roots.hl7v2.templates);
        const tplInfo = await stat(tplCandidate).catch(() => null);
        if (!tplInfo || !tplInfo.isDirectory()) {
            throw httpError(404, "Project HL7 v2 templates directory was not found.");
        }
        const tplReal = await realpath(tplCandidate);
        if (tplReal !== rootReal && !tplReal.startsWith(rootReal + path.sep)) {
            throw httpError(400, "Invalid path.");
        }
        return {
            templateDirectory: tplReal,
            strictOverridesOnly: false,
            fallbackTemplateDirectory: HL7V2_LIQUID_TEMPLATE_LOCATION,
            projectRoot: rootReal,
            templatesOverride: userOverrides
        };
    }

    const parsedRepo = parseGithubRepo(project.repo);
    if (!parsedRepo) {
        throw httpError(400, "Enter a GitHub repo as owner/repo or a github.com URL.");
    }
    const rawRef = project.ref != null ? String(project.ref) : "";
    if (!isValidGitRef(rawRef)) {
        throw httpError(400, "Invalid ref.");
    }
    const validationErr = validateManifest(project.manifest);
    if (validationErr) {
        throw httpError(400, validationErr);
    }
    if (!project.manifest.families.includes("hl7v2")) {
        throw httpError(400, "This converter only supports HL7v2.");
    }

    const canonicalRepo = `${parsedRepo.owner}/${parsedRepo.repo}`;
    const token = typeof project.token === "string" ? project.token : "";
    const templatesRoot = project.manifest.roots.hl7v2.templates;
    const repoKey = `${canonicalRepo}@${rawRef || "HEAD"}:${templatesRoot}`;
    const fileCache = getRepoFileCache(repoKey);

    const mergedOverrides = {...userOverrides};
    const visited = new Set();
    const queue = [];

    for (const ref of extractPartialReferences(body.template || "")) {
        queue.push(ref);
    }
    for (const overrideSource of Object.values(userOverrides)) {
        for (const ref of extractPartialReferences(overrideSource)) {
            queue.push(ref);
        }
    }

    while (queue.length > 0) {
        const relPartial = queue.shift();
        if (visited.has(relPartial)) {
            continue;
        }
        visited.add(relPartial);

        let partialSource;
        if (Object.prototype.hasOwnProperty.call(mergedOverrides, relPartial)) {
            partialSource = mergedOverrides[relPartial];
        } else if (fileCache.has(relPartial)) {
            partialSource = fileCache.get(relPartial);
            mergedOverrides[relPartial] = partialSource;
        } else {
            const repoPath = `${templatesRoot}/${relPartial}`;
            partialSource = await readGithubFile(canonicalRepo, repoPath, token, rawRef);
            fileCache.set(relPartial, partialSource);
            mergedOverrides[relPartial] = partialSource;
        }

        if (!relPartial.toLowerCase().endsWith(".json")) {
            for (const nestedRef of extractPartialReferences(partialSource)) {
                if (!visited.has(nestedRef)) {
                    queue.push(nestedRef);
                }
            }
        }
    }

    return {
        templateDirectory: undefined,
        strictOverridesOnly: true,
        templatesOverride: mergedOverrides
    };
}
