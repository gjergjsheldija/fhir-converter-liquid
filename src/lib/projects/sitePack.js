import {readFile, readdir} from "fs/promises";
import path from "path";

const STANDARD_CODE_SYSTEMS = new Set([
    "http://loinc.org",
    "http://snomed.info/sct",
    "http://unitsofmeasure.org",
    "http://www.nlm.nih.gov/research/umls/rxnorm"
]);

const STANDARD_CODE_SYSTEM_PREFIXES = [
    "http://hl7.org/fhir/",
    "http://terminology.hl7.org/",
    "http://ihe.net/",
    "urn:ietf:",
    "urn:iso:"
];

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

function isStandardCodeSystem(system) {
    if (STANDARD_CODE_SYSTEMS.has(system)) {
        return true;
    }
    return STANDARD_CODE_SYSTEM_PREFIXES.some((prefix) => system.startsWith(prefix));
}

function hasConceptMapSource(pack, system) {
    for (const conceptMap of pack.conceptMaps || []) {
        if (!isPlainObject(conceptMap)) {
            continue;
        }
        const groups = Array.isArray(conceptMap.group) ? conceptMap.group : [];
        for (const group of groups) {
            if (isPlainObject(group) && group.source === system) {
                return true;
            }
        }
    }
    return false;
}

function findMappedTarget(pack, coding) {
    for (const conceptMap of pack.conceptMaps || []) {
        if (!isPlainObject(conceptMap)) {
            continue;
        }
        const groups = Array.isArray(conceptMap.group) ? conceptMap.group : [];
        for (const group of groups) {
            if (!isPlainObject(group) || group.source !== coding.system) {
                continue;
            }
            const preserveSource = typeof group.preserveSource === "boolean"
                ? group.preserveSource
                : conceptMap.preserveSource === true;
            const elements = Array.isArray(group.element) ? group.element : [];
            for (const element of elements) {
                if (!isPlainObject(element) || element.code !== coding.code) {
                    continue;
                }
                const target = Array.isArray(element.target) ? element.target[0] : undefined;
                if (isPlainObject(target) && typeof target.code === "string" && typeof group.target === "string") {
                    return {
                        system: group.target,
                        code: target.code,
                        display: target.display,
                        preserveSource
                    };
                }
            }
        }
    }
    return null;
}

function hasOwnString(obj, key) {
    return isPlainObject(obj) &&
        typeof key === "string" &&
        Object.prototype.hasOwnProperty.call(obj, key) &&
        typeof obj[key] === "string";
}

function matchSpecificIdentifierRule(typeKey, identifiers, existingSystem, assignerDisplay) {
    if (assignerDisplay && hasOwnString(identifiers, `${typeKey}@${assignerDisplay}`)) {
        return identifiers[`${typeKey}@${assignerDisplay}`];
    }
    if (existingSystem && hasOwnString(identifiers, `${typeKey}@${existingSystem}`)) {
        return identifiers[`${typeKey}@${existingSystem}`];
    }
    if (!Object.prototype.hasOwnProperty.call(identifiers, typeKey)) {
        return null;
    }
    const rule = identifiers[typeKey];
    if (!isPlainObject(rule)) {
        return null;
    }
    if (existingSystem && hasOwnString(rule.bySystem, existingSystem)) {
        return rule.bySystem[existingSystem];
    }
    if (assignerDisplay && hasOwnString(rule.byAssigner, assignerDisplay)) {
        return rule.byAssigner[assignerDisplay];
    }
    return null;
}

function matchDefaultIdentifierRule(typeKey, identifiers, hasSystem) {
    if (!Object.prototype.hasOwnProperty.call(identifiers, typeKey)) {
        return null;
    }
    const rule = identifiers[typeKey];
    if (typeof rule === "string") {
        return hasSystem ? null : rule;
    }
    if (isPlainObject(rule) && typeof rule.default === "string") {
        if (!hasSystem || rule.override === true) {
            return rule.default;
        }
    }
    return null;
}

function isIdentifierContext(node, parentKey) {
    if (isPlainObject(node.type) && Array.isArray(node.type.coding)) {
        return true;
    }
    if (isPlainObject(node.assigner)) {
        return true;
    }
    return parentKey === undefined ||
        parentKey === "identifier" ||
        (typeof parentKey === "string" && parentKey.endsWith("Identifier"));
}

function identifierSystemFor(node, identifiers, parentKey) {
    if (typeof node.value !== "string" || "resourceType" in node || !isPlainObject(identifiers)) {
        return null;
    }
    if (!isIdentifierContext(node, parentKey)) {
        return null;
    }

    const existingSystem = typeof node.system === "string" && node.system.length > 0 ? node.system : null;
    const hasSystem = "system" in node && node.system !== undefined && node.system !== null && node.system !== "";
    const assignerDisplay = isPlainObject(node.assigner) &&
        typeof node.assigner.display === "string" &&
        node.assigner.display.length > 0
        ? node.assigner.display
        : null;

    const codings = isPlainObject(node.type) && Array.isArray(node.type.coding) ? node.type.coding : [];
    const typeCodes = [];
    for (const coding of codings) {
        if (isPlainObject(coding) && typeof coding.code === "string" && coding.code !== "*") {
            typeCodes.push(coding.code);
        }
    }

    for (const code of typeCodes) {
        const specific = matchSpecificIdentifierRule(code, identifiers, existingSystem, assignerDisplay);
        if (specific !== null) {
            return specific;
        }
    }
    for (const code of typeCodes) {
        const fallback = matchDefaultIdentifierRule(code, identifiers, hasSystem);
        if (fallback !== null) {
            return fallback;
        }
    }

    const wildcardSpecific = matchSpecificIdentifierRule("*", identifiers, existingSystem, assignerDisplay);
    if (wildcardSpecific !== null) {
        return wildcardSpecific;
    }
    return matchDefaultIdentifierRule("*", identifiers, hasSystem);
}

function walkObjectProperties(node, pack) {
    const copy = {};
    for (const [key, value] of Object.entries(node)) {
        if (key === "coding" && Array.isArray(value)) {
            copy[key] = walkCodingArray(value, pack);
        } else {
            copy[key] = walk(value, pack, key);
        }
    }
    return copy;
}

function willEmitCoding(item, targetSystem, targetCode, pack) {
    if (!isPlainObject(item) || item.system !== targetSystem || item.code !== targetCode) {
        return false;
    }
    if (!isCoding(item)) {
        return true;
    }
    const mapped = findMappedTarget(pack, item);
    return !mapped || mapped.preserveSource;
}

function walkCodingArray(codingArray, pack) {
    const out = [];
    for (let i = 0; i < codingArray.length; i++) {
        const item = codingArray[i];
        if (!isPlainObject(item)) {
            out.push(walk(item, pack, "coding"));
            continue;
        }
        const identifierSystem = identifierSystemFor(item, pack.identifiers || {}, "coding");
        const mapped = isCoding(item) ? findMappedTarget(pack, item) : null;
        const copy = walkObjectProperties(item, pack);
        if (identifierSystem !== null) {
            copy.system = identifierSystem;
        }
        if (mapped && mapped.preserveSource) {
            out.push(copy);
            const alreadyInOut = out.some(
                (c) => isPlainObject(c) && c.system === mapped.system && c.code === mapped.code
            );
            const alreadyInRemaining = codingArray
                .slice(i + 1)
                .some((c) => willEmitCoding(c, mapped.system, mapped.code, pack));
            if (!alreadyInOut && !alreadyInRemaining) {
                const targetCoding = {system: mapped.system, code: mapped.code};
                if (typeof mapped.display === "string" && mapped.display.length > 0) {
                    targetCoding.display = mapped.display;
                }
                out.push(targetCoding);
            }
        } else {
            if (mapped) {
                copy.system = mapped.system;
                copy.code = mapped.code;
                if (typeof mapped.display === "string") {
                    copy.display = mapped.display;
                }
            }
            out.push(copy);
        }
    }
    return out;
}

function walk(node, pack, parentKey) {
    if (Array.isArray(node)) {
        return node.map((item) => walk(item, pack, parentKey));
    }
    if (!isPlainObject(node)) {
        return node;
    }
    // Decide Identifier handling from the original node, before children are rewritten.
    const identifierSystem = identifierSystemFor(node, pack.identifiers || {}, parentKey);
    const mapped = isCoding(node) ? findMappedTarget(pack, node) : null;

    const copy = walkObjectProperties(node, pack);
    if (mapped) {
        copy.system = mapped.system;
        copy.code = mapped.code;
        if (typeof mapped.display === "string") {
            copy.display = mapped.display;
        }
    }
    if (identifierSystem !== null) {
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
        if (!isStandardCodeSystem(node.system) || hasConceptMapSource(pack, node.system)) {
            rows.push({system: node.system, code: node.code, path: nodePath});
        }
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
