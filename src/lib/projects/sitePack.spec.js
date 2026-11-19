import assert from "assert";
import {mkdir, mkdtemp, rm, writeFile} from "fs/promises";
import os from "os";
import path from "path";
import {applySitePack, loadSitePack} from "./sitePack.js";

const CONCEPT_MAP = {
    resourceType: "ConceptMap",
    group: [
        {
            source: "http://local/gender",
            target: "http://hl7.org/fhir/administrative-gender",
            element: [{code: "W", target: [{code: "female", display: "Female"}]}]
        },
        "not-an-object"
    ]
};

describe("projects/sitePack", function () {
    let tempRoot;

    before(async function () {
        tempRoot = await mkdtemp(path.join(os.tmpdir(), "fhir-site-pack-"));
    });

    after(async function () {
        if (tempRoot) {
            await rm(tempRoot, {recursive: true, force: true});
        }
    });

    it("treats a missing conceptmaps directory and identifiers.json as an empty pack", async function () {
        const root = await mkdtemp(path.join(tempRoot, "empty-"));
        const pack = await loadSitePack(root);
        assert.deepStrictEqual(pack, {conceptMaps: [], identifiers: {}});
    });

    it("rewrites a matching Coding and leaves other Codings unchanged", async function () {
        const root = await mkdtemp(path.join(tempRoot, "maps-"));
        await mkdir(path.join(root, "conceptmaps"));
        await writeFile(path.join(root, "conceptmaps/gender.json"), JSON.stringify(CONCEPT_MAP), "utf8");
        const pack = await loadSitePack(root);

        const resource = {
            resourceType: "Patient",
            extension: [
                {valueCoding: {system: "http://local/gender", code: "W"}},
                {valueCoding: {system: "http://local/gender", code: "X", display: "Other"}}
            ]
        };
        const before = JSON.stringify(resource);
        const out = applySitePack(resource, pack);
        assert.strictEqual(JSON.stringify(resource), before);
        assert.deepStrictEqual(out.extension[0].valueCoding, {
            system: "http://hl7.org/fhir/administrative-gender",
            code: "female",
            display: "Female"
        });
        assert.deepStrictEqual(out.extension[1].valueCoding, {
            system: "http://local/gender",
            code: "X",
            display: "Other"
        });
    });

    it("fills a missing Identifier system and keeps an existing one", async function () {
        const root = await mkdtemp(path.join(tempRoot, "ids-"));
        await writeFile(path.join(root, "identifiers.json"), JSON.stringify({MR: "http://clinic/mrn"}), "utf8");
        const pack = await loadSitePack(root);

        const out = applySitePack({
            resourceType: "Patient",
            identifier: [
                {value: "123", type: {coding: [{code: "MR"}]}},
                {value: "456", system: "urn:keep", type: {coding: [{code: "MR"}]}}
            ]
        }, pack);
        assert.strictEqual(out.identifier[0].system, "http://clinic/mrn");
        assert.strictEqual(out.identifier[1].system, "urn:keep");
    });

    it("throws status 400 for invalid JSON and for non-object JSON", async function () {
        const badJson = await mkdtemp(path.join(tempRoot, "bad-"));
        await mkdir(path.join(badJson, "conceptmaps"));
        await writeFile(path.join(badJson, "conceptmaps/broken.json"), "{ nope", "utf8");
        await assert.rejects(() => loadSitePack(badJson), (err) => err && err.status === 400);

        const notObject = await mkdtemp(path.join(tempRoot, "arr-"));
        await writeFile(path.join(notObject, "identifiers.json"), "[]", "utf8");
        await assert.rejects(() => loadSitePack(notObject), (err) => err && err.status === 400);
    });
});
