import {mkdir, readFile, writeFile} from "fs/promises";
import path from "path";

export const MANIFEST_FILE = "fhir-converter.json";

export const PINNED_HL7V2_BASELINE = Object.freeze({
    repository: "https://github.com/microsoft/FHIR-Converter",
    tag: "v7.0",
    commit: "253307fe6063a42b024ef7dbeb6aae157f1c2f61"
});

const ALLOWED_FAMILIES = ["hl7v2", "ccda"];

function isPlainObject(val) {
    return val !== null && typeof val === "object" && !Array.isArray(val);
}

export function isSafeRelativePath(value) {
    if (typeof value !== "string" || value.length === 0) {
        return false;
    }
    if (!/^[A-Za-z0-9._/-]+$/.test(value)) {
        return false;
    }
    if (value.startsWith("/") || value.endsWith("/")) {
        return false;
    }
    if (value.includes("..") || value.includes("//")) {
        return false;
    }
    return true;
}

export function validateManifest(value) {
    if (!isPlainObject(value)) {
        return "Project manifest must be a JSON object.";
    }
    if (value.manifestVersion !== 1) {
        return "Unsupported manifestVersion; expected 1.";
    }
    if (typeof value.name !== "string" || value.name.trim().length === 0 || value.name.length > 80) {
        return "Project name must be a non-empty string of at most 80 characters.";
    }
    if (value.fhirVersion !== "R4") {
        return "Unsupported fhirVersion; expected R4.";
    }
    if (!Array.isArray(value.families) || value.families.length === 0) {
        return "Project families must be a non-empty array.";
    }
    const seenFamilies = new Set();
    for (const fam of value.families) {
        if (!ALLOWED_FAMILIES.includes(fam)) {
            return `Unsupported project family '${String(fam)}'.`;
        }
        if (seenFamilies.has(fam)) {
            return "Project families must not contain duplicates.";
        }
        seenFamilies.add(fam);
    }
    if (value.families.length === 2 && (value.families[0] !== "hl7v2" || value.families[1] !== "ccda")) {
        return "When both families are present, hl7v2 must come before ccda.";
    }
    if (!isPlainObject(value.roots)) {
        return "Project roots must be an object.";
    }
    const rootKeys = Object.keys(value.roots);
    if (rootKeys.length !== value.families.length || !value.families.every((f) => Object.prototype.hasOwnProperty.call(value.roots, f))) {
        return "Project roots must match the declared families.";
    }
    for (const fam of value.families) {
        const root = value.roots[fam];
        if (!isPlainObject(root)) {
            return `Root entry for '${fam}' must be an object.`;
        }
        if (!isSafeRelativePath(root.templates) || !isSafeRelativePath(root.samples)) {
            return `Root paths for '${fam}' must be safe relative paths.`;
        }
        if (root.baseline !== undefined) {
            if (!isPlainObject(root.baseline)) {
                return `Baseline for '${fam}' must be an object.`;
            }
            for (const key of ["repository", "tag", "commit"]) {
                if (typeof root.baseline[key] !== "string" || root.baseline[key].trim().length === 0) {
                    return `Baseline '${key}' for '${fam}' must be a non-empty string.`;
                }
            }
        }
    }
    if (!isPlainObject(value.startup)) {
        return "Project startup configuration must be an object.";
    }
    if (!seenFamilies.has(value.startup.family)) {
        return "Startup family must be one of the declared project families.";
    }
    if (!isSafeRelativePath(value.startup.sample) || !isSafeRelativePath(value.startup.template)) {
        return "Startup sample and template must be safe relative paths.";
    }
    return null;
}

export function detectFamilies(relativeDirectoryNames) {
    if (!Array.isArray(relativeDirectoryNames)) {
        return [];
    }
    let hasHl7 = false;
    let hasCcda = false;
    for (const raw of relativeDirectoryNames) {
        if (typeof raw !== "string") {
            continue;
        }
        const entry = raw.replace(/^\/+|\/+$/g, "");
        if (entry === "templates/Hl7v2" || entry === "Hl7v2" || entry.endsWith("/Hl7v2")) {
            hasHl7 = true;
        }
        if (entry === "templates/Ccda" || entry === "Ccda" || entry.endsWith("/Ccda")) {
            hasCcda = true;
        }
    }
    const detected = [];
    if (hasHl7) {
        detected.push("hl7v2");
    }
    if (hasCcda) {
        detected.push("ccda");
    }
    return detected;
}

export function emptyHl7v2Manifest(name) {
    return {
        manifestVersion: 1,
        name: String(name || "").trim(),
        fhirVersion: "R4",
        families: ["hl7v2"],
        startup: {
            family: "hl7v2",
            sample: "samples/hl7v2/example.hl7",
            template: "templates/Hl7v2/Example.liquid"
        },
        roots: {
            hl7v2: {
                templates: "templates/Hl7v2",
                samples: "samples/hl7v2"
            }
        }
    };
}

export function emptyCcdaManifest(name) {
    return {
        manifestVersion: 1,
        name: String(name || "").trim(),
        fhirVersion: "R4",
        families: ["ccda"],
        startup: {
            family: "ccda",
            sample: "samples/ccda/example.xml",
            template: "templates/Ccda/Example.liquid"
        },
        roots: {
            ccda: {
                templates: "templates/Ccda",
                samples: "samples/ccda"
            }
        }
    };
}

export function baselineCcdaManifest(name) {
    return {
        manifestVersion: 1,
        name: String(name || "").trim(),
        fhirVersion: "R4",
        families: ["ccda"],
        startup: {
            family: "ccda",
            sample: "samples/ccda/example.xml",
            template: "templates/Ccda/CCD.liquid"
        },
        roots: {
            ccda: {
                templates: "templates/Ccda",
                samples: "samples/ccda",
                baseline: {
                    repository: PINNED_HL7V2_BASELINE.repository,
                    tag: PINNED_HL7V2_BASELINE.tag,
                    commit: PINNED_HL7V2_BASELINE.commit
                }
            }
        }
    };
}

export function baselineHl7v2Manifest(name) {
    return {
        manifestVersion: 1,
        name: String(name || "").trim(),
        fhirVersion: "R4",
        families: ["hl7v2"],
        startup: {
            family: "hl7v2",
            sample: "samples/hl7v2/ADT04-23.hl7",
            template: "templates/Hl7v2/ADT_A04.liquid"
        },
        roots: {
            hl7v2: {
                templates: "templates/Hl7v2",
                samples: "samples/hl7v2",
                baseline: {
                    repository: PINNED_HL7V2_BASELINE.repository,
                    tag: PINNED_HL7V2_BASELINE.tag,
                    commit: PINNED_HL7V2_BASELINE.commit
                }
            }
        }
    };
}

export async function readManifest(dir) {
    if (typeof dir !== "string" || dir.trim().length === 0) {
        return {ok: false, error: "Project folder path is required."};
    }
    const filePath = path.join(dir, MANIFEST_FILE);
    let raw;
    try {
        raw = await readFile(filePath, "utf8");
    } catch (err) {
        return {ok: false, error: "Project manifest fhir-converter.json was not found."};
    }
    if (raw.charCodeAt(0) === 0xFEFF) {
        return {ok: false, error: "Project manifest must be UTF-8 JSON without a BOM."};
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        return {ok: false, error: "Project manifest fhir-converter.json is not valid JSON."};
    }
    const validationError = validateManifest(parsed);
    if (validationError) {
        return {ok: false, error: validationError};
    }
    return {ok: true, manifest: parsed};
}

export async function writeManifest(dir, manifest) {
    const validationError = validateManifest(manifest);
    if (validationError) {
        throw new Error(validationError);
    }
    await mkdir(dir, {recursive: true});
    const filePath = path.join(dir, MANIFEST_FILE);
    await writeFile(filePath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
}
