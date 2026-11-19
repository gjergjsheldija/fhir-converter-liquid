import assert from "assert";
import { Liquid } from "liquidjs";
import { append } from "./append.js";
import { external as helpers } from "../liquid-helpers.js";

describe("append filter (DotLiquid compat)", function () {
    it("returns null for a nil or missing input", function () {
        assert.strictEqual(append(null, "--"), null);
        assert.strictEqual(append(undefined, "--"), null);
    });

    it("appends to strings and treats a nil operand as empty", function () {
        assert.strictEqual(append("a", "--"), "a--");
        assert.strictEqual(append("", "--"), "--");
        assert.strictEqual(append("a", null), "a");
        assert.strictEqual(append(1, 2), "12");
    });

    it("keeps `x == null` true after appending to a missing value in a template", async function () {
        const engine = new Liquid({ strictFilters: true });
        const helper = helpers.find((h) => h.name === "append");
        assert.ok(helper, "append helper is registered");
        engine.registerFilter(helper.name, helper.func);
        const tpl = "{% assign d = missing | append: '--' %}{% if d == null %}nil{% else %}[{{ d }}]{% endif %}"
            + "{% assign e = 'x' | append: '--' %}{% if e == null %}nil{% else %}[{{ e }}]{% endif %}";
        assert.strictEqual(await engine.parseAndRender(tpl, {}), "nil[x--]");
    });
});
