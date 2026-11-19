import assert from "assert";
import {dispatchProviderChat, stripMarkdownCodeFence} from "./providerClients.js";

function jsonResp(status, body) {
    return {
        status,
        ok: status >= 200 && status < 300,
        async json() {
            return body;
        }
    };
}

describe("ai/providerClients", function () {
    let originalFetch;

    beforeEach(function () {
        originalFetch = global.fetch;
    });

    afterEach(function () {
        global.fetch = originalFetch;
    });

    it("strips markdown code fences cleanly", function () {
        assert.strictEqual(stripMarkdownCodeFence("```liquid\n{{ 'ok' }}\n```"), "{{ 'ok' }}");
        assert.strictEqual(stripMarkdownCodeFence("```json\n{\"a\":1}\n```"), "{\"a\":1}");
        assert.strictEqual(stripMarkdownCodeFence("  {{ 'plain' }}  "), "{{ 'plain' }}");
    });

    it("calls OpenAI-compatible endpoints (OpenAI, Grok, Mistral) with Bearer header", async function () {
        let captured = null;
        global.fetch = async (url, init) => {
            captured = {url, init};
            return jsonResp(200, {choices: [{message: {content: "```liquid\n{ \"ok\": true }\n```"}}]});
        };

        const out = await dispatchProviderChat({
            provider: "xai",
            apiFormat: "openai",
            model: "grok-3-mini",
            apiKey: "xai-key-1",
            baseUrl: "https://api.x.ai/v1/",
            temperature: 0,
            prompt: "Convert MSH"
        });
        assert.strictEqual(out, "{ \"ok\": true }");
        assert.strictEqual(captured.url, "https://api.x.ai/v1/chat/completions");
        assert.strictEqual(captured.init.headers.Authorization, "Bearer xai-key-1");
    });

    it("calls Anthropic /messages with x-api-key and anthropic-version headers", async function () {
        let captured = null;
        global.fetch = async (url, init) => {
            captured = {url, init, body: JSON.parse(init.body)};
            return jsonResp(200, {content: [{type: "text", text: "```liquid\n{\"resourceType\":\"Patient\"}\n```"}]});
        };

        const out = await dispatchProviderChat({
            provider: "anthropic",
            apiFormat: "anthropic",
            model: "claude-sonnet-4-5",
            apiKey: "sk-ant-test",
            baseUrl: "https://api.anthropic.com/v1",
            temperature: 0,
            prompt: "Convert PID"
        });
        assert.strictEqual(out, "{\"resourceType\":\"Patient\"}");
        assert.strictEqual(captured.url, "https://api.anthropic.com/v1/messages");
        assert.strictEqual(captured.init.headers["x-api-key"], "sk-ant-test");
        assert.strictEqual(captured.init.headers["anthropic-version"], "2023-06-01");
        assert.strictEqual(captured.body.model, "claude-sonnet-4-5");
    });

    it("calls Google Gemini :generateContent with x-goog-api-key header", async function () {
        let captured = null;
        global.fetch = async (url, init) => {
            captured = {url, init, body: JSON.parse(init.body)};
            return jsonResp(200, {
                candidates: [{content: {parts: [{text: "{ \"resourceType\": \"Bundle\" }"}]}}]
            });
        };

        const out = await dispatchProviderChat({
            provider: "google",
            apiFormat: "google",
            model: "gemini-2.5-flash",
            apiKey: "AIza-test",
            baseUrl: "https://generativelanguage.googleapis.com/v1beta",
            temperature: 0,
            prompt: "Convert ORU"
        });
        assert.strictEqual(out, "{ \"resourceType\": \"Bundle\" }");
        assert.strictEqual(
            captured.url,
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
        );
        assert.strictEqual(captured.init.headers["x-goog-api-key"], "AIza-test");
        assert.strictEqual(captured.body.contents[0].parts[0].text, "Convert ORU");
    });
});
