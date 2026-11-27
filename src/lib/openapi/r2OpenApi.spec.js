import assert from "assert";
import {execFile} from "child_process";
import express from "express";
import {mkdtemp, readFile, rm} from "fs/promises";
import os from "os";
import path from "path";
import {promisify} from "util";
import supertest from "supertest";
import requestContextMiddleware from "../../middleware/requestContext.js";
import registerCustomersRoutes, {buildCustomerOperationOutcome} from "../../routes/customers.routes.js";
import {CUSTOMERS_LOCATION} from "../constants/constants.js";
import {createSecretResolver} from "../vault/secretResolver.js";
import {buildR2OpenApiSpec, DEFAULT_R2_OPENAPI_OUTPUT} from "./r2OpenApi.js";

const execFileAsync = promisify(execFile);

describe("R2 OpenAPI 3.0 export and OperationOutcome customer errors", function () {
    it("exports valid OpenAPI 3.0.3 with only the 4 scoped routes, named schemas, security schemes, and headers", async function () {
        const tmpDir = await mkdtemp(path.join(os.tmpdir(), "r2-openapi-test-"));
        const outFile = path.join(tmpDir, "openapi.json");
        try {
            await execFileAsync(process.execPath, ["scripts/export-openapi.mjs", outFile]);
            const raw = await readFile(outFile, "utf8");
            const doc = JSON.parse(raw);

            assert.strictEqual(doc.openapi, "3.0.3");
            assert.deepStrictEqual(
                Object.keys(doc.paths).sort(),
                [
                    "/api/v1/customers/{customerId}/inbound/{template}",
                    "/api/v1/customers/{customerId}/outbound/{template}",
                    "/healthz",
                    "/readyz"
                ]
            );

            // Named schemas
            const schemas = doc.components.schemas;
            for (const name of ["InboundResult", "OutboundResult", "OperationOutcome", "HealthResponse", "ReadinessResponse"]) {
                assert.ok(schemas[name], `Missing schema ${name}`);
            }

            // Security schemes
            assert.strictEqual(doc.components.securitySchemes.CustomerApiKey.type, "apiKey");
            assert.strictEqual(doc.components.securitySchemes.CustomerApiKey.name, "X-Customer-Key");
            assert.strictEqual(doc.components.securitySchemes.ConvertBearerAuth.type, "http");
            assert.strictEqual(doc.components.securitySchemes.ConvertBearerAuth.scheme, "bearer");

            // Headers
            assert.strictEqual(doc.components.parameters.RequestIdHeader.name, "X-Request-Id");
            assert.strictEqual(doc.components.parameters.TraceparentHeader.name, "traceparent");
            assert.strictEqual(doc.components.parameters.TimezoneHeader.name, "timezone");
            assert.ok(doc.components.headers["X-Request-Id"]);

            // Inbound responses match real code (no fictional 422 or 504)
            const inboundResponses = doc.paths["/api/v1/customers/{customerId}/inbound/{template}"].post.responses;
            assert.strictEqual(
                inboundResponses["200"].content["application/json"].schema.$ref,
                "#/components/schemas/InboundResult"
            );
            assert.strictEqual(
                inboundResponses["400"].content["application/json"].schema.$ref,
                "#/components/schemas/OperationOutcome"
            );
            assert.strictEqual(inboundResponses["422"], undefined);
            assert.strictEqual(inboundResponses["504"], undefined);

            // Committed docs/r2-contract/openapi.json matches the built spec
            const committed = JSON.parse(await readFile(DEFAULT_R2_OPENAPI_OUTPUT, "utf8"));
            assert.deepStrictEqual(committed, buildR2OpenApiSpec());
        } finally {
            await rm(tmpDir, {recursive: true, force: true});
        }
    });

    it("returns FHIR OperationOutcome-shaped errors from sendCustomerError on customer routes", async function () {
        const direct = buildCustomerOperationOutcome(
            {requestId: "req-42"},
            Object.assign(new Error("Missing MRN"), {phase: "conversion", detail: {field: "PID-3"}}),
            422
        );
        assert.strictEqual(direct.resourceType, "OperationOutcome");
        assert.strictEqual(direct.id, "req-42");
        assert.strictEqual(direct.requestId, "req-42");
        assert.strictEqual(direct.phase, "conversion");
        assert.strictEqual(direct.issue[0].severity, "error");
        assert.strictEqual(direct.issue[0].code, "processing");
        assert.strictEqual(direct.issue[0].diagnostics, "Missing MRN");

        const app = express();
        app.use(express.text({type: ["text/plain", "application/hl7-v2"]}));
        app.use(express.json());
        app.use(requestContextMiddleware);

        const secretResolver = createSecretResolver({
            env: {
                EXAMPLE_HOSPITAL_SECRETS: JSON.stringify({inboundApiKey: "secret-key"})
            }
        });
        const failingWorkerPool = {
            exec: async () => ({
                status: 400,
                resultMsg: {error: {code: "BadRequest", message: "HL7v2 parse failed"}}
            })
        };

        registerCustomersRoutes(app, {
            workerPool: failingWorkerPool,
            recorder: null,
            requireApiKey: (req, res, next) => next(),
            secretResolver,
            customersRoot: CUSTOMERS_LOCATION
        });

        // 401 unauthorized -> OperationOutcome with code "login"
        const unauthRes = await supertest(app)
            .post("/api/v1/customers/example-hospital/inbound/ADT_A01")
            .set("X-Request-Id", "req-unauth-1")
            .set("Content-Type", "application/hl7-v2")
            .send("MSH|^~\\&|A|B|C|D|20261127100000||ADT^A01|M1|P|2.5.1\r")
            .expect(401);
        assert.strictEqual(unauthRes.body.resourceType, "OperationOutcome");
        assert.strictEqual(unauthRes.body.requestId, "req-unauth-1");
        assert.strictEqual(unauthRes.body.issue[0].code, "login");

        // 404 unknown customer -> OperationOutcome with code "not-found"
        const notFoundRes = await supertest(app)
            .post("/api/v1/customers/does-not-exist/inbound/ADT_A01")
            .set("X-Request-Id", "req-404-1")
            .set("Content-Type", "application/hl7-v2")
            .send("MSH|^~\\&|A|B|C|D|20261127100000||ADT^A01|M1|P|2.5.1\r")
            .expect(404);
        assert.strictEqual(notFoundRes.body.resourceType, "OperationOutcome");
        assert.strictEqual(notFoundRes.body.issue[0].code, "not-found");

        // 400 worker conversion error -> OperationOutcome with phase "conversion"
        const convErrRes = await supertest(app)
            .post("/api/v1/customers/example-hospital/inbound/ADT_A01")
            .set("X-Customer-Key", "secret-key")
            .set("X-Request-Id", "req-conv-1")
            .set("Content-Type", "application/hl7-v2")
            .send("NOT_AN_HL7_MESSAGE")
            .expect(400);
        assert.strictEqual(convErrRes.body.resourceType, "OperationOutcome");
        assert.strictEqual(convErrRes.body.phase, "conversion");
        assert.strictEqual(convErrRes.body.issue[0].code, "invalid");
        assert.strictEqual(convErrRes.body.issue[0].diagnostics, "HL7v2 parse failed");
    });
});
