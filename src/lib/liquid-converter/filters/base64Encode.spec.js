import assert from "assert";
import { Liquid } from "liquidjs";
import { base64Encode } from "./base64Encode.js";
import { external as helpers } from "../liquid-helpers.js";

describe("base64_encode filter", function () {
    it("returns base64 of the UTF-8 bytes", function () {
        assert.strictEqual(base64Encode("abc"), "YWJj");
        assert.strictEqual(base64Encode("é"), "w6k=");
        assert.strictEqual(base64Encode(""), "");
    });

    it("is registered and usable in a template", async function () {
        const engine = new Liquid({ strictFilters: true });
        const helper = helpers.find((h) => h.name === "base64_encode");
        assert.ok(helper, "base64_encode helper is registered");
        engine.registerFilter(helper.name, helper.func);
        assert.strictEqual(await engine.parseAndRender("{{ v | base64_encode }}", { v: "abc" }), "YWJj");
    });
});
