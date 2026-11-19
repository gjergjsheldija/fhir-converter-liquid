// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import {isValidGitRef, listGithub, parseGithubRepo, readGithubFile} from "../browse/sources.js";
import {MANIFEST_FILE, detectFamilies, validateManifest} from "./manifest.js";
import {chooseDetectedTemplateRoot, chooseStartupTemplateName} from "./openProject.js";

function httpError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}

function sameFamilySet(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) {
        return false;
    }
    const setA = new Set(a);
    const setB = new Set(b);
    if (setA.size !== setB.size || setA.size !== a.length) {
        return false;
    }
    for (const item of setA) {
        if (!setB.has(item)) {
            return false;
        }
    }
    return true;
}

export async function openGithubProject(options = {}) {
    const parsedRepo = parseGithubRepo(options.repo);
    if (!parsedRepo) {
        throw httpError(400, "Enter a GitHub repo as owner/repo or a github.com URL.");
    }
    const rawRef = options.ref === undefined || options.ref === null ? "" : String(options.ref);
    if (!isValidGitRef(rawRef)) {
        throw httpError(400, "Invalid ref.");
    }
    const canonicalRepo = `${parsedRepo.owner}/${parsedRepo.repo}`;
    const token = typeof options.token === "string" ? options.token : "";

    let manifestText = null;
    try {
        manifestText = await readGithubFile(canonicalRepo, MANIFEST_FILE, token, rawRef);
    } catch (err) {
        if (err && err.status !== 404) {
            throw err;
        }
    }

    if (manifestText !== null) {
        if (manifestText.charCodeAt(0) === 0xFEFF) {
            throw httpError(400, "Project manifest must be UTF-8 JSON without a BOM.");
        }
        let parsedManifest;
        try {
            parsedManifest = JSON.parse(manifestText);
        } catch (err) {
            throw httpError(400, "Project manifest fhir-converter.json is not valid JSON.");
        }
        const validationError = validateManifest(parsedManifest);
        if (validationError) {
            throw httpError(400, validationError);
        }
        return {
            opened: true,
            repo: canonicalRepo,
            ref: rawRef,
            manifest: parsedManifest
        };
    }

    const rootListing = await listGithub(canonicalRepo, "", token, rawRef);
    const relDirs = [];
    let hasTemplatesDir = false;
    for (const entry of rootListing.entries) {
        if (entry.type === "dir") {
            relDirs.push(entry.name);
            if (entry.name === "templates") {
                hasTemplatesDir = true;
            }
        }
    }
    if (hasTemplatesDir) {
        const tplListing = await listGithub(canonicalRepo, "templates", token, rawRef);
        for (const entry of tplListing.entries) {
            if (entry.type === "dir") {
                relDirs.push(`templates/${entry.name}`);
            }
        }
    }

    const detected = detectFamilies(relDirs);
    if (detected.length === 0) {
        throw httpError(404, "No HL7 v2 or C-CDA templates found.");
    }

    if (options.confirmFamilies === undefined) {
        return {
            opened: false,
            needsConfirm: true,
            repo: canonicalRepo,
            ref: rawRef,
            detected
        };
    }

    if (!sameFamilySet(options.confirmFamilies, detected)) {
        throw httpError(400, "Those families do not match this folder.");
    }

    const roots = {};
    for (const fam of detected) {
        roots[fam] = {
            templates: chooseDetectedTemplateRoot(relDirs, fam),
            samples: fam === "hl7v2" ? "samples/hl7v2" : "samples/ccda"
        };
    }

    const startupFamily = detected[0];
    const startupTplRoot = roots[startupFamily].templates;
    const startupSampleRoot = roots[startupFamily].samples;

    const tplEntriesResp = await listGithub(canonicalRepo, startupTplRoot, token, rawRef).catch(() => ({entries: []}));
    const directTemplates = tplEntriesResp.entries
        .filter((e) => e.type === "file")
        .map((e) => e.name);
    const chosenTpl = chooseStartupTemplateName(directTemplates, startupFamily);

    const sampleEntriesResp = await listGithub(canonicalRepo, startupSampleRoot, token, rawRef).catch(() => ({entries: []}));
    const directSamples = sampleEntriesResp.entries
        .filter((e) => e.type === "file" && e.name !== ".gitkeep")
        .map((e) => e.name)
        .sort();
    const startupSample = directSamples.length > 0
        ? `${startupSampleRoot}/${directSamples[0]}`
        : `${startupSampleRoot}/.gitkeep`;

    const manifest = {
        manifestVersion: 1,
        name: parsedRepo.repo.slice(0, 80),
        fhirVersion: "R4",
        families: detected,
        startup: {
            family: startupFamily,
            sample: startupSample,
            template: `${startupTplRoot}/${chosenTpl}`
        },
        roots
    };

    return {
        opened: true,
        wroteManifest: false,
        repo: canonicalRepo,
        ref: rawRef,
        manifest
    };
}
