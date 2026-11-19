import assert from "assert";
import { Liquid } from "liquidjs";
import { toJsonString } from "./toJsonString.js";
import { external as helpers } from "../liquid-helpers.js";

describe("to_json_string filter", function () {
    it("returns null for null and undefined", function () {
        assert.strictEqual(toJsonString(null), null);
        assert.strictEqual(toJsonString(undefined), null);
    });

    it("serializes values as compact JSON", function () {
        assert.strictEqual(toJsonString({ a: 1, b: ["x", { c: null }] }), '{"a":1,"b":["x",{"c":null}]}');
        assert.strictEqual(toJsonString("text"), '"text"');
        assert.strictEqual(toJsonString(0), "0");
        assert.strictEqual(toJsonString(false), "false");
    });

    it("is registered and usable in a template", async function () {
        const engine = new Liquid({ strictFilters: true });
        const helper = helpers.find((h) => h.name === "to_json_string");
        assert.ok(helper, "to_json_string helper is registered");
        engine.registerFilter(helper.name, helper.func);
        assert.strictEqual(await engine.parseAndRender("{{ obj | to_json_string }}", { obj: { id: "1" } }), '{"id":"1"}');
    });
});
