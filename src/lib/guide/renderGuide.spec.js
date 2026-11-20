import assert from "assert";
import {join} from "path";
import {guideDocsRoot, renderGuideHtml, renderMarkdown} from "./renderGuide.js";

describe("renderGuide", function () {
    const source = join(guideDocsRoot(), "features.md");

    it("turns a feature link into a guide page", function () {
        const html = renderMarkdown("[Validate](features/validate.md)", source);
        assert.ok(html.includes('href="/guide/validate"'));
    });

    it("turns a screenshot into a guide image", function () {
        const page = join(guideDocsRoot(), "features", "validate.md");
        const html = renderMarkdown("![Validate](../images/fhir-validate.png)", page);
        assert.ok(html.includes('src="/guide/images/fhir-validate.png"'));
    });

    it("escapes raw HTML", function () {
        const html = renderMarkdown("<script>alert(1)</script>", source);
        assert.ok(!html.includes("<script>"));
        assert.ok(html.includes("&lt;script&gt;"));
    });

    it("hydrates active theme and palette in the guide page shell", async function () {
        const html = await renderGuideHtml();
        assert.ok(html.includes('data-theme="light" data-palette="paper"'));
        assert.ok(html.includes("fhirConverterSettings"));
    });
});
