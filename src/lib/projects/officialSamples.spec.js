import assert from "assert";
import {mkdir, mkdtemp, readdir, rm, writeFile} from "fs/promises";
import os from "os";
import path from "path";
import {createProject} from "./createProject.js";
import {copyOfficialHl7v2Samples, DEFAULT_OFFICIAL_HL7V2_SAMPLES_DIR} from "./officialSamples.js";

describe("projects/officialSamples", function () {
    let tempRoot;

    before(async function () {
        tempRoot = await mkdtemp(path.join(os.tmpdir(), "fhir-official-samples-"));
    });

    after(async function () {
        if (tempRoot) {
            await rm(tempRoot, {recursive: true, force: true});
        }
    });

    it("copies official .hl7 files, skips unchanged bytes on repeat, and keeps custom project samples", async function () {
        const fakeSource = path.join(tempRoot, "fake-official");
        await mkdir(fakeSource, {recursive: true});
        await writeFile(path.join(fakeSource, "ADT-01.hl7"), "MSH|^~\\&|ONE\n", "utf8");
        await writeFile(path.join(fakeSource, "ORU-01.hl7"), "MSH|^~\\&|TWO\n", "utf8");

        const proj = await createProject({
            name: "Sample import test",
            parentPath: tempRoot,
            family: "hl7v2",
            startingPoint: "empty"
        });

        const first = await copyOfficialHl7v2Samples(proj.path, fakeSource);
        assert.deepStrictEqual(first, {copied: 2, unchanged: 0, kept: ["example.hl7"]});

        const second = await copyOfficialHl7v2Samples(proj.path, fakeSource);
        assert.deepStrictEqual(second, {copied: 0, unchanged: 2, kept: ["example.hl7"]});
    });

    it("rejects C-CDA-only projects without writing files", async function () {
        const ccdaProj = await createProject({
            name: "Ccda only",
            parentPath: tempRoot,
            family: "ccda",
            startingPoint: "empty"
        });

        await assert.rejects(
            () => copyOfficialHl7v2Samples(ccdaProj.path),
            (err) => err.status === 400 && err.message === "Official samples are HL7 v2 messages."
        );
    });

    it("copies all 139 official fixture samples and leaves the fixture directory intact", async function () {
        const proj = await createProject({
            name: "Real 139",
            parentPath: tempRoot,
            family: "hl7v2",
            startingPoint: "empty"
        });
        const res = await copyOfficialHl7v2Samples(proj.path);
        assert.strictEqual(res.copied + res.unchanged, 139);
        assert.deepStrictEqual(res.kept, ["example.hl7"]);

        const fixtureFilesAfter = (await readdir(DEFAULT_OFFICIAL_HL7V2_SAMPLES_DIR))
            .filter((n) => n.endsWith(".hl7"));
        assert.strictEqual(fixtureFilesAfter.length, 139);
    });
});
