import assert from "assert";
import { instance } from "./liquid-converter.js";
import { HL7V2_LIQUID_TEMPLATE_LOCATION } from "../constants/constants.js";
import hl7v2Liquid from "../parsers/hl7v2/hl7v2Liquid.js";
import fs from "fs";
import path from "path";
import os from "os";

describe("liquid-converter instance()", function () {
    it("returns a Liquid engine instance with parseAndRender", function () {
        const dataHandler = new hl7v2Liquid();
        const engine = instance(true, dataHandler, HL7V2_LIQUID_TEMPLATE_LOCATION);
        assert.ok(typeof engine.parseAndRender === "function");
    });

    it("caches instances per data type when createNew is false", function () {
        const dataHandler = new hl7v2Liquid();
        const first = instance(true, dataHandler, HL7V2_LIQUID_TEMPLATE_LOCATION);
        const second = instance(false, dataHandler, HL7V2_LIQUID_TEMPLATE_LOCATION);
        assert.strictEqual(first, second);
    });

    it("renders a trivial inline template with no custom filters", async function () {
        const dataHandler = new hl7v2Liquid();
        const engine = instance(true, dataHandler, HL7V2_LIQUID_TEMPLATE_LOCATION);
        const result = await engine.parseAndRender("{{ 'hi' | upcase }}", {});
        assert.strictEqual(result, "HI");
    });

    describe("override mechanism (currentContextTemplatesMap)", function () {
        it("uses override content instead of on-disk file when override is provided", async function () {
            const dataHandler = new hl7v2Liquid();
            const overrideContent = "Override: {{ value }}";
            const templatesMap = {
                "nonexistent-template.liquid": overrideContent
            };
            const engine = instance(true, dataHandler, HL7V2_LIQUID_TEMPLATE_LOCATION, templatesMap);
            const result = await engine.parseAndRender("{% include 'nonexistent-template' %}", { value: "test123" });
            assert.strictEqual(result, "Override: test123");
        });

        it("uses override for nested template paths with forward slash keys", async function () {
            const dataHandler = new hl7v2Liquid();
            const overrideContent = "Nested: {{ data }}";
            const templatesMap = {
                "sub/dir/_nested.liquid": overrideContent
            };
            const engine = instance(true, dataHandler, HL7V2_LIQUID_TEMPLATE_LOCATION, templatesMap);
            const result = await engine.parseAndRender("{% include 'sub/dir/nested' %}", { data: "nested-value" });
            assert.strictEqual(result, "Nested: nested-value");
        });

        it("falls through to real on-disk file when no override matches template name", async function () {
            // Create a temporary directory with a test template file
            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "liquid-test-"));
            const templateName = "test-template.liquid";
            const templatePath = path.join(tempDir, templateName);
            const templateContent = "Real file: {{ content }}";
            fs.writeFileSync(templatePath, templateContent);

            try {
                const dataHandler = new hl7v2Liquid();
                const templatesMap = {
                    "some-override.liquid": "Override content"
                };
                const engine = instance(true, dataHandler, tempDir, templatesMap);
                const result = await engine.parseAndRender("{% include 'test-template' %}", { content: "from-disk" });
                assert.strictEqual(result, "Real file: from-disk");
            } finally {
                // Cleanup
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
        });

        it("prefers override over on-disk file when both exist", async function () {
            // Create a temporary directory with a test template file
            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "liquid-test-"));
            const templateName = "test-template.liquid";
            const templatePath = path.join(tempDir, templateName);
            const diskContent = "Disk: {{ msg }}";
            fs.writeFileSync(templatePath, diskContent);

            try {
                const dataHandler = new hl7v2Liquid();
                const overrideContent = "Override: {{ msg }}";
                const templatesMap = {
                    "test-template.liquid": overrideContent
                };
                const engine = instance(true, dataHandler, tempDir, templatesMap);
                const result = await engine.parseAndRender("{% include 'test-template' %}", { msg: "override-wins" });
                assert.strictEqual(result, "Override: override-wins");
            } finally {
                // Cleanup
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
        });
    });

    describe("resolve() sub-directory template path resolution (matches upstream TemplateLocalFileSystem.GetAbsoluteTemplatePath)", function () {
        it("resolves a root-level (single segment) template reference without an underscore prefix", function () {
            const dataHandler = new hl7v2Liquid();
            const engine = instance(true, dataHandler, HL7V2_LIQUID_TEMPLATE_LOCATION);
            const resolved = engine.options.fs.resolve(HL7V2_LIQUID_TEMPLATE_LOCATION, "SomeTemplate", ".liquid");
            assert.strictEqual(resolved, path.resolve(HL7V2_LIQUID_TEMPLATE_LOCATION, "SomeTemplate.liquid"));
        });

        it("resolves a sub-directory template reference with an underscore prefix on the last segment only", function () {
            const dataHandler = new hl7v2Liquid();
            const engine = instance(true, dataHandler, HL7V2_LIQUID_TEMPLATE_LOCATION);
            const resolved = engine.options.fs.resolve(HL7V2_LIQUID_TEMPLATE_LOCATION, "Resource/Patient", ".liquid");
            assert.strictEqual(resolved, path.resolve(HL7V2_LIQUID_TEMPLATE_LOCATION, "Resource", "_Patient.liquid"));
        });

        it("resolves a code-mapping template reference (CodeSystem/CodeSystem) to a .json file without an underscore", function () {
            const dataHandler = new hl7v2Liquid();
            const engine = instance(true, dataHandler, HL7V2_LIQUID_TEMPLATE_LOCATION);
            const resolved = engine.options.fs.resolve(HL7V2_LIQUID_TEMPLATE_LOCATION, "CodeSystem/CodeSystem", ".liquid");
            assert.strictEqual(resolved, path.resolve(HL7V2_LIQUID_TEMPLATE_LOCATION, "CodeSystem", "CodeSystem.json"));
        });

        it("renders a real vendored template that evaluates a sub-directory template (ID/Bundle) without throwing", async function () {
            const dataHandler = new hl7v2Liquid();
            const engine = instance(true, dataHandler, HL7V2_LIQUID_TEMPLATE_LOCATION);
            const result = await engine.parseAndRender(
                "{% evaluate x using 'ID/Bundle' Data: DataObj %}{{ x }}",
                { DataObj: { Value: "test-input" } }
            );
            assert.ok(typeof result === "string" && result.length > 0);
        });
    });
});
