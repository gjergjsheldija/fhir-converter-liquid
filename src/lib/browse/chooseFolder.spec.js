import {strict as assert} from "node:assert";
import {describe, it} from "mocha";
import {chooseLocalFolder} from "./sources.js";

describe("chooseLocalFolder", function () {
    it("returns the chosen path without a trailing slash", async function () {
        const result = await chooseLocalFolder(async () => "/Users/me/templates/\n");
        assert.equal(result.path, "/Users/me/templates");
    });

    it("reports a canceled dialog", async function () {
        await assert.rejects(
            () => chooseLocalFolder(async () => {
                const err = new Error("osascript failed");
                err.stderr = "execution error: User canceled. (-128)";
                throw err;
            }),
            (err) => err.status === 400 && err.message === "Folder choice was canceled."
        );
    });
});
