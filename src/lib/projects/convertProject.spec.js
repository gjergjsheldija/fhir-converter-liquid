import assert from "assert";
import {mkdir, mkdtemp, rm, writeFile} from "fs/promises";
import os from "os";
import path from "path";
import {convertInlineHl7v2} from "../workers/worker.js";
import {createProject} from "./createProject.js";
import {emptyHl7v2Manifest} from "./manifest.js";
import {clearGithubConvertCache, prepareProjectConversion} from "./convertProject.js";

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

        // Referencing Resource/MessageHeader (which exists in service-templates, NOT in this empty project) must fail!
        const missingInProjTpl = `{ "resourceType": "Bundle", "entry": [ {% include 'Resource/MessageHeader' %} ] }`;
        await assert.rejects(
            () => convertInlineHl7v2({
                srcDataType: "hl7v2",
                srcData: SAMPLE_HL7,
                template: missingInProjTpl,
                templatesOverride: {},
                templateDirectory: prep.templateDirectory
            }),
            (err) => err && err.status === 400
        );
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
});
