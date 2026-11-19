// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import {cp, mkdir, realpath, rm, stat, writeFile} from "fs/promises";
import {existsSync} from "fs";
import path from "path";
import {
    BASE_TEMPLATE_FILES_LOCATION,
    SAMPLE_DATA_LOCATION,
    TEMPLATE_FILES_LOCATION
} from "../constants/constants.js";
import {
    baselineHl7v2Manifest,
    emptyCcdaManifest,
    emptyHl7v2Manifest,
    writeManifest
} from "./manifest.js";

const SYNTHETIC_HL7_SAMPLE = [
    "MSH|^~\\&|IDE|CLINIC|FHIR|SANDBOX|20200101120000||ADT^A04|MSG00001|P|2.5",
    "EVN|A04|20200101120000",
    "PID|1||12345^^^CLINIC^MR||DOE^JANE||19800101|F",
    "PV1|1|O"
].join("\n") + "\n";

const SYNTHETIC_HL7_TEMPLATE = `{% assign firstSegments = hl7v2Data | get_first_segments: 'PID|MSH' -%}
{
    "resourceType": "Bundle",
    "type": "batch",
    "entry": [
        {
            "resource": {
                "resourceType": "Patient",
                "name": [
                    {
                        "family": "{{ firstSegments.PID.5.1.Value }}",
                        "given": ["{{ firstSegments.PID.5.2.Value }}"]
                    }
                ]
            }
        }
    ]
}
`;

const SYNTHETIC_CCDA_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3">
  <typeId root="2.16.840.1.113883.1.3" extension="POCD_HD000040"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.2"/>
  <id root="2.16.840.1.113883.19.5.99999.1" extension="IDE-CCD-1"/>
  <code code="34133-9" codeSystem="2.16.840.1.113883.6.1" displayName="Summarization of Episode Note"/>
  <title>Synthetic continuity of care document</title>
  <recordTarget>
    <patientRole>
      <id extension="12345" root="2.16.840.1.113883.19.5"/>
      <patient>
        <name>
          <given>Jane</given>
          <family>Doe</family>
        </name>
      </patient>
    </patientRole>
  </recordTarget>
  <component>
    <structuredBody>
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.5.1"/>
          <code code="11450-4" codeSystem="2.16.840.1.113883.6.1" displayName="Problem list"/>
          <title>Problems</title>
          <text>Synthetic problem list. No real patient.</text>
        </section>
      </component>
    </structuredBody>
  </component>
</ClinicalDocument>
`;

const SYNTHETIC_CCDA_TEMPLATE = `{% comment %}
Empty C-CDA starter. This server does not convert C-CDA yet.
The document title in the sample is "Synthetic continuity of care document".
{% endcomment %}
`;

const BASELINE_SAMPLE_FILES = [
    "ADT04-23.hl7",
    "LAB-ORM-1.hl7",
    "LAB-ORU-1.hl7",
    "VXU.hl7"
];

function httpError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}

export function slugifyProjectName(name) {
    const slug = String(name || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9._-]/g, "")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
    if (!slug || slug === "." || slug === ".." || !/[a-z0-9]/.test(slug)) {
        return "";
    }
    return slug;
}

async function isInsideProtectedServerTrees(candidateProjectPath) {
    const protectedRoots = [
        BASE_TEMPLATE_FILES_LOCATION,
        TEMPLATE_FILES_LOCATION,
        SAMPLE_DATA_LOCATION
    ];
    for (const root of protectedRoots) {
        const rootReal = await realpath(root).catch(() => path.resolve(root));
        if (candidateProjectPath === rootReal || candidateProjectPath.startsWith(rootReal + path.sep)) {
            return true;
        }
    }
    return false;
}

export async function createProject(options = {}) {
    const rawName = typeof options.name === "string" ? options.name.trim() : "";
    const parentPath = typeof options.parentPath === "string" ? options.parentPath.trim() : "";
    const family = options.family;
    const startingPoint = options.startingPoint;

    if (family === "ccda" && startingPoint === "baseline") {
        throw httpError(400, "C-CDA baseline is not installed on this server. Create an empty C-CDA project.");
    }
    const validCombo =
        (family === "hl7v2" && (startingPoint === "empty" || startingPoint === "baseline")) ||
        (family === "ccda" && startingPoint === "empty");
    if (!validCombo) {
        throw httpError(400, "This server cannot create that project yet.");
    }

    if (!parentPath || !path.isAbsolute(parentPath)) {
        throw httpError(400, "Enter an absolute folder path.");
    }
    const parentInfo = await stat(parentPath).catch(() => null);
    if (!parentInfo || !parentInfo.isDirectory()) {
        throw httpError(404, "Folder not found.");
    }

    if (!rawName || rawName.length > 80) {
        throw httpError(400, "Use a name with letters or numbers.");
    }
    const slug = slugifyProjectName(rawName);
    if (!slug) {
        throw httpError(400, "Use a name with letters or numbers.");
    }

    const parentReal = await realpath(parentPath);
    const projectPath = path.join(parentReal, slug);

    if (await isInsideProtectedServerTrees(projectPath)) {
        throw httpError(400, "Choose a folder outside this server's templates and samples.");
    }

    if (existsSync(projectPath)) {
        throw httpError(400, "A folder with that name already exists.");
    }

    await mkdir(projectPath, {recursive: false});

    try {
        if (family === "hl7v2" && startingPoint === "empty") {
            const manifest = emptyHl7v2Manifest(rawName);
            await writeManifest(projectPath, manifest);
            await mkdir(path.join(projectPath, "samples", "hl7v2"), {recursive: true});
            await mkdir(path.join(projectPath, "templates", "Hl7v2"), {recursive: true});
            await writeFile(path.join(projectPath, "samples", "hl7v2", "example.hl7"), SYNTHETIC_HL7_SAMPLE, "utf8");
            await writeFile(path.join(projectPath, "templates", "Hl7v2", "Example.liquid"), SYNTHETIC_HL7_TEMPLATE, "utf8");
            return {path: projectPath, manifest};
        }

        if (family === "hl7v2" && startingPoint === "baseline") {
            const sourceTemplatesDir = path.join(BASE_TEMPLATE_FILES_LOCATION, "Hl7v2");
            const sourceSamplesDir = path.join(SAMPLE_DATA_LOCATION, "hl7v2");
            const tplInfo = await stat(sourceTemplatesDir).catch(() => null);
            if (!tplInfo || !tplInfo.isDirectory()) {
                throw httpError(500, "The HL7 v2 baseline is not installed on this server.");
            }
            for (const sampleName of BASELINE_SAMPLE_FILES) {
                const sInfo = await stat(path.join(sourceSamplesDir, sampleName)).catch(() => null);
                if (!sInfo || !sInfo.isFile()) {
                    throw httpError(500, "The HL7 v2 baseline is not installed on this server.");
                }
            }

            const manifest = baselineHl7v2Manifest(rawName);
            await writeManifest(projectPath, manifest);
            const destTemplatesDir = path.join(projectPath, "templates", "Hl7v2");
            const destSamplesDir = path.join(projectPath, "samples", "hl7v2");
            await mkdir(path.dirname(destTemplatesDir), {recursive: true});
            await mkdir(destSamplesDir, {recursive: true});
            await cp(sourceTemplatesDir, destTemplatesDir, {recursive: true});
            for (const sampleName of BASELINE_SAMPLE_FILES) {
                await cp(path.join(sourceSamplesDir, sampleName), path.join(destSamplesDir, sampleName));
            }
            return {path: projectPath, manifest};
        }

        const manifest = emptyCcdaManifest(rawName);
        await writeManifest(projectPath, manifest);
        await mkdir(path.join(projectPath, "samples", "ccda"), {recursive: true});
        await mkdir(path.join(projectPath, "templates", "Ccda"), {recursive: true});
        await writeFile(path.join(projectPath, "samples", "ccda", "example.xml"), SYNTHETIC_CCDA_SAMPLE, "utf8");
        await writeFile(path.join(projectPath, "templates", "Ccda", "Example.liquid"), SYNTHETIC_CCDA_TEMPLATE, "utf8");
        return {path: projectPath, manifest};
    } catch (err) {
        await rm(projectPath, {recursive: true, force: true}).catch(() => {});
        throw err;
    }
}
