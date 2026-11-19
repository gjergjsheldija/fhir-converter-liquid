// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import {mkdir, readdir, realpath, stat, writeFile} from "fs/promises";
import {existsSync} from "fs";
import path from "path";
import {BASE_TEMPLATE_FILES_LOCATION, TEMPLATE_FILES_LOCATION} from "../constants/constants.js";
import {MANIFEST_FILE, detectFamilies, readManifest, writeManifest} from "./manifest.js";

function httpError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}

async function isInsideServerTemplateTree(resolvedDir) {
    for (const root of [BASE_TEMPLATE_FILES_LOCATION, TEMPLATE_FILES_LOCATION]) {
        const rootReal = await realpath(root).catch(() => path.resolve(root));
        if (resolvedDir === rootReal || resolvedDir.startsWith(rootReal + path.sep)) {
            return true;
        }
    }
    return false;
}

async function collectRelativeDirectories(rootDir, currentDir = rootDir, acc = []) {
    const entries = await readdir(currentDir, {withFileTypes: true});
    for (const entry of entries) {
        if (!entry.isDirectory()) {
            continue;
        }
        if (entry.name === ".git" || entry.name === "node_modules") {
            continue;
        }
        const childAbs = path.join(currentDir, entry.name);
        const rel = path.relative(rootDir, childAbs).split(path.sep).join("/");
        acc.push(rel);
        await collectRelativeDirectories(rootDir, childAbs, acc);
    }
    return acc;
}

export function chooseDetectedTemplateRoot(relDirs, family) {
    const folderName = family === "hl7v2" ? "Hl7v2" : "Ccda";
    const preferred = `templates/${folderName}`;
    if (relDirs.includes(preferred)) {
        return preferred;
    }
    if (relDirs.includes(folderName)) {
        return folderName;
    }
    const suffixMatch = relDirs.find((d) => d.endsWith(`/${folderName}`));
    return suffixMatch || preferred;
}

export function chooseStartupTemplateName(fileNames, family) {
    const liquidFiles = fileNames.filter((n) => n.toLowerCase().endsWith(".liquid")).sort();
    const priorities = family === "hl7v2"
        ? ["ADT_A04.liquid", "ADT_A01.liquid"]
        : ["CCD.liquid", "Example.liquid"];
    for (const p of priorities) {
        if (liquidFiles.includes(p)) {
            return p;
        }
    }
    return liquidFiles[0] || "Example.liquid";
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

export async function openLocalProject(options = {}) {
    const inputPath = typeof options.path === "string" ? options.path.trim() : "";
    if (!inputPath || !path.isAbsolute(inputPath)) {
        throw httpError(400, "Enter an absolute folder path.");
    }
    const info = await stat(inputPath).catch(() => null);
    if (!info || !info.isDirectory()) {
        throw httpError(404, "Folder not found.");
    }

    const resolved = await realpath(inputPath);
    if (await isInsideServerTemplateTree(resolved)) {
        throw httpError(400, "Open a copy of the templates, not the server tree.");
    }

    const manifestPath = path.join(resolved, MANIFEST_FILE);
    if (existsSync(manifestPath)) {
        const readRes = await readManifest(resolved);
        if (!readRes.ok) {
            throw httpError(400, readRes.error);
        }
        return {opened: true, path: resolved, manifest: readRes.manifest};
    }

    const relDirs = await collectRelativeDirectories(resolved);
    const detected = detectFamilies(relDirs);
    if (detected.length === 0) {
        throw httpError(404, "No HL7 v2 or C-CDA templates found.");
    }

    if (options.confirmFamilies === undefined) {
        return {
            opened: false,
            needsConfirm: true,
            path: resolved,
            detected
        };
    }

    if (!sameFamilySet(options.confirmFamilies, detected)) {
        throw httpError(400, "Those families do not match this folder.");
    }

    const roots = {};
    for (const fam of detected) {
        const templatesRel = chooseDetectedTemplateRoot(relDirs, fam);
        const samplesRel = fam === "hl7v2" ? "samples/hl7v2" : "samples/ccda";
        await mkdir(path.join(resolved, samplesRel), {recursive: true});
        roots[fam] = {
            templates: templatesRel,
            samples: samplesRel
        };
    }

    const startupFamily = detected[0];
    const startupTemplatesAbs = path.join(resolved, roots[startupFamily].templates);
    const tplEntries = await readdir(startupTemplatesAbs, {withFileTypes: true}).catch(() => []);
    const directTemplateFiles = tplEntries.filter((e) => e.isFile()).map((e) => e.name);
    const chosenTpl = chooseStartupTemplateName(directTemplateFiles, startupFamily);

    const startupSamplesAbs = path.join(resolved, roots[startupFamily].samples);
    const sampleEntries = await readdir(startupSamplesAbs, {withFileTypes: true}).catch(() => []);
    const directSamples = sampleEntries
        .filter((e) => e.isFile() && e.name !== ".gitkeep")
        .map((e) => e.name)
        .sort();

    let startupSampleRel;
    if (directSamples.length > 0) {
        startupSampleRel = `${roots[startupFamily].samples}/${directSamples[0]}`;
    } else {
        const gitkeepAbs = path.join(startupSamplesAbs, ".gitkeep");
        if (!existsSync(gitkeepAbs)) {
            await writeFile(gitkeepAbs, "", "utf8");
        }
        startupSampleRel = `${roots[startupFamily].samples}/.gitkeep`;
    }

    const manifest = {
        manifestVersion: 1,
        name: (path.basename(resolved) || "Project").slice(0, 80),
        fhirVersion: "R4",
        families: detected,
        startup: {
            family: startupFamily,
            sample: startupSampleRel,
            template: `${roots[startupFamily].templates}/${chosenTpl}`
        },
        roots
    };

    await writeManifest(resolved, manifest);
    return {opened: true, path: resolved, manifest};
}
