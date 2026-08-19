import assert from "assert";
import { getProperty } from "./getProperty.js";

describe("get_property filter", function () {
    it("returns the mapped code for a known value", function () {
        // 'Y' is a standard HL7 v2 Yes/No value expected to map to FHIR boolean-ish 'true'/'false' via CodeSystem/Yes_No
        const result = getProperty("Y", "CodeSystem/Yes_No", "code");
        assert.ok(result !== null && result !== undefined);
    });

    it("falls back to the default mapping when no specific code mapping exists", function () {
        // When code is not found, uses the __default__ mapping which maps to "false" for Yes_No
        const result = getProperty("totally-unmapped-code", "CodeSystem/Yes_No", "code");
        assert.strictEqual(result, "false");
    });

    it("returns null when any required argument is empty", function () {
        assert.strictEqual(getProperty("", "CodeSystem/Yes_No", "code"), null);
        assert.strictEqual(getProperty("Y", "", "code"), null);
    });
});
