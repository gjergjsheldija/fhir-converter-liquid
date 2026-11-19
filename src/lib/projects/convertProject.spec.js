import assert from "assert";
import {existsSync} from "fs";
import {mkdir, mkdtemp, rm, writeFile} from "fs/promises";
import {CCDA_LIQUID_TEMPLATE_LOCATION, HL7V2_LIQUID_TEMPLATE_LOCATION} from "../constants/constants.js";
import os from "os";
import path from "path";
import {convertInlineHl7v2} from "../workers/worker.js";
import {createProject} from "./createProject.js";
import {emptyCcdaManifest, emptyHl7v2Manifest, writeManifest} from "./manifest.js";
import {clearGithubConvertCache, prepareProjectConversion} from "./convertProject.js";

const SAMPLE_CCDA = `<ClinicalDocument xmlns="urn:hl7-org:v3">
  <id root="1.2.3"/>
</ClinicalDocument>`;

const SAMPLE_HL7 = [
    "MSH|^~\\&|IDE|CLINIC|FHIR|SANDBOX|20200101120000||ADT^A04|MSG00001|P|2.5",
    "EVN|A04|20200101120000",
    "PID|1||12345^^^CLINIC^MR||DOE^JANE||19800101|F",
    "PV1|1|O"
].join("\n");

function jsonResponse(status, body) {
    return {
        status,
        ok: status >= 200 && status < 300,
        async json() {
            return body;
        }
    };
}

describe("projects/convertProject", function () {
    let tempRoot;
    let originalFetch;

    before(async function () {
        tempRoot = await mkdtemp(path.join(os.tmpdir(), "fhir-convert-proj-"));
    });

    beforeEach(function () {
        originalFetch = global.fetch;
        clearGithubConvertCache();
    });

    afterEach(function () {
        global.fetch = originalFetch;
    });

    after(async function () {
        if (tempRoot) {
            await rm(tempRoot, {recursive: true, force: true});
        }
    });

    it("resolves partials strictly from the local project and does not fall back to service-templates", async function () {
        const created = await createProject({
            name: "Local partial test",
            parentPath: tempRoot,
            family: "hl7v2",
            startingPoint: "empty"
        });
        await mkdir(path.join(created.path, "templates/Hl7v2/Resource"), {recursive: true});
        await writeFile(
            path.join(created.path, "templates/Hl7v2/Resource/_OnlyInProject.liquid"),
            `{ "resourceType": "Patient", "id": "proj-only-1" }`,
            "utf8"
        );

        const rootTemplate = `{% assign firstSegments = hl7v2Data | get_first_segments: 'PID|MSH' -%}\n{ "resourceType": "Bundle", "type": "batch", "entry": [ { "resource": {% include 'Resource/OnlyInProject' %} } ] }`;
        const prep = await prepareProjectConversion({
            project: {kind: "local", path: created.path},
            template: rootTemplate,
            templatesOverride: {}
        });

        const projectResult = await convertInlineHl7v2({
            srcDataType: "hl7v2",
            srcData: SAMPLE_HL7,
            template: rootTemplate,
            templatesOverride: prep.templatesOverride,
            templateDirectory: prep.templateDirectory,
            strictOverridesOnly: prep.strictOverridesOnly
        });
        assert.strictEqual(projectResult.status, 200);
        assert.strictEqual(projectResult.resultMsg.fhirResource.entry[0].resource.id, "proj-only-1");

        // A partial missing from both the project and the built-in tree must still fail.
        const missingEverywhereTpl = `{ "resourceType": "Bundle", "entry": [ {% include 'Resource/DoesNotExistAnywhere' %} ] }`;
        await assert.rejects(
            () => convertInlineHl7v2({
                srcDataType: "hl7v2",
                srcData: SAMPLE_HL7,
                template: missingEverywhereTpl,
                templatesOverride: {},
                templateDirectory: prep.templateDirectory,
                fallbackTemplateDirectory: prep.fallbackTemplateDirectory
            }),
            (err) => err && err.status === 400
        );
    });

    it("falls back to the built-in template tree for partials the project does not have", async function () {
        const created = await createProject({
            name: "Local fallback test",
            parentPath: tempRoot,
            family: "hl7v2",
            startingPoint: "empty"
        });
        const prep = await prepareProjectConversion({
            project: {kind: "local", path: created.path},
            template: "",
            templatesOverride: {}
        });
        assert.strictEqual(prep.fallbackTemplateDirectory, HL7V2_LIQUID_TEMPLATE_LOCATION);

        // Resource/MessageHeader exists only in the built-in tree; the empty project falls back to it.
        const result = await convertInlineHl7v2({
            srcDataType: "hl7v2",
            srcData: SAMPLE_HL7,
            template: `{% include 'Resource/MessageHeader' %}`,
            templatesOverride: {},
            templateDirectory: prep.templateDirectory,
            strictOverridesOnly: prep.strictOverridesOnly,
            fallbackTemplateDirectory: prep.fallbackTemplateDirectory
        });
        assert.strictEqual(result.status, 200);
        assert.strictEqual(result.resultMsg.fhirResource.resource.resourceType, "MessageHeader");

        // GitHub conversion sets no fallback.
        const ghPrep = await prepareProjectConversion({
            project: {kind: "github", repo: "acme/rules", ref: "main", token: "", manifest: emptyHl7v2Manifest("GH")},
            template: "",
            templatesOverride: {}
        });
        assert.strictEqual(ghPrep.fallbackTemplateDirectory, undefined);
    });

    it("renders a project-only Z partial that the built-in tree does not have", async function () {
        const created = await createProject({
            name: "Local Z partial test",
            parentPath: tempRoot,
            family: "hl7v2",
            startingPoint: "empty"
        });
        await mkdir(path.join(created.path, "templates/Hl7v2/Z"), {recursive: true});
        await writeFile(
            path.join(created.path, "templates/Hl7v2/Z/_ZDG.liquid"),
            `{ "resourceType": "Basic", "id": "from-z" }`,
            "utf8"
        );
        assert.strictEqual(existsSync(path.join(HL7V2_LIQUID_TEMPLATE_LOCATION, "Z/_ZDG.liquid")), false);

        const rootTemplate = `{% include 'Z/ZDG' %}`;
        const prep = await prepareProjectConversion({
            project: {kind: "local", path: created.path},
            template: rootTemplate,
            templatesOverride: {}
        });
        const result = await convertInlineHl7v2({
            srcDataType: "hl7v2",
            srcData: SAMPLE_HL7,
            template: rootTemplate,
            templatesOverride: prep.templatesOverride,
            templateDirectory: prep.templateDirectory,
            strictOverridesOnly: prep.strictOverridesOnly,
            fallbackTemplateDirectory: prep.fallbackTemplateDirectory
        });
        assert.strictEqual(result.status, 200);
        assert.strictEqual(result.resultMsg.fhirResource.id, "from-z");
    });

    it("fetches and caches GitHub project partials, applies DotLiquid transforms to overrides, and prioritizes open tabs", async function () {
        const manifest = emptyHl7v2Manifest("GH Convert");
        let fetchCount = 0;
        const partialLiquid = `{% if true %}{ "resourceType": "Patient", "id": "from-github" }{% elseif false %}{}{% endif %}`;
        const encoded = Buffer.from(partialLiquid, "utf8").toString("base64");

        global.fetch = async (url) => {
            fetchCount += 1;
            if (url.includes("templates/Hl7v2/Resource/_Custom.liquid")) {
                return jsonResponse(200, {type: "file", content: encoded});
            }
            return jsonResponse(404, {message: "Not Found"});
        };

        const rootTemplate = `{ "resourceType": "Bundle", "type": "batch", "entry": [ { "resource": {% include 'Resource/Custom' %} } ] }`;
        const prep1 = await prepareProjectConversion({
            project: {kind: "github", repo: "acme/rules", ref: "main", token: "", manifest},
            template: rootTemplate,
            templatesOverride: {}
        });
        assert.strictEqual(fetchCount, 1);

        const res1 = await convertInlineHl7v2({
            srcDataType: "hl7v2",
            srcData: SAMPLE_HL7,
            template: rootTemplate,
            templatesOverride: prep1.templatesOverride,
            strictOverridesOnly: prep1.strictOverridesOnly
        });
        assert.strictEqual(res1.status, 200);
        assert.strictEqual(res1.resultMsg.fhirResource.entry[0].resource.id, "from-github");

        // Second call hits cache with 0 extra fetches
        await prepareProjectConversion({
            project: {kind: "github", repo: "acme/rules", ref: "main", token: "", manifest},
            template: rootTemplate,
            templatesOverride: {}
        });
        assert.strictEqual(fetchCount, 1);

        // Open-tab override wins over cached GitHub partial and receives DotLiquid elseif -> elsif transform
        const prepOverride = await prepareProjectConversion({
            project: {kind: "github", repo: "acme/rules", ref: "main", token: "", manifest},
            template: rootTemplate,
            templatesOverride: {
                "Resource/_Custom.liquid": `{% if false %}{}{% elseif true %}{ "resourceType": "Patient", "id": "from-tab-override" }{% endif %}`
            }
        });
        const resOverride = await convertInlineHl7v2({
            srcDataType: "hl7v2",
            srcData: SAMPLE_HL7,
            template: rootTemplate,
            templatesOverride: prepOverride.templatesOverride,
            strictOverridesOnly: prepOverride.strictOverridesOnly
        });
        assert.strictEqual(resOverride.resultMsg.fhirResource.entry[0].resource.id, "from-tab-override");
    });

    it("converts a ccda-only local project with its Ccda templates and falls back to the synced Ccda tree", async function () {
        const projectDir = path.join(tempRoot, "ccda-only-project");
        await mkdir(path.join(projectDir, "templates/Ccda/Resource"), {recursive: true});
        await writeManifest(projectDir, emptyCcdaManifest("Ccda only"));
        await writeFile(
            path.join(projectDir, "templates/Ccda/Resource/_OnlyInProject.liquid"),
            `{ "resourceType": "Patient", "id": "{{ msg.ClinicalDocument.id.root }}" }`,
            "utf8"
        );

        const rootTemplate = `{ "resourceType": "Bundle", "entry": [ { "resource": {% include 'Resource/OnlyInProject' %} } ], "system": {% include 'ValueSet/SystemReference' code: '2.16.840.1.113883.6.1' %} }`;
        const prep = await prepareProjectConversion({
            project: {kind: "local", path: projectDir},
            template: rootTemplate,
            templatesOverride: {}
        });
        assert.strictEqual(prep.srcDataType, "ccda");
        assert.strictEqual(path.basename(prep.templateDirectory), "Ccda");
        assert.strictEqual(prep.fallbackTemplateDirectory, CCDA_LIQUID_TEMPLATE_LOCATION);
        assert.strictEqual(prep.strictOverridesOnly, false);

        const result = await convertInlineHl7v2({
            srcDataType: prep.srcDataType,
            srcData: SAMPLE_CCDA,
            template: rootTemplate,
            templatesOverride: prep.templatesOverride,
            templateDirectory: prep.templateDirectory,
            strictOverridesOnly: prep.strictOverridesOnly,
            fallbackTemplateDirectory: prep.fallbackTemplateDirectory
        });
        assert.strictEqual(result.status, 200);
        assert.strictEqual(result.resultMsg.fhirResource.entry[0].resource.id, "1.2.3");
        // ValueSet/_SystemReference exists only in the synced Ccda tree.
        assert.strictEqual(result.resultMsg.fhirResource.system, "http://loinc.org");
    });

    it("keeps HL7 v2 behavior for a project that includes hl7v2 alongside ccda", async function () {
        const projectDir = path.join(tempRoot, "dual-family-project");
        await mkdir(path.join(projectDir, "templates/Hl7v2"), {recursive: true});
        await mkdir(path.join(projectDir, "templates/Ccda"), {recursive: true});
        const manifest = emptyHl7v2Manifest("Dual");
        manifest.families = ["hl7v2", "ccda"];
        manifest.roots.ccda = {templates: "templates/Ccda", samples: "samples/ccda"};
        await writeManifest(projectDir, manifest);

        const prep = await prepareProjectConversion({
            project: {kind: "local", path: projectDir},
            template: "",
            templatesOverride: {}
        });
        assert.strictEqual(prep.srcDataType, "hl7v2");
        assert.strictEqual(path.basename(prep.templateDirectory), "Hl7v2");
        assert.strictEqual(prep.fallbackTemplateDirectory, HL7V2_LIQUID_TEMPLATE_LOCATION);
    });
});
