import assert from "assert";
import {mkdir, mkdtemp, readFile, rm, symlink, writeFile} from "fs/promises";
import os from "os";
import path from "path";
import {createProject} from "./createProject.js";
import {emptyHl7v2Manifest, writeManifest} from "./manifest.js";
import {listProjectFiles, readProjectFile, writeProjectFile} from "./projectFiles.js";

function jsonResponse(status, body) {
    return {
        status,
        ok: status >= 200 && status < 300,
        async json() {
            return body;
        }
    };
}

describe("projects/projectFiles", function () {
    let tempRoot;
    let originalFetch;

    before(async function () {
        tempRoot = await mkdtemp(path.join(os.tmpdir(), "fhir-proj-files-"));
    });

    beforeEach(function () {
        originalFetch = global.fetch;
    });

    afterEach(function () {
        global.fetch = originalFetch;
    });

    after(async function () {
        if (tempRoot) {
            await rm(tempRoot, {recursive: true, force: true});
        }
    });

    it("lists local project files, skips .gitkeep, switches families, and reads files safely", async function () {
        const dualDir = path.join(tempRoot, "dual-proj");
        await mkdir(path.join(dualDir, "samples/hl7v2"), {recursive: true});
        await mkdir(path.join(dualDir, "templates/Hl7v2/Resource"), {recursive: true});
        await mkdir(path.join(dualDir, "samples/ccda"), {recursive: true});
        await mkdir(path.join(dualDir, "templates/Ccda"), {recursive: true});
        await writeFile(path.join(dualDir, "samples/hl7v2/.gitkeep"), "", "utf8");
        await writeFile(path.join(dualDir, "samples/hl7v2/a.hl7"), "MSH|^~\\&|...\n", "utf8");
        await writeFile(path.join(dualDir, "templates/Hl7v2/ADT_A04.liquid"), "{{ 'root' }}\n", "utf8");
        await writeFile(path.join(dualDir, "templates/Hl7v2/Resource/_Patient.liquid"), "{{ 'pat' }}\n", "utf8");
        await writeFile(path.join(dualDir, "samples/ccda/doc.xml"), "<ClinicalDocument/>\n", "utf8");
        await writeFile(path.join(dualDir, "templates/Ccda/CCD.liquid"), "{% comment %}ccda{% endcomment %}\n", "utf8");

        const dualManifest = {
            manifestVersion: 1,
            name: "Dual",
            fhirVersion: "R4",
            families: ["hl7v2", "ccda"],
            startup: {
                family: "hl7v2",
                sample: "samples/hl7v2/a.hl7",
                template: "templates/Hl7v2/ADT_A04.liquid"
            },
            roots: {
                hl7v2: {templates: "templates/Hl7v2", samples: "samples/hl7v2"},
                ccda: {templates: "templates/Ccda", samples: "samples/ccda"}
            }
        };
        await writeManifest(dualDir, dualManifest);

        const hl7Files = await listProjectFiles({kind: "local", path: dualDir});
        assert.strictEqual(hl7Files.family, "hl7v2");
        assert.deepStrictEqual(hl7Files.samples, ["samples/hl7v2/a.hl7"]);
        assert.deepStrictEqual(hl7Files.templates, [
            "templates/Hl7v2/ADT_A04.liquid",
            "templates/Hl7v2/Resource/_Patient.liquid"
        ]);

        const ccdaFiles = await listProjectFiles({kind: "local", path: dualDir, family: "ccda"});
        assert.strictEqual(ccdaFiles.family, "ccda");
        assert.deepStrictEqual(ccdaFiles.samples, ["samples/ccda/doc.xml"]);
        assert.deepStrictEqual(ccdaFiles.templates, ["templates/Ccda/CCD.liquid"]);

        const text = await readProjectFile({
            kind: "local",
            projectPath: dualDir,
            filePath: "templates/Hl7v2/ADT_A04.liquid"
        });
        assert.strictEqual(text, "{{ 'root' }}\n");
    });

    it("rejects path traversal and symlink escapes on read and write", async function () {
        const created = await createProject({
            name: "Escape guard",
            parentPath: tempRoot,
            family: "hl7v2",
            startingPoint: "empty"
        });
        const outsideSecret = path.join(tempRoot, "outside-secret.liquid");
        await writeFile(outsideSecret, "SECRET", "utf8");
        await symlink(outsideSecret, path.join(created.path, "templates/Hl7v2/linked.liquid"));

        await assert.rejects(
            () => readProjectFile({kind: "local", projectPath: created.path, filePath: "../outside-secret.liquid"}),
            (err) => err.status === 400 && err.message === "Invalid path."
        );
        await assert.rejects(
            () => readProjectFile({kind: "local", projectPath: created.path, filePath: "templates/Hl7v2/linked.liquid"}),
            (err) => err.status === 400 && err.message === "Invalid path."
        );
        await assert.rejects(
            () => writeProjectFile({projectPath: created.path, relativeFilePath: "../outside-secret.liquid", content: "X"}),
            (err) => err.status === 400 && err.message === "Invalid path."
        );
    });

    it("writes templates and samples under their allowed roots and rejects saving samples as templates", async function () {
        const created = await createProject({
            name: "Save rules",
            parentPath: tempRoot,
            family: "hl7v2",
            startingPoint: "empty"
        });
        const originalSample = await readFile(path.join(created.path, "samples/hl7v2/example.hl7"), "utf8");

        await writeProjectFile({
            projectPath: created.path,
            relativeFilePath: "templates/Hl7v2/Resource/_CustomObs.liquid",
            content: "{ \"resourceType\": \"Observation\" }\n"
        });
        assert.strictEqual(
            await readFile(path.join(created.path, "templates/Hl7v2/Resource/_CustomObs.liquid"), "utf8"),
            "{ \"resourceType\": \"Observation\" }\n"
        );

        await assert.rejects(
            () => writeProjectFile({
                projectPath: created.path,
                relativeFilePath: "samples/hl7v2/example.hl7",
                content: "OVERWRITE"
            }),
            (err) => err.status === 400 && err.message === "Save writes templates. The sample stays unchanged."
        );
        assert.strictEqual(await readFile(path.join(created.path, "samples/hl7v2/example.hl7"), "utf8"), originalSample);

        await writeProjectFile({
            projectPath: created.path,
            relativeFilePath: "samples/hl7v2/custom.hl7",
            target: "sample",
            content: "MSH|^~\\&|NEW\n"
        });
        assert.strictEqual(await readFile(path.join(created.path, "samples/hl7v2/custom.hl7"), "utf8"), "MSH|^~\\&|NEW\n");
    });

    it("lists GitHub project files using a single recursive Git Trees call", async function () {
        const manifest = emptyHl7v2Manifest("GitHub ADT");
        const urls = [];
        global.fetch = async (url) => {
            urls.push(url);
            return jsonResponse(200, {
                tree: [
                    {path: "fhir-converter.json", type: "blob"},
                    {path: "samples/hl7v2/.gitkeep", type: "blob"},
                    {path: "samples/hl7v2/msg1.hl7", type: "blob"},
                    {path: "templates/Hl7v2/ADT_A04.liquid", type: "blob"},
                    {path: "templates/Hl7v2/Resource/_Patient.liquid", type: "blob"}
                ]
            });
        };

        const res = await listProjectFiles({
            kind: "github",
            repo: "acme/rules",
            ref: "main",
            token: "",
            manifest
        });
        assert.strictEqual(urls.length, 1);
        assert.ok(urls[0].includes("/git/trees/main?recursive=1"));
        assert.deepStrictEqual(res.samples, ["samples/hl7v2/msg1.hl7"]);
        assert.deepStrictEqual(res.templates, [
            "templates/Hl7v2/ADT_A04.liquid",
            "templates/Hl7v2/Resource/_Patient.liquid"
        ]);
    });
});
