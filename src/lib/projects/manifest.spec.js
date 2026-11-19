import assert from "assert";
import {mkdtemp, rm} from "fs/promises";
import {existsSync} from "fs";
import os from "os";
import path from "path";
import {
    MANIFEST_FILE,
    validateManifest,
    detectFamilies,
    emptyHl7v2Manifest,
    emptyCcdaManifest,
    baselineHl7v2Manifest,
    readManifest,
    writeManifest
} from "./manifest.js";

describe("projects/manifest", function () {
    let tempRoot;

    before(async function () {
        tempRoot = await mkdtemp(path.join(os.tmpdir(), "fhir-manifest-spec-"));
    });

    after(async function () {
        if (tempRoot) {
            await rm(tempRoot, {recursive: true, force: true});
        }
    });

    it("exports MANIFEST_FILE as fhir-converter.json", function () {
        assert.strictEqual(MANIFEST_FILE, "fhir-converter.json");
    });

    it("accepts valid HL7v2, C-CDA, baseline, and dual-family manifests", function () {
        assert.strictEqual(validateManifest(emptyHl7v2Manifest("Adt rules")), null);
        assert.strictEqual(validateManifest(emptyCcdaManifest("Ccda rules")), null);
        assert.strictEqual(validateManifest(baselineHl7v2Manifest("Baseline rules")), null);

        const dual = {
            manifestVersion: 1,
            name: "Hospital integration",
            fhirVersion: "R4",
            families: ["hl7v2", "ccda"],
            startup: {
                family: "hl7v2",
                sample: "samples/hl7v2/example.hl7",
                template: "templates/Hl7v2/Example.liquid"
            },
            roots: {
                hl7v2: {templates: "templates/Hl7v2", samples: "samples/hl7v2"},
                ccda: {templates: "templates/Ccda", samples: "samples/ccda"}
            }
        };
        assert.strictEqual(validateManifest(dual), null);
    });

    it("rejects invalid version, fhirVersion, unknown family, mismatched startup, and path traversal", function () {
        const badVersion = {...emptyHl7v2Manifest("Adt"), manifestVersion: 2};
        assert.strictEqual(typeof validateManifest(badVersion), "string");

        const badFhir = {...emptyHl7v2Manifest("Adt"), fhirVersion: "R5"};
        assert.strictEqual(typeof validateManifest(badFhir), "string");

        const badFamily = {...emptyHl7v2Manifest("Adt"), families: ["json"], roots: {json: {templates: "t", samples: "s"}}};
        assert.strictEqual(typeof validateManifest(badFamily), "string");

        const badStartupFamily = {
            ...emptyHl7v2Manifest("Adt"),
            startup: {family: "ccda", sample: "samples/hl7v2/example.hl7", template: "templates/Hl7v2/Example.liquid"}
        };
        assert.strictEqual(typeof validateManifest(badStartupFamily), "string");

        const badPath = {
            ...emptyHl7v2Manifest("Adt"),
            startup: {family: "hl7v2", sample: "../secret.hl7", template: "templates/Hl7v2/Example.liquid"}
        };
        assert.strictEqual(typeof validateManifest(badPath), "string");
    });

    it("detects hl7v2 and ccda directory layouts in canonical order", function () {
        assert.deepStrictEqual(detectFamilies(["templates/Hl7v2", "notes"]), ["hl7v2"]);
        assert.deepStrictEqual(detectFamilies(["Ccda", "templates/Hl7v2"]), ["hl7v2", "ccda"]);
        assert.deepStrictEqual(detectFamilies(["templates/Other"]), []);
    });

    it("readManifest returns ok:false without throwing when directory is missing", async function () {
        const res = await readManifest(path.join(tempRoot, "does-not-exist"));
        assert.strictEqual(res.ok, false);
        assert.ok(typeof res.error === "string" && res.error.length > 0);
    });

    it("writeManifest then readManifest round-trips including unknown extra keys", async function () {
        const projDir = path.join(tempRoot, "round-trip");
        const manifest = {...emptyHl7v2Manifest("Adt rules"), note: "custom metadata"};
        await writeManifest(projDir, manifest);
        const readRes = await readManifest(projDir);
        assert.strictEqual(readRes.ok, true);
        assert.deepStrictEqual(readRes.manifest, manifest);
    });

    it("writeManifest throws on invalid manifest and leaves no file behind", async function () {
        const badDir = path.join(tempRoot, "invalid-write");
        await assert.rejects(() => writeManifest(badDir, {manifestVersion: 2}), Error);
        assert.strictEqual(existsSync(path.join(badDir, MANIFEST_FILE)), false);
    });
});
