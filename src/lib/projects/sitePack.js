// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import {readFile, readdir} from "fs/promises";
import path from "path";

function httpError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function readJsonObject(filePath, label) {
    const text = await readFile(filePath, "utf8");
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (err) {
        throw httpError(400, `${label} is not valid JSON: ${err.message}`);
    }
    if (!isPlainObject(parsed)) {
        throw httpError(400, `${label} must be a JSON object.`);
    }
    return parsed;
}

/**
 * Reads non-recursive conceptmaps/*.json and optional identifiers.json from a project root.
 * A missing directory or file is an empty pack.
 */
export async function loadSitePack(projectRoot) {
    const pack = {conceptMaps: [], identifiers: {}};

    const mapsDir = path.join(projectRoot, "conceptmaps");
    const entries = await readdir(mapsDir, {withFileTypes: true}).catch(() => []);
    const names = entries
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
        .map((entry) => entry.name)
        .sort();
    for (const name of names) {
        pack.conceptMaps.push(await readJsonObject(path.join(mapsDir, name), `conceptmaps/${name}`));
    }

    const identifiersPath = path.join(projectRoot, "identifiers.json");
    const identifiersText = await readFile(identifiersPath, "utf8").catch((err) => {
        if (err && err.code === "ENOENT") {
            return null;
        }
        throw err;
    });
    if (identifiersText !== null) {
        pack.identifiers = await readJsonObject(identifiersPath, "identifiers.json");
    }
    return pack;
}

function isCoding(node) {
    return typeof node.system === "string" && typeof node.code === "string" && !("resourceType" in node);
}

function findMappedTarget(pack, coding) {
    for (const conceptMap of pack.conceptMaps || []) {
        const groups = Array.isArray(conceptMap.group) ? conceptMap.group : [];
        for (const group of groups) {
            if (!isPlainObject(group) || group.source !== coding.system) {
                continue;
            }
            const elements = Array.isArray(group.element) ? group.element : [];
            for (const element of elements) {
                if (!isPlainObject(element) || element.code !== coding.code) {
                    continue;
                }
                const target = Array.isArray(element.target) ? element.target[0] : undefined;
                if (isPlainObject(target) && typeof target.code === "string" && typeof group.target === "string") {
                    return {system: group.target, code: target.code, display: target.display};
                }
            }
        }
    }
    return null;
}

function identifierSystemFor(node, identifiers) {
    if (typeof node.value !== "string" || "resourceType" in node || "system" in node) {
        return null;
    }
    const codings = node.type && Array.isArray(node.type.coding) ? node.type.coding : [];
    for (const coding of codings) {
        if (isPlainObject(coding) && typeof coding.code === "string" &&
            Object.prototype.hasOwnProperty.call(identifiers, coding.code) &&
            typeof identifiers[coding.code] === "string") {
            return identifiers[coding.code];
        }
    }
    return null;
}

function walk(node, pack) {
    if (Array.isArray(node)) {
        return node.map((item) => walk(item, pack));
    }
    if (!isPlainObject(node)) {
        return node;
    }
    // Decide Identifier handling from the original node, before children are rewritten.
    const identifierSystem = identifierSystemFor(node, pack.identifiers || {});
    const mapped = isCoding(node) ? findMappedTarget(pack, node) : null;

    const copy = {};
    for (const [key, value] of Object.entries(node)) {
        copy[key] = walk(value, pack);
    }
    if (mapped) {
        copy.system = mapped.system;
        copy.code = mapped.code;
        if (typeof mapped.display === "string") {
            copy.display = mapped.display;
        }
    }
    if (identifierSystem) {
        copy.system = identifierSystem;
    }
    return copy;
}

function collectUnmappedInto(node, pack, nodePath, rows) {
    if (Array.isArray(node)) {
        node.forEach((item, index) => collectUnmappedInto(item, pack, nodePath ? `${nodePath}.${index}` : String(index), rows));
        return;
    }
    if (!isPlainObject(node)) {
        return;
    }
    if (isCoding(node) && !findMappedTarget(pack, node)) {
        rows.push({system: node.system, code: node.code, path: nodePath});
    }
    for (const [key, value] of Object.entries(node)) {
        collectUnmappedInto(value, pack, nodePath ? `${nodePath}.${key}` : key, rows);
    }
}

/**
 * Lists Codings in the original resource that no ConceptMap group rewrites, as {system, code, path}.
 * A missing pack yields an empty array; identifiers are never listed.
 */
export function collectUnmapped(resource, pack) {
    const rows = [];
    if (!pack) {
        return rows;
    }
    collectUnmappedInto(resource, pack, "", rows);
    return rows;
}

/** Returns a deep copy of resource with ConceptMap and identifier-system rules applied. */
export function applySitePack(resource, pack) {
    return walk(resource, pack || {});
}
