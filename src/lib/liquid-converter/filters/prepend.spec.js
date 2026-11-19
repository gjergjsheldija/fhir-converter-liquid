import assert from "assert";
import { Liquid } from "liquidjs";
import { prepend } from "./prepend.js";
import { external as helpers } from "../liquid-helpers.js";

describe("prepend filter (DotLiquid compat)", function () {
    it("returns null for a nil or missing input", function () {
        assert.strictEqual(prepend(null, "Encounter/"), null);
        assert.strictEqual(prepend(undefined, "Encounter/"), null);
    });

    it("prepends to strings and treats a nil operand as empty", function () {
        assert.strictEqual(prepend("a", "Encounter/"), "Encounter/a");
        assert.strictEqual(prepend("", "Encounter/"), "Encounter/");
        assert.strictEqual(prepend("a", null), "a");
        assert.strictEqual(prepend(1, 2), "21");
    });

    it("renders an empty value after prepending to a missing variable in a template", async function () {
        const engine = new Liquid({ strictFilters: true });
        const helper = helpers.find((h) => h.name === "prepend");
        assert.ok(helper, "prepend helper is registered");
        engine.registerFilter(helper.name, helper.func);
        const tpl = "{% assign d = missing | prepend: 'Encounter/' %}[{{ d }}]"
            + "{% assign e = 'x' | prepend: 'Encounter/' %}[{{ e }}]";
        assert.strictEqual(await engine.parseAndRender(tpl, {}), "[][Encounter/x]");
    });
});
