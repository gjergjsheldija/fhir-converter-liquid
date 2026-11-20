import assert from "assert";
import {spawnSync} from "child_process";
import {mkdir, mkdtemp, rm, writeFile} from "fs/promises";
import os from "os";
import path from "path";
import {fileURLToPath} from "url";
import {createProject} from "./createProject.js";

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../bin/convert.mjs");
const MESSAGE = "MSH|^~\\&|IDE|CLINIC|FHIR|SANDBOX|20200101120000||ADT^A04|MSG00001|P|2.5\n";

function runCli(args) {
    return spawnSync(process.execPath, [CLI, ...args], {encoding: "utf8", timeout: 60000});
}

describe("projects/convert CLI", function () {
    this.timeout(60000);
    let tempRoot;
    let projectPath;
    let messagePath;

    before(async function () {
        tempRoot = await mkdtemp(path.join(os.tmpdir(), "fhir-convert-cli-"));
        const created = await createProject({name: "Cli", parentPath: tempRoot, family: "hl7v2", startingPoint: "empty"});
        projectPath = created.path;
        await writeFile(
            path.join(projectPath, "templates", "Hl7v2", "Example.liquid"),
            '{ "resourceType": "Patient", "id": "cli-1" }\n',
            "utf8"
        );
        await writeFile(path.join(projectPath, "samples", "hl7v2", "case-a.hl7"), MESSAGE, "utf8");
        messagePath = path.join(projectPath, "samples", "hl7v2", "case-a.hl7");
        await mkdir(path.join(projectPath, "tests", "expected"), {recursive: true});
    });

    after(async function () {
        if (tempRoot) {
            await rm(tempRoot, {recursive: true, force: true});
        }
    });

    it("prints the converted resource for a single message", function () {
        const res = runCli(["--project", projectPath, "--message", messagePath, "--template", "Example"]);
        assert.strictEqual(res.status, 0, res.stderr);
        assert.strictEqual(JSON.parse(res.stdout).id, "cli-1");
    });

    it("exits 0 when the expected file matches and 1 naming the case when it differs", async function () {
        const expectedFile = path.join(projectPath, "tests", "expected", "case-a.json");
        await writeFile(expectedFile, JSON.stringify({resourceType: "Patient", id: "cli-1"}), "utf8");
        const ok = runCli(["--project", projectPath, "--check-goldens"]);
        assert.strictEqual(ok.status, 0, ok.stderr);
        assert.strictEqual(ok.stderr, "");

        await writeFile(expectedFile, JSON.stringify({resourceType: "Patient", id: "other"}), "utf8");
        const bad = runCli(["--project", projectPath, "--check-goldens"]);
        assert.strictEqual(bad.status, 1);
        assert.ok(bad.stderr.includes("case-a"), bad.stderr);
    });

    it("writes one usage line and exits 1 for invalid invocations", function () {
        const res = runCli(["--project", "relative/dir", "--check-goldens"]);
        assert.strictEqual(res.status, 1);
        assert.strictEqual(res.stderr.trim().split("\n").length, 1);
        assert.ok(res.stderr.startsWith("Usage:"));
    });

    it("falls back to base templates when --template is not overridden in the project", function () {
        const res = runCli(["--project", projectPath, "--message", messagePath, "--template", "ADT_A01"]);
        assert.strictEqual(res.status, 0, res.stderr);
        assert.strictEqual(JSON.parse(res.stdout).resourceType, "Bundle");
    });

    it("converts single messages and checks goldens (.ccda and .xml) for an empty C-CDA project", async function () {
        const ccdaCreated = await createProject({name: "CcdaCli", parentPath: tempRoot, family: "ccda", startingPoint: "empty"});
        const ccdaProjectPath = ccdaCreated.path;
        const ccdaDoc = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<ClinicalDocument xmlns="urn:hl7-org:v3">',
            '  <id root="2.16.840.1.113883.19.5" extension="ccda-doc-1"/>',
            '  <title>Continuity of Care Document</title>',
            '  <recordTarget><patientRole><id root="2.16.840.1.113883.19.5" extension="pat-ccda-1"/><patient><name><given>Jane</given><family>Doe</family></name></patient></patientRole></recordTarget>',
            '</ClinicalDocument>'
        ].join("\n");

        await writeFile(
            path.join(ccdaProjectPath, "templates", "Ccda", "Example.liquid"),
            '{ "resourceType": "Composition", "id": "{{ msg.ClinicalDocument.id.extension }}" }\n',
            "utf8"
        );
        const ccdaSamplePath = path.join(ccdaProjectPath, "samples", "ccda", "doc-one.ccda");
        const xmlSamplePath = path.join(ccdaProjectPath, "samples", "ccda", "doc-two.xml");
        await writeFile(ccdaSamplePath, ccdaDoc, "utf8");
        await writeFile(xmlSamplePath, ccdaDoc.replace("ccda-doc-1", "ccda-doc-2"), "utf8");

        const singleRes = runCli(["--project", ccdaProjectPath, "--message", ccdaSamplePath, "--template", "Example"]);
        assert.strictEqual(singleRes.status, 0, singleRes.stderr);
        assert.strictEqual(JSON.parse(singleRes.stdout).id, "ccda-doc-1");

        const fallbackRes = runCli(["--project", ccdaProjectPath, "--message", ccdaSamplePath, "--template", "CCD"]);
        assert.strictEqual(fallbackRes.status, 0, fallbackRes.stderr);
        assert.strictEqual(JSON.parse(fallbackRes.stdout).resourceType, "Bundle");

        const expectedDir = path.join(ccdaProjectPath, "tests", "expected");
        await mkdir(expectedDir, {recursive: true});
        await writeFile(path.join(expectedDir, "doc-one.json"), JSON.stringify({resourceType: "Composition", id: "ccda-doc-1"}), "utf8");
        await writeFile(path.join(expectedDir, "doc-two.json"), JSON.stringify({resourceType: "Composition", id: "ccda-doc-2"}), "utf8");

        const goldensOk = runCli(["--project", ccdaProjectPath, "--check-goldens", "--template", "Example"]);
        assert.strictEqual(goldensOk.status, 0, goldensOk.stderr);

        await writeFile(path.join(expectedDir, "doc-two.json"), JSON.stringify({resourceType: "Composition", id: "mismatch"}), "utf8");
        const goldensBad = runCli(["--project", ccdaProjectPath, "--check-goldens", "--template", "Example"]);
        assert.strictEqual(goldensBad.status, 1);
        assert.ok(goldensBad.stderr.includes("doc-two"), goldensBad.stderr);
    });
});
