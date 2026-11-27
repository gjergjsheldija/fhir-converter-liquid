import assert from "node:assert/strict";
import supertest from "supertest";
import {attachGracefulShutdown} from "../src/lib/server/lifecycle.js";
import {createRuntimeApp} from "../src/runtime.js";

function createMockWorkerPool({ready = true} = {}) {
    return {
        isReady: () => ready,
        stats: () => ({workers: 2, queued: 0}),
        exec: async () => ({status: 200, resultMsg: {fhirResource: {resourceType: "Bundle"}}}),
        broadcast: () => {},
        destroy: async () => {}
    };
}

describe("Runtime Hardening (src/runtime.js, middleware, lifecycle)", function () {
    this.timeout(15000);

    let app;

    before(function () {
        app = createRuntimeApp({
            workerPool: createMockWorkerPool({ready: true}),
            bodyLimit: "1kb"
        });
    });

    it("exposes operational probe and metrics endpoints (/health, /healthz, /readyz, /version, /metrics)", async function () {
        const health = await supertest(app).get("/health").expect(200);
        assert.equal(health.body.status, "OK");

        const healthz = await supertest(app).get("/healthz").expect(200);
        assert.equal(healthz.body.status, "OK");

        const readyz = await supertest(app).get("/readyz").expect(200);
        assert.equal(readyz.body.status, "READY");
        assert.deepEqual(readyz.body.workers, {workers: 2, queued: 0});

        const version = await supertest(app).get("/version").expect(200);
        assert.equal(typeof version.body.version, "string");
        assert.ok(version.body.version.length > 0);

        const metrics = await supertest(app).get("/metrics").expect(200);
        assert.match(metrics.text, /http_request_duration_seconds/);
    });

    it("returns 503 NOT_READY on /readyz when worker pool is not ready", async function () {
        const unreadyApp = createRuntimeApp({
            workerPool: createMockWorkerPool({ready: false})
        });
        const res = await supertest(unreadyApp).get("/readyz").expect(503);
        assert.equal(res.body.status, "NOT_READY");
    });

    it("exposes conversion, customer, and direct FHIR/HL7v2 send routes", async function () {
        const convertRes = await supertest(app)
            .post("/api/v1/convert/hl7v2/ADT_A01")
            .set("Content-Type", "text/plain")
            .send("MSH|^~\\&|APP|FAC|DST|FAC|20260101||ADT^A01|1|P|2.3\r");
        assert.notEqual(convertRes.status, 404);

        const customersRes = await supertest(app).get("/api/v1/customers");
        assert.notEqual(customersRes.status, 404);

        const fhirSendRes = await supertest(app)
            .post("/api/v1/fhir/send")
            .send({});
        assert.equal(fhirSendRes.status, 400);
        assert.ok(fhirSendRes.body.error);
        assert.ok(fhirSendRes.body.requestId);

        const hl7SendRes = await supertest(app)
            .post("/api/v1/hl7v2/send")
            .send({});
        assert.equal(hl7SendRes.status, 400);
        assert.ok(hl7SendRes.body.error);
        assert.ok(hl7SendRes.body.requestId);
    });

    it("returns 404 for Studio and authoring routes", async function () {
        await supertest(app).get("/").expect(404);
        await supertest(app).get("/api/v1/templates").expect(404);
        await supertest(app).put("/api/v1/templates/ADT_A01.liquid").send("test").expect(404);
        await supertest(app).get("/api/v1/browse/folder").expect(404);
        await supertest(app).post("/api/v1/templategenerate").send({}).expect(404);
        await supertest(app).get("/api/v1/projects").expect(404);
        await supertest(app).post("/api/v1/projects/convert").send({}).expect(404);
        await supertest(app).get("/api-docs.json").expect(404);
    });

    it("generates X-Request-Id when absent and echoes valid incoming X-Request-Id", async function () {
        const generatedRes = await supertest(app).get("/healthz").expect(200);
        const generatedId = generatedRes.headers["x-request-id"];
        assert.equal(typeof generatedId, "string");
        assert.match(generatedId, /^[0-9a-f-]{36}$/i);

        const customId = "gw-req:2026/abc_123.45";
        const echoedRes = await supertest(app)
            .get("/healthz")
            .set("X-Request-Id", customId)
            .expect(200);
        assert.equal(echoedRes.headers["x-request-id"], customId);

        const invalidRes = await supertest(app)
            .get("/healthz")
            .set("X-Request-Id", "bad id with spaces!")
            .expect(200);
        assert.notEqual(invalidRes.headers["x-request-id"], "bad id with spaces!");
        assert.match(invalidRes.headers["x-request-id"], /^[0-9a-f-]{36}$/i);
    });

    it("returns structured JSON 400 with requestId on malformed JSON (never HTML)", async function () {
        const reqId = "malformed-json-req-1";
        const res = await supertest(app)
            .post("/api/v1/fhir/send")
            .set("Content-Type", "application/json")
            .set("X-Request-Id", reqId)
            .send("{\"broken\": ")
            .expect(400);

        assert.match(res.headers["content-type"], /application\/json/);
        assert.equal(res.body.requestId, reqId);
        assert.equal(res.body.error.code, "BadRequest");
        assert.match(res.body.error.message, /Malformed JSON/i);
    });

    it("returns structured JSON 413 with requestId when payload exceeds body limit", async function () {
        const reqId = "too-large-req-1";
        const res = await supertest(app)
            .post("/api/v1/fhir/send")
            .set("Content-Type", "application/json")
            .set("X-Request-Id", reqId)
            .send(JSON.stringify({data: "x".repeat(2048)}))
            .expect(413);

        assert.match(res.headers["content-type"], /application\/json/);
        assert.equal(res.body.requestId, reqId);
        assert.equal(res.body.error.code, "BadRequest");
        assert.match(res.body.error.message, /MAX_BODY_SIZE/);
    });

    it("attaches and detaches graceful shutdown signal listeners cleanly", function () {
        const beforeSigterm = process.listenerCount("SIGTERM");
        const beforeSigint = process.listenerCount("SIGINT");
        const beforeSighup = process.listenerCount("SIGHUP");

        const detach = attachGracefulShutdown({
            server: {close: (cb) => cb()},
            workerPool: createMockWorkerPool(),
            logger: {info: () => {}, error: () => {}},
            onSighup: () => {}
        });

        assert.equal(process.listenerCount("SIGTERM"), beforeSigterm + 1);
        assert.equal(process.listenerCount("SIGINT"), beforeSigint + 1);
        assert.equal(process.listenerCount("SIGHUP"), beforeSighup + 1);

        detach();

        assert.equal(process.listenerCount("SIGTERM"), beforeSigterm);
        assert.equal(process.listenerCount("SIGINT"), beforeSigint);
        assert.equal(process.listenerCount("SIGHUP"), beforeSighup);
    });
});
