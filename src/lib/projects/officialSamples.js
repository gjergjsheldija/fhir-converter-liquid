import {mkdir, readdir, readFile, realpath, stat, writeFile} from "fs/promises";
import path from "path";
import {fileURLToPath} from "url";
import {readManifest} from "./manifest.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DEFAULT_OFFICIAL_HL7V2_SAMPLES_DIR = path.resolve(
    __dirname,
    "../../../test/e2e-test/liquid-fixtures/SampleData/Hl7v2"
);

function httpError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}

export async function copyOfficialHl7v2Samples(projectPathInput, sourceDir = DEFAULT_OFFICIAL_HL7V2_SAMPLES_DIR) {
    const inputPath = typeof projectPathInput === "string" ? projectPathInput.trim() : "";
    if (!inputPath || !path.isAbsolute(inputPath)) {
        throw httpError(400, "Enter an absolute folder path.");
    }
    const projInfo = await stat(inputPath).catch(() => null);
    if (!projInfo || !projInfo.isDirectory()) {
        throw httpError(404, "Folder not found.");
    }
    const rootReal = await realpath(inputPath);
    const readRes = await readManifest(rootReal);
    if (!readRes.ok) {
        throw httpError(400, readRes.error);
    }
    const manifest = readRes.manifest;
    if (!manifest.families.includes("hl7v2")) {
        throw httpError(400, "Official samples are HL7 v2 messages.");
    }

    const srcInfo = await stat(sourceDir).catch(() => null);
    if (!srcInfo || !srcInfo.isDirectory()) {
        throw httpError(500, "Official HL7 v2 samples are not installed on this server.");
    }
    const srcEntries = await readdir(sourceDir, {withFileTypes: true});
    const officialFiles = srcEntries
        .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".hl7"))
        .map((e) => e.name)
        .sort();
    if (officialFiles.length === 0) {
        throw httpError(500, "Official HL7 v2 samples are not installed on this server.");
    }

    const destSamplesCandidate = path.resolve(rootReal, manifest.roots.hl7v2.samples);
    await mkdir(destSamplesCandidate, {recursive: true});
    const destSamplesReal = await realpath(destSamplesCandidate);
    if (destSamplesReal !== rootReal && !destSamplesReal.startsWith(rootReal + path.sep)) {
        throw httpError(400, "Invalid path.");
    }

    const officialSet = new Set(officialFiles);
    const existingEntries = await readdir(destSamplesReal, {withFileTypes: true});
    const kept = existingEntries
        .filter((e) => e.isFile() && e.name !== ".gitkeep" && !officialSet.has(e.name))
        .map((e) => e.name)
        .sort();

    let copied = 0;
    let unchanged = 0;

    for (const fileName of officialFiles) {
        const srcBytes = await readFile(path.join(sourceDir, fileName));
        const destFile = path.join(destSamplesReal, fileName);
        const existingBytes = await readFile(destFile).catch(() => null);
        if (existingBytes && Buffer.compare(existingBytes, srcBytes) === 0) {
            unchanged += 1;
        } else {
            await writeFile(destFile, srcBytes);
            copied += 1;
        }
    }

    return {copied, unchanged, kept};
}
