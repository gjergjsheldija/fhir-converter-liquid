#!/usr/bin/env node
// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import {readdir, readFile} from "fs/promises";
import path from "path";
import {convertInlineHl7v2} from "../src/lib/workers/worker.js";
import {prepareProjectConversion} from "../src/lib/projects/convertProject.js";
import {readManifest} from "../src/lib/projects/manifest.js";
import {applySitePack, loadSitePack} from "../src/lib/projects/sitePack.js";
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

function resolveTemplatePath(templateDirectory, name) {
    const file = name.endsWith(".liquid") ? name : `${name}.liquid`;
    const resolved = path.resolve(templateDirectory, file);
    if (!resolved.startsWith(templateDirectory + path.sep)) {
        throw new Error(`Invalid template name '${name}'.`);
    }
    return resolved;
}

async function convert(prep, templatePath, messagePath) {
    const [template, srcData] = await Promise.all([
        readFile(templatePath, "utf8"),
        readFile(messagePath, "utf8")
    ]);
    const result = await convertInlineHl7v2({
        srcDataType: "hl7v2",
        srcData,
        template,
        templatesOverride: prep.templatesOverride,
        templateDirectory: prep.templateDirectory,
        fallbackTemplateDirectory: prep.fallbackTemplateDirectory,
        strictOverridesOnly: prep.strictOverridesOnly
    });
    if (result.status !== 200 || !result.resultMsg || !result.resultMsg.fhirResource) {
        throw new Error("Conversion did not produce a FHIR resource.");
    }
    return applySitePack(result.resultMsg.fhirResource, await loadSitePack(prep.projectRoot));
}

async function checkGoldens(prep, opts) {
    const readRes = await readManifest(prep.projectRoot);
    if (!readRes.ok) {
        throw new Error(readRes.error);
    }
    const manifest = readRes.manifest;
    const samplesRoot = path.resolve(prep.projectRoot, manifest.roots.hl7v2.samples);
    const templatePath = opts.template
        ? resolveTemplatePath(prep.templateDirectory, opts.template)
        : path.resolve(prep.projectRoot, manifest.startup.template);
    const expectedDir = path.join(prep.projectRoot, "tests", "expected");
    const entries = await readdir(expectedDir).catch(() => []);
    const names = entries.filter((name) => name.endsWith(".json")).sort();
    for (const name of names) {
        const basename = name.slice(0, -".json".length);
        try {
            const expectedText = await readFile(path.join(expectedDir, name), "utf8");
            const actual = await convert(prep, templatePath, path.join(samplesRoot, `${basename}.hl7`));
            compareContent(JSON.stringify(actual), expectedText);
        } catch {
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
        const resource = await convert(prep, resolveTemplatePath(prep.templateDirectory, opts.template), opts.message);
        process.stdout.write(`${JSON.stringify(resource, null, 2)}\n`);
        return 0;
    } catch (err) {
        process.stderr.write(`${errorText(err)}\n`);
        return 1;
    }
}

process.exitCode = await main();
