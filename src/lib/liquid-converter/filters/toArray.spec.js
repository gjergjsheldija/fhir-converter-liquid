import assert from "assert";
import { Liquid } from "liquidjs";
import { toArray } from "./toArray.js";
import { external as helpers } from "../liquid-helpers.js";

describe("to_array filter", function () {
    it("returns an empty list for null and undefined", function () {
        assert.deepStrictEqual(toArray(null), []);
        assert.deepStrictEqual(toArray(undefined), []);
    });

    it("copies lists and wraps single values", function () {
        const list = [1, 2];
        assert.deepStrictEqual(toArray(list), [1, 2]);
        assert.notStrictEqual(toArray(list), list);
        assert.deepStrictEqual(toArray("abc"), ["abc"]);
        assert.deepStrictEqual(toArray({ a: 1 }), [{ a: 1 }]);
        assert.deepStrictEqual(toArray(0), [0]);
    });

    it("is registered and usable in a template", async function () {
        const engine = new Liquid({ strictFilters: true });
        const helper = helpers.find((h) => h.name === "to_array");
        assert.ok(helper, "to_array helper is registered");
        engine.registerFilter(helper.name, helper.func);
        const tpl = "{% assign xs = v | to_array %}{% for x in xs %}[{{ x }}]{% endfor %}";
        assert.strictEqual(await engine.parseAndRender(tpl, { v: "a" }), "[a]");
        assert.strictEqual(await engine.parseAndRender(tpl, { v: ["a", "b"] }), "[a][b]");
        assert.strictEqual(await engine.parseAndRender(tpl, {}), "");
    });
});
