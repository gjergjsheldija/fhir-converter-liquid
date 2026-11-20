import assert from "assert";
import {createHash} from "crypto";
import {mkdtemp, readdir, readFile, rm} from "fs/promises";
import {existsSync} from "fs";
import os from "os";
import path from "path";
import {BASE_TEMPLATE_FILES_LOCATION, SAMPLE_DATA_LOCATION} from "../constants/constants.js";
import {createProject, slugifyProjectName} from "./createProject.js";
import {PINNED_HL7V2_BASELINE, validateManifest} from "./manifest.js";

async function sha256File(filePath) {
    const bytes = await readFile(filePath);
    return createHash("sha256").update(bytes).digest("hex");
}

describe("projects/createProject", function () {
    let tempRoot;

    before(async function () {
        tempRoot = await mkdtemp(path.join(os.tmpdir(), "fhir-create-proj-"));
    });

    after(async function () {
        if (tempRoot) {
            await rm(tempRoot, {recursive: true, force: true});
        }
    });

    it("slugifies project names and rejects symbol-only names", function () {
        assert.strictEqual(slugifyProjectName("  Adt   Rules! "), "adt-rules");
        assert.strictEqual(slugifyProjectName("---"), "");
        assert.strictEqual(slugifyProjectName("..."), "");
    });

    it("rejects non-absolute parent paths, missing folders, and server directories", async function () {
        await assert.rejects(
            () => createProject({name: "Demo", parentPath: "relative/dir", family: "hl7v2", startingPoint: "empty"}),
            (err) => err.status === 400 && err.message === "Enter an absolute folder path."
        );
        await assert.rejects(
            () => createProject({name: "Demo", parentPath: path.join(tempRoot, "missing"), family: "hl7v2", startingPoint: "empty"}),
            (err) => err.status === 404 && err.message === "Folder not found."
        );
        await assert.rejects(
            () => createProject({name: "Demo", parentPath: BASE_TEMPLATE_FILES_LOCATION, family: "hl7v2", startingPoint: "empty"}),
            (err) => err.status === 400 && err.message === "Choose a folder outside this server's templates and samples."
        );
    });

    it("creates an empty HL7 v2 project with three valid files and refuses duplicate directories", async function () {
        const res = await createProject({
            name: "Adt rules",
            parentPath: tempRoot,
            family: "hl7v2",
            startingPoint: "empty"
        });
        assert.ok(res.path.endsWith(path.sep + "adt-rules"));
        assert.strictEqual(validateManifest(res.manifest), null);
        assert.strictEqual(existsSync(path.join(res.path, "fhir-converter.json")), true);
        assert.strictEqual(existsSync(path.join(res.path, "samples/hl7v2/example.hl7")), true);
        assert.strictEqual(existsSync(path.join(res.path, "templates/Hl7v2/Example.liquid")), true);
        assert.strictEqual(res.manifest.roots.hl7v2.baseline, undefined);

        const sampleText = await readFile(path.join(res.path, "samples/hl7v2/example.hl7"), "utf8");
        assert.ok(sampleText.includes("DOE^JANE"));

        await assert.rejects(
            () => createProject({name: "Adt rules", parentPath: tempRoot, family: "hl7v2", startingPoint: "empty"}),
            (err) => err.status === 400 && err.message === "A folder with that name already exists."
        );
    });

    it("creates an HL7 v2 baseline project matching vendored SHA-256 hashes and four samples", async function () {
        const sourceTplPath = path.join(BASE_TEMPLATE_FILES_LOCATION, "Hl7v2", "ADT_A04.liquid");
        const sourceSamplePath = path.join(SAMPLE_DATA_LOCATION, "hl7v2", "ADT04-23.hl7");
        const sourceTplShaBefore = await sha256File(sourceTplPath);
        const sourceSampleSha = await sha256File(sourceSamplePath);

        const res = await createProject({
            name: "Baseline HL7",
            parentPath: tempRoot,
            family: "hl7v2",
            startingPoint: "baseline"
        });
        assert.strictEqual(res.manifest.roots.hl7v2.baseline.commit, PINNED_HL7V2_BASELINE.commit);
        assert.strictEqual(await sha256File(path.join(res.path, "templates/Hl7v2/ADT_A04.liquid")), sourceTplShaBefore);
        assert.strictEqual(await sha256File(path.join(res.path, "samples/hl7v2/ADT04-23.hl7")), sourceSampleSha);

        const copiedSamples = (await readdir(path.join(res.path, "samples/hl7v2"))).sort();
        assert.deepStrictEqual(copiedSamples, ["ADT04-23.hl7", "LAB-ORM-1.hl7", "LAB-ORU-1.hl7", "VXU.hl7"]);
        assert.strictEqual(await sha256File(sourceTplPath), sourceTplShaBefore);
    });

    it("creates an empty C-CDA project and a C-CDA baseline copy of the vendored pack", async function () {
        const res = await createProject({
            name: "Continuity care",
            parentPath: tempRoot,
            family: "ccda",
            startingPoint: "empty"
        });
        assert.strictEqual(validateManifest(res.manifest), null);
        const xmlText = await readFile(path.join(res.path, "samples/ccda/example.xml"), "utf8");
        assert.ok(xmlText.includes("IDE-CCD-1"));
        assert.ok(xmlText.includes("<given>Jane</given>"));
        assert.strictEqual(existsSync(path.join(res.path, "templates/Ccda/Example.liquid")), true);

        const sourceRoot = path.join(BASE_TEMPLATE_FILES_LOCATION, "Ccda", "CCD.liquid");
        const sourceSha = await sha256File(sourceRoot);
        const baseline = await createProject({
            name: "Ccda Baseline",
            parentPath: tempRoot,
            family: "ccda",
            startingPoint: "baseline"
        });
        assert.strictEqual(validateManifest(baseline.manifest), null);
        assert.strictEqual(baseline.manifest.roots.ccda.baseline.commit, PINNED_HL7V2_BASELINE.commit);
        assert.strictEqual(baseline.manifest.startup.template, "templates/Ccda/CCD.liquid");
        assert.strictEqual(await sha256File(path.join(baseline.path, "templates/Ccda/CCD.liquid")), sourceSha);
        assert.ok((await readFile(path.join(baseline.path, "samples/ccda/example.xml"), "utf8")).includes("IDE-CCD-1"));
        assert.strictEqual(await sha256File(sourceRoot), sourceSha);
    });
});
