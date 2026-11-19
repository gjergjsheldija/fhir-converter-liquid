import assert from "assert";
import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { Liquid } from "liquidjs";
import { external as helpers } from "../liquid-helpers.js";

describe("batch_render filter", function () {
    let root;
    let engine;

    before(async function () {
        root = await mkdtemp(path.join(os.tmpdir(), "batch-render-"));
        await mkdir(path.join(root, "Entry"), { recursive: true });
        await writeFile(path.join(root, "Entry", "Item.liquid"), `{"id":"{{ item }}","prefix":"{{ prefix }}"}`, "utf8");
        engine = new Liquid({ root, extname: ".liquid", strictFilters: true });
        const toArray = helpers.find((h) => h.name === "to_array");
        const batchRender = helpers.find((h) => h.name === "batch_render");
        assert.ok(batchRender, "batch_render helper is registered");
        engine.registerFilter(toArray.name, toArray.func);
        engine.registerFilter(batchRender.name, batchRender.func);
    });

    after(async function () {
        await rm(root, { recursive: true, force: true });
    });

    it("renders the template per entry and appends a comma after each", async function () {
        const out = await engine.parseAndRender("{{ list | to_array | batch_render: 'Entry/Item', 'item' }}", { list: ["a", "b"], prefix: "p" });
        assert.strictEqual(out, `{"id":"a","prefix":"p"},{"id":"b","prefix":"p"},`);
    });

    it("renders a single value once and a missing collection not at all", async function () {
        assert.strictEqual(
            await engine.parseAndRender("{{ list | to_array | batch_render: 'Entry/Item', 'item' }}", { list: "only" }),
            `{"id":"only","prefix":""},`
        );
        assert.strictEqual(await engine.parseAndRender("{{ list | to_array | batch_render: 'Entry/Item', 'item' }}", {}), "");
    });

    it("does not leave the entry variable in the caller scope", async function () {
        const out = await engine.parseAndRender("{{ list | batch_render: 'Entry/Item', 'item' }}[{{ item }}]", { list: ["a"] });
        assert.ok(out.endsWith("[]"));
    });
});
