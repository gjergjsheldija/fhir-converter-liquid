import assert from "assert";
import { Liquid } from "liquidjs";
import { match } from "./match.js";
import { external as helpers } from "../liquid-helpers.js";

describe("match filter", function () {
    it("returns an empty list for empty input or no match", function () {
        assert.deepStrictEqual(match(null, "a"), []);
        assert.deepStrictEqual(match("", "a"), []);
        assert.deepStrictEqual(match("abc", "[0-9]+"), []);
    });

    it("returns only the first match", function () {
        assert.deepStrictEqual(match("2.16.840.1 and 1.2", "[0123456789.]+"), ["2.16.840.1"]);
    });

    it("is registered and sizes like the CCDA SystemReference template", async function () {
        const engine = new Liquid({ strictFilters: true });
        const helper = helpers.find((h) => h.name === "match");
        assert.ok(helper, "match helper is registered");
        engine.registerFilter(helper.name, helper.func);
        assert.strictEqual(await engine.parseAndRender("{{ code | match: '[0-9.]+' | size }}", { code: "2.16" }), "1");
        assert.strictEqual(await engine.parseAndRender("{{ code | match: '[0-9.]+' | size }}", { code: "abc" }), "0");
    });
});
