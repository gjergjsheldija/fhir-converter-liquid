import assert from "assert";
import {emptyHl7v2Manifest, validateManifest} from "./manifest.js";
import {openGithubProject} from "./openGithubProject.js";

function jsonResponse(status, body) {
    return {
        status,
        ok: status >= 200 && status < 300,
        async json() {
            return body;
        }
    };
}

describe("projects/openGithubProject", function () {
    let originalFetch;

    beforeEach(function () {
        originalFetch = global.fetch;
    });

    afterEach(function () {
        global.fetch = originalFetch;
    });

    it("opens a GitHub repo that already has a valid fhir-converter.json", async function () {
        const manifest = emptyHl7v2Manifest("Org ADT");
        const encoded = Buffer.from(JSON.stringify(manifest), "utf8").toString("base64");
        const seenUrls = [];

        global.fetch = async (url) => {
            seenUrls.push(url);
            return jsonResponse(200, {type: "file", content: encoded});
        };

        const res = await openGithubProject({repo: "acme/rules", ref: "", token: ""});
        assert.strictEqual(res.opened, true);
        assert.strictEqual(res.repo, "acme/rules");
        assert.deepStrictEqual(res.manifest, manifest);
        assert.strictEqual(seenUrls[0], "https://api.github.com/repos/acme/rules/contents/fhir-converter.json");
    });

    it("detects templates/Hl7v2 on 404 manifest, encodes ref, and returns wroteManifest:false on confirm", async function () {
        const seenUrls = [];
        global.fetch = async (url) => {
            seenUrls.push(url);
            if (url.includes("/contents/fhir-converter.json")) {
                return jsonResponse(404, {message: "Not Found"});
            }
            if (url.includes("/contents/templates/Hl7v2?")) {
                return jsonResponse(200, [{name: "ADT_A04.liquid", path: "templates/Hl7v2/ADT_A04.liquid", type: "file"}]);
            }
            if (url.includes("/contents/samples/hl7v2?")) {
                return jsonResponse(404, {message: "Not Found"});
            }
            if (url.includes("/contents/templates?")) {
                return jsonResponse(200, [{name: "Hl7v2", path: "templates/Hl7v2", type: "dir"}]);
            }
            return jsonResponse(200, [{name: "templates", path: "templates", type: "dir"}]);
        };

        const detectRes = await openGithubProject({repo: "acme/rules", ref: "feature/adt", token: "sec-tok"});
        assert.strictEqual(detectRes.opened, false);
        assert.strictEqual(detectRes.needsConfirm, true);
        assert.deepStrictEqual(detectRes.detected, ["hl7v2"]);
        assert.ok(seenUrls.every((u) => u.includes("ref=feature%2Fadt")));

        const confirmRes = await openGithubProject({
            repo: "acme/rules",
            ref: "feature/adt",
            token: "sec-tok",
            confirmFamilies: ["hl7v2"]
        });
        assert.strictEqual(confirmRes.opened, true);
        assert.strictEqual(confirmRes.wroteManifest, false);
        assert.strictEqual(confirmRes.manifest.name, "rules");
        assert.strictEqual(confirmRes.manifest.startup.template, "templates/Hl7v2/ADT_A04.liquid");
        assert.strictEqual(validateManifest(confirmRes.manifest), null);
    });

    it("rejects invalid refs containing spaces before calling fetch and never leaks tokens in errors", async function () {
        let called = false;
        global.fetch = async () => {
            called = true;
            return jsonResponse(401, {message: "Bad credentials"});
        };

        await assert.rejects(
            () => openGithubProject({repo: "acme/rules", ref: "a b", token: "super-secret"}),
            (err) => err.status === 400 && err.message === "Invalid ref." && !err.message.includes("super-secret")
        );
        assert.strictEqual(called, false);

        global.fetch = async () => jsonResponse(401, {message: "Bad credentials"});
        await assert.rejects(
            () => openGithubProject({repo: "acme/rules", ref: "main", token: "super-secret"}),
            (err) => err.status === 400 && err.message === "GitHub request failed with status 401." && !err.message.includes("super-secret")
        );
    });
});
