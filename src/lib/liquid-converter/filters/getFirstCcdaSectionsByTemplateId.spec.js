import assert from "assert";
import { Liquid } from "liquidjs";
import { getFirstCcdaSectionsByTemplateId } from "./getFirstCcdaSectionsByTemplateId.js";
import { external as helpers } from "../liquid-helpers.js";

const sectionA = { templateId: { root: "2.16.840.1.113883.10.20.22.2.6.1" }, title: { _: "Allergies" } };
const sectionB = { templateId: [{ root: "2.16.840.1.113883.10.20.22.2.5.1" }], title: { _: "Problems" } };
const msg = { ClinicalDocument: { component: { structuredBody: { component: [{ section: sectionA }, { section: sectionB }] } } } };

describe("get_first_ccda_sections_by_template_id filter", function () {
    it("returns an empty object when the document has no structured body", function () {
        assert.deepStrictEqual(getFirstCcdaSectionsByTemplateId({ ClinicalDocument: {} }, "1.2"), {});
        assert.deepStrictEqual(getFirstCcdaSectionsByTemplateId({}, "1.2"), {});
    });

    it("keys sections by the normalized template id and keeps the first match", function () {
        const result = getFirstCcdaSectionsByTemplateId(msg, "2.16.840.1.113883.10.20.22.2.6.1|2.16.840.1.113883.10.20.22.2.5.1|9.9");
        assert.deepStrictEqual(Object.keys(result), ["2_16_840_1_113883_10_20_22_2_6_1", "2_16_840_1_113883_10_20_22_2_5_1"]);
        assert.strictEqual(result["2_16_840_1_113883_10_20_22_2_6_1"], sectionA);
        assert.strictEqual(result["2_16_840_1_113883_10_20_22_2_5_1"], sectionB);
    });

    it("accepts a single component object and matches case-insensitively", function () {
        const single = { ClinicalDocument: { component: { structuredBody: { component: { section: { templateId: { root: "ABC.1" } } } } } } };
        assert.deepStrictEqual(Object.keys(getFirstCcdaSectionsByTemplateId(single, "abc.1")), ["abc_1"]);
    });

    it("is registered and usable in a template", async function () {
        const engine = new Liquid({ strictFilters: true });
        const helper = helpers.find((h) => h.name === "get_first_ccda_sections_by_template_id");
        assert.ok(helper, "helper is registered");
        engine.registerFilter(helper.name, helper.func);
        const out = await engine.parseAndRender(
            "{% assign s = msg | get_first_ccda_sections_by_template_id: '2.16.840.1.113883.10.20.22.2.6.1' %}{{ s.2_16_840_1_113883_10_20_22_2_6_1.title._ }}",
            { msg });
        assert.strictEqual(out, "Allergies");
    });
});
