import assert from "assert";
import {mkdir, mkdtemp, readFile, rm, writeFile} from "fs/promises";
import {existsSync} from "fs";
import os from "os";
import path from "path";
import {BASE_TEMPLATE_FILES_LOCATION} from "../constants/constants.js";
import {createProject} from "./createProject.js";
import {MANIFEST_FILE} from "./manifest.js";
import {openLocalProject} from "./openProject.js";

describe("projects/openProject", function () {
    let tempRoot;

    before(async function () {
        tempRoot = await mkdtemp(path.join(os.tmpdir(), "fhir-open-proj-"));
    });

    after(async function () {
        if (tempRoot) {
            await rm(tempRoot, {recursive: true, force: true});
        }
    });

    it("opens a project created by createProject without modifying its manifest bytes", async function () {
        const created = await createProject({
            name: "Existing ADT",
            parentPath: tempRoot,
            family: "hl7v2",
            startingPoint: "empty"
        });
        const manifestPath = path.join(created.path, MANIFEST_FILE);
        const withExtra = JSON.stringify({...created.manifest, customKey: "keep-me"}, null, 2) + "\n";
        await writeFile(manifestPath, withExtra, "utf8");

        const opened = await openLocalProject({path: created.path});
        assert.strictEqual(opened.opened, true);
        assert.strictEqual(opened.manifest.startup.template, "templates/Hl7v2/Example.liquid");
        assert.strictEqual(opened.manifest.customKey, "keep-me");
        assert.strictEqual(await readFile(manifestPath, "utf8"), withExtra);
    });

    it("detects unmanifested Hl7v2 folder, waits for confirm, rejects wrong confirm, and writes manifest on match", async function () {
        const bareDir = path.join(tempRoot, "bare-rules");
        await mkdir(path.join(bareDir, "Hl7v2"), {recursive: true});
        await writeFile(path.join(bareDir, "Hl7v2", "ADT_A04.liquid"), "{{ '' }}\n", "utf8");

        const first = await openLocalProject({path: bareDir});
        assert.strictEqual(first.opened, false);
        assert.strictEqual(first.needsConfirm, true);
        assert.deepStrictEqual(first.detected, ["hl7v2"]);
        assert.strictEqual(existsSync(path.join(bareDir, MANIFEST_FILE)), false);

        await assert.rejects(
            () => openLocalProject({path: bareDir, confirmFamilies: ["ccda"]}),
            (err) => err.status === 400 && err.message === "Those families do not match this folder."
        );
        assert.strictEqual(existsSync(path.join(bareDir, MANIFEST_FILE)), false);

        const confirmed = await openLocalProject({path: bareDir, confirmFamilies: ["hl7v2"]});
        assert.strictEqual(confirmed.opened, true);
        assert.strictEqual(confirmed.manifest.roots.hl7v2.templates, "Hl7v2");
        assert.strictEqual(confirmed.manifest.startup.template, "Hl7v2/ADT_A04.liquid");
        assert.strictEqual(confirmed.manifest.startup.sample, "samples/hl7v2/.gitkeep");
        assert.strictEqual(existsSync(path.join(bareDir, MANIFEST_FILE)), true);
    });

    it("returns 404 when no HL7v2 or C-CDA template directories exist and refuses server template trees", async function () {
        const emptyDir = path.join(tempRoot, "no-templates");
        await mkdir(emptyDir, {recursive: true});
        await assert.rejects(
            () => openLocalProject({path: emptyDir}),
            (err) => err.status === 404 && err.message === "No HL7 v2 or C-CDA templates found."
        );

        await assert.rejects(
            () => openLocalProject({path: BASE_TEMPLATE_FILES_LOCATION}),
            (err) => err.status === 400 && err.message === "Open a copy of the templates, not the server tree."
        );
    });
});
