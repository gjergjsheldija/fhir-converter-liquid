import assert from "assert";
import { gunzipSync } from "zlib";
import { Liquid } from "liquidjs";
import { gzip } from "./gzip.js";
import { external as helpers } from "../liquid-helpers.js";

describe("gzip filter", function () {
    it("returns base64 of the gzip-compressed UTF-8 bytes", function () {
        const encoded = gzip("<a>héllo</a>");
        assert.strictEqual(gunzipSync(Buffer.from(encoded, "base64")).toString("utf8"), "<a>héllo</a>");
        assert.deepStrictEqual([...Buffer.from(encoded, "base64").subarray(0, 2)], [0x1f, 0x8b]);
    });

    it("is registered and usable in a template", async function () {
        const engine = new Liquid({ strictFilters: true });
        const helper = helpers.find((h) => h.name === "gzip");
        assert.ok(helper, "gzip helper is registered");
        engine.registerFilter(helper.name, helper.func);
        const out = await engine.parseAndRender("{{ v | gzip }}", { v: "abc" });
        assert.strictEqual(gunzipSync(Buffer.from(out, "base64")).toString("utf8"), "abc");
    });
});
