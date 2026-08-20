import assert from "assert";
import hl7v2Liquid from "./hl7v2Liquid.js";

describe("hl7v2Liquid data handler", function () {
    it("has dataType 'hl7v2'", function () {
        const handler = new hl7v2Liquid();
        assert.strictEqual(handler.dataType, "hl7v2");
    });

    it("parses a minimal HL7v2 message into the segment-array model", async function () {
        const handler = new hl7v2Liquid();
        const msg = "MSH|^~\\&|SENDER|FAC|RECV|FAC|20230101120000||ADT^A01|123|P|2.3\nPID|1||12345^^^MRN\n";
        const parsed = await handler.parseSrcData(msg);
        assert.strictEqual(parsed.v2.meta[0], "MSH");
        assert.strictEqual(parsed.v2.meta[1], "PID");
    });

    it("does not transform ordinary Liquid template syntax in preProcessTemplate", function () {
        const handler = new hl7v2Liquid();
        const template = '{{ someValue | minus: -2 }}';
        assert.strictEqual(handler.preProcessTemplate(template), template);
    });

    it("normalizes redundant double braces inside {% %} tags in preProcessTemplate", function () {
        const handler = new hl7v2Liquid();
        const template = '{% assign x = {{y}} %}';
        assert.strictEqual(handler.preProcessTemplate(template), '{% assign x = y %}');
    });

    it("normalizes DotLiquid {% elseif %} tag name to {% elsif %} in preProcessTemplate", function () {
        const handler = new hl7v2Liquid();
        const template = '{% elseif foo %}';
        assert.strictEqual(handler.preProcessTemplate(template), '{% elsif foo %}');
    });

    it("normalizes DotLiquid double-dot property paths to a single dot in preProcessTemplate", function () {
        const handler = new hl7v2Liquid();
        const template = '{% if PV1..16 %}';
        assert.strictEqual(handler.preProcessTemplate(template), '{% if PV1.16 %}');
    });

    it("returns an unusedSegments report built from context.v2's tracked parsed data", async function () {
        const handler = new hl7v2Liquid();
        const msg = "MSH|^~\\&|SENDER|FAC|RECV|FAC|20230101120000||ADT^A01|123|P|2.3\nPID|1||12345^^^MRN\n";
        const parsed = await handler.parseSrcData(msg);
        const metadata = handler.getConversionResultMetadata(parsed);
        assert.strictEqual(Array.isArray(metadata.unusedSegments), true);
        // Nothing was rendered against a template, so PID's fields are all still untouched.
        assert.strictEqual(metadata.unusedSegments.some((r) => r.type === "PID"), true);
    });
});
