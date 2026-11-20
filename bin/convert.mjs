#!/usr/bin/env node
// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import {readdir, readFile} from "fs/promises";
import path from "path";
import {
    applyProjectSitePack,
    fileExists,
    resolveProjectTemplatePath
} from "../src/lib/conversions/runConversion.js";
import {convertInlineHl7v2} from "../src/lib/workers/worker.js";
import {prepareProjectConversion} from "../src/lib/projects/convertProject.js";
import {readManifest} from "../src/lib/projects/manifest.js";
import {compareContent} from "../test/e2e-test/util/compare.js";

const USAGE =
    "Usage: node bin/convert.mjs --project <absolute dir> (--message <file> --template <name> | --check-goldens [--template <name>])";

function parseArgs(argv) {
    const opts = {};
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--check-goldens") {
            opts.checkGoldens = true;
        } else if (arg === "--project" || arg === "--message" || arg === "--template") {
            const value = argv[++i];
            if (!value) {
                return null;
            }
            opts[arg.slice(2)] = value;
        } else {
            return null;
        }
    }
    if (!opts.project || !path.isAbsolute(opts.project)) {
        return null;
    }
    if (!opts.checkGoldens && (!opts.message || !opts.template)) {
        return null;
    }
    return opts;
}

function errorText(err) {
    const msg = err && err.resultMsg;
    if (msg && msg.error && msg.error.message) {
        return msg.error.message;
    }
    return (err && err.message) || String(err);
}

async function resolveSamplePath(samplesRoot, basename, srcDataType) {
    if (srcDataType === "ccda") {
        const ccdaPath = path.join(samplesRoot, `${basename}.ccda`);
        if (await fileExists(ccdaPath)) {
            return ccdaPath;
        }
        const xmlPath = path.join(samplesRoot, `${basename}.xml`);
        if (await fileExists(xmlPath)) {
            return xmlPath;
        }
        return ccdaPath;
    }
    return path.join(samplesRoot, `${basename}.hl7`);
}

async function convert(prep, templatePath, messagePath) {
    const [template, srcData] = await Promise.all([
        readFile(templatePath, "utf8"),
        readFile(messagePath, "utf8")
    ]);
    const result = await convertInlineHl7v2({
        srcDataType: prep.srcDataType,
        srcData,
        template,
        templatesOverride: prep.templatesOverride,
        templateDirectory: prep.templateDirectory,
        fallbackTemplateDirectory: prep.fallbackTemplateDirectory,
        strictOverridesOnly: prep.strictOverridesOnly,
        declaredSegments: prep.declaredSegments
    });
    if (result.status !== 200 || !result.resultMsg || !result.resultMsg.fhirResource) {
        throw new Error("Conversion did not produce a FHIR resource.");
    }
    const {fhirResource} = await applyProjectSitePack(prep.projectRoot, result.resultMsg.fhirResource);
    return fhirResource;
}

async function checkGoldens(prep, opts) {
    const readRes = await readManifest(prep.projectRoot);
    if (!readRes.ok) {
        throw new Error(readRes.error);
    }
    const manifest = readRes.manifest;
    const familyRoots = prep.srcDataType === "ccda" ? manifest.roots.ccda : manifest.roots.hl7v2;
    const samplesRoot = path.resolve(prep.projectRoot, familyRoots.samples);
    let templatePath;
    if (opts.template) {
        templatePath = await resolveProjectTemplatePath(prep, opts.template);
    } else {
        const startupPath = path.resolve(prep.projectRoot, manifest.startup.template);
        if (await fileExists(startupPath)) {
            templatePath = startupPath;
        } else {
            const relToTemplates = path.relative(prep.templateDirectory, startupPath);
            if (!relToTemplates.startsWith("..") && !path.isAbsolute(relToTemplates)) {
                templatePath = await resolveProjectTemplatePath(prep, relToTemplates);
            } else {
                templatePath = startupPath;
            }
        }
    }
    const expectedDir = path.join(prep.projectRoot, "tests", "expected");
    const entries = await readdir(expectedDir).catch(() => []);
    const names = entries.filter((name) => name.endsWith(".json")).sort();
    for (const name of names) {
        const basename = name.slice(0, -".json".length);
        try {
            const expectedText = await readFile(path.join(expectedDir, name), "utf8");
            const samplePath = await resolveSamplePath(samplesRoot, basename, prep.srcDataType);
            const actual = await convert(prep, templatePath, samplePath);
            compareContent(JSON.stringify(actual), expectedText);
        } catch (err) {
            process.stderr.write(`${basename}\n`);
            return 1;
        }
    }
    return 0;
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    if (!opts) {
        process.stderr.write(`${USAGE}\n`);
        return 1;
    }
    try {
        const prep = await prepareProjectConversion({project: {kind: "local", path: opts.project}});
        if (opts.checkGoldens) {
            return await checkGoldens(prep, opts);
        }
        const templatePath = await resolveProjectTemplatePath(prep, opts.template);
        const resource = await convert(prep, templatePath, opts.message);
        process.stdout.write(`${JSON.stringify(resource, null, 2)}\n`);
        return 0;
    } catch (err) {
        process.stderr.write(`${errorText(err)}\n`);
        return 1;
    }
}

process.exitCode = await main();
