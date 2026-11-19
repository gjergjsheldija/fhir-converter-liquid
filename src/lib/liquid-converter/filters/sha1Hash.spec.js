import assert from "assert";
import { Liquid } from "liquidjs";
import { sha1Hash } from "./sha1Hash.js";
import { external as helpers } from "../liquid-helpers.js";

describe("sha1_hash filter", function () {
    it("returns lowercase hex SHA-1 of the UTF-8 bytes", function () {
        assert.strictEqual(sha1Hash("abc"), "a9993e364706816aba3e25717850c26c9cd0d89d");
        assert.strictEqual(sha1Hash(""), "da39a3ee5e6b4b0d3255bfef95601890afd80709");
    });

    it("is registered and usable in a template", async function () {
        const engine = new Liquid({ strictFilters: true });
        const helper = helpers.find((h) => h.name === "sha1_hash");
        assert.ok(helper, "sha1_hash helper is registered");
        engine.registerFilter(helper.name, helper.func);
        assert.strictEqual(await engine.parseAndRender("{{ v | sha1_hash }}", { v: "abc" }), "a9993e364706816aba3e25717850c26c9cd0d89d");
    });
});
