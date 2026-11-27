import assert from "node:assert/strict";
import {createServer} from "node:http";
import {mkdir, mkdtemp, readFile, rm, writeFile, cp} from "node:fs/promises";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import express from "express";
import supertest from "supertest";
import routes from "../src/routes.js";
import {createSecretResolver} from "../src/lib/vault/secretResolver.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

function listenEphemeral(handler) {
    return new Promise((resolve, reject) => {
        const server = createServer(handler);
        server.listen(0, "127.0.0.1", () => {
            const addr = server.address();
            resolve({
                server,
                baseUrl: `http://127.0.0.1:${addr.port}`,
                close: () => new Promise((res) => server.close(res))
            });
        });
        server.on("error", reject);
    });
}

describe("Bidirectional FHIR <-> HL7v2 HTTP API, Gateways, Swagger & Customer Pipelines", function () {
    this.timeout(15000);

    let compositionBundle;
    let questionnaireBundle;
    let sampleHl7Adt;
    let tempCustomersRoot;
    let tempSecretsRoot;
    let mockFhirServer;
    let mockHl7Gateway;
    let receivedFhirPosts = [];
    let receivedGatewayPosts = [];
    let nextGatewayAckCode = "AA";
    let app;

    before(async function () {
        const [compRaw, qrRaw, adtRaw] = await Promise.all([
            readFile(join(repoRoot, "src/reverse-samples/fhir/Discharge_Composition_Bundle.json"), "utf8"),
            readFile(join(repoRoot, "src/reverse-samples/fhir/Discharge_QuestionnaireResponse_Bundle.json"), "utf8"),
            readFile(join(repoRoot, "src/sample-data/hl7v2/ADT01-23.hl7"), "utf8")
        ]);
        compositionBundle = JSON.parse(compRaw);
        questionnaireBundle = JSON.parse(qrRaw);
        sampleHl7Adt = adtRaw;

        mockFhirServer = await listenEphemeral((req, res) => {
            let body = "";
            req.on("data", (chunk) => {
                body += chunk.toString("utf8");
            });
            req.on("end", () => {
                receivedFhirPosts.push({
                    url: req.url,
                    headers: req.headers,
                    body: body ? JSON.parse(body) : null
                });
                res.writeHead(200, {"Content-Type": "application/fhir+json"});
                res.end(JSON.stringify({resourceType: "Bundle", type: "transaction-response", entry: []}));
            });
        });

        mockHl7Gateway = await listenEphemeral((req, res) => {
            let body = "";
            req.on("data", (chunk) => {
                body += chunk.toString("utf8");
            });
            req.on("end", () => {
                receivedGatewayPosts.push({
                    url: req.url,
                    headers: req.headers,
                    rawBody: body
                });
                const ackMessage =
                    `MSH|^~\\&|KIS|HOSP|RECARE|HUB|20261126150000||ACK^T02|ACK-1|P|2.5.1\r` +
                    `MSA|${nextGatewayAckCode}|MSG0001|${nextGatewayAckCode === "AA" ? "Accepted" : "Unknown Visit Number PV1-19"}`;
                res.writeHead(200, {"Content-Type": "application/json"});
                res.end(JSON.stringify({ack: ackMessage, ackCode: nextGatewayAckCode}));
            });
        });

        tempCustomersRoot = await mkdtemp(join(tmpdir(), "fhir-customers-e2e-"));
        tempSecretsRoot = await mkdtemp(join(tmpdir(), "fhir-k8s-secrets-e2e-"));

        const secretJsonPath = join(tempSecretsRoot, "klinikum-west.json");
        await writeFile(
            secretJsonPath,
            JSON.stringify({
                inboundKey: "cust-inbound-secret-42",
                fhirBearer: "fhir-secret-token-abc",
                gwApiKey: "gw-secret-key-xyz"
            }),
            "utf8"
        );

        const custDir = join(tempCustomersRoot, "klinikum-west");
        await mkdir(join(custDir, "input"), {recursive: true});
        await mkdir(join(custDir, "output"), {recursive: true});

        const refInputTpl = await readFile(join(repoRoot, "customers/example-hospital/input/ADT_A01.liquid"), "utf8");
        await writeFile(join(custDir, "input/ADT_A01.liquid"), refInputTpl, "utf8");
        // The reference templates share partials under input/R2/.
        await cp(join(repoRoot, "customers/example-hospital/input/R2"), join(custDir, "input/R2"), {recursive: true});

        const configYaml = [
            "customerId: klinikum-west",
            "name: Klinikum West",
            "inboundAuth:",
            "  type: api_key",
            "  headerName: X-Customer-Key",
            "  secretRef: file://klinikum-west.json#inboundKey",
            "identifiers:",
            "  mrnSystem: https://hospital.example/fhir/sid/mrn",
            "  visitNumberSystem: https://hospital.example/fhir/sid/visit-nr",
            "  assigningAuthority: KLINIKUM_WEST",
            "msh:",
            "  sendingApplication: RECARE_DISCHARGE",
            "  sendingFacility: CLOUD",
            "  receivingApplication: ORBIS_KIS",
            "  receivingFacility: KLINIKUM_WEST",
            "  characterSet: UNICODE UTF-8",
            "requireCorrelationIds: true",
            "targets:",
            "  fhirServer:",
            `    baseUrl: ${mockFhirServer.baseUrl}/fhir`,
            "    transactionMode: conditional_update",
            "    auth:",
            "      type: bearer",
            "      tokenRef: file://klinikum-west.json#fhirBearer",
            "  hl7v2Gateway:",
            `    url: ${mockHl7Gateway.baseUrl}/hl7/inbound`,
            "    format: json_envelope",
            "    requireApplicationAck: true",
            "    auth:",
            "      type: api_key_header",
            "      headerName: X-Gateway-Key",
            "      apiKeyRef: file://klinikum-west.json#gwApiKey"
        ].join("\n");
        await writeFile(join(custDir, "config.yaml"), configYaml, "utf8");

        const secretResolver = createSecretResolver({
            secretsFileRoot: tempSecretsRoot
        });

        app = routes(express(), {
            customersRoot: tempCustomersRoot,
            secretResolver
        });
    });

    after(async function () {
        delete process.env.HEADLESS_RUNTIME;
        delete process.env.CONVERT_API_KEY;
        if (mockFhirServer) {
            await mockFhirServer.close();
        }
        if (mockHl7Gateway) {
            await mockHl7Gateway.close();
        }
        if (tempCustomersRoot) {
            await rm(tempCustomersRoot, {recursive: true, force: true});
        }
        if (tempSecretsRoot) {
            await rm(tempSecretsRoot, {recursive: true, force: true});
        }
    });

    beforeEach(function () {
        receivedFhirPosts = [];
        receivedGatewayPosts = [];
        nextGatewayAckCode = "AA";
        delete process.env.HEADLESS_RUNTIME;
        delete process.env.CONVERT_API_KEY;
    });

    it("documents all bidirectional, gateway, FHIR, and customer endpoints in OpenAPI /api-docs.json", async function () {
        const res = await supertest(app).get("/api-docs.json").expect(200);
        const paths = Object.keys(res.body.paths || {});
        for (const expectedPath of [
            "/api/v1/convert/{srcDataType}",
            "/api/v1/convert/{srcDataType}/{template}",
            "/api/v1/fhir/send",
            "/api/v1/fhir/validate",
            "/api/v1/hl7v2/send",
            "/api/v1/customers",
            "/api/v1/customers/{customerId}",
            "/api/v1/customers/{customerId}/inbound/{template}",
            "/api/v1/customers/{customerId}/outbound/{template}"
        ]) {
            assert.ok(paths.includes(expectedPath), `Missing Swagger path ${expectedPath}`);
        }
    });

    it("serves reverse FHIR -> HL7v2 Studio samples, templates, and new /guide pages", async function () {
        const samplesRes = await supertest(app).get("/api/v1/sample-data?dataType=fhir").expect(200);
        const sampleNames = samplesRes.body.messages.map((m) => m.messageName);
        assert.ok(sampleNames.includes("fhir/Discharge_Composition_Bundle.json"));
        assert.ok(sampleNames.includes("fhir/Discharge_QuestionnaireResponse_Bundle.json"));

        const tplRes = await supertest(app).get("/api/v1/templates?dataType=fhir").expect(200);
        const tplNames = tplRes.body.templates.map((t) => t.templateName);
        assert.ok(tplNames.some((n) => n.endsWith("MDM_T02.liquid")));
        assert.ok(tplNames.some((n) => n.endsWith("ADT_A03.liquid")));
        assert.ok(tplNames.some((n) => n.endsWith("ORU_R01.liquid")));

        await supertest(app).get("/guide/fhir-to-hl7v2").expect(200).expect("Content-Type", /html/);
        await supertest(app).get("/guide/customer-pipelines").expect(200).expect("Content-Type", /html/);
    });

    it("converts both Hospital Discharge Bundles across MDM_T02, ADT_A03, and ORU_R01 in JSON and raw ER7 modes", async function () {
        for (const tpl of ["MDM_T02", "ADT_A03", "ORU_R01"]) {
            const jsonRes = await supertest(app)
                .post(`/api/v1/convert/fhir/${tpl}`)
                .set("Content-Type", "application/fhir+json")
                .send(compositionBundle)
                .expect(200);

            assert.equal(typeof jsonRes.body.hl7v2Message, "string");
            assert.ok(jsonRes.body.hl7v2Message.startsWith("MSH|^~\\&|"));
            assert.ok(jsonRes.body.segmentCount >= 5);

            const er7Res = await supertest(app)
                .post(`/api/v1/convert/fhir/${tpl}`)
                .set("Content-Type", "application/fhir+json")
                .set("Accept", "application/hl7-v2")
                .send(questionnaireBundle)
                .expect(200);

            assert.match(er7Res.headers["content-type"], /application\/hl7-v2/);
            assert.ok(er7Res.text.startsWith("MSH|^~\\&|"));
            assert.ok(er7Res.text.includes("\rPID|"));
            assert.ok(!er7Res.text.includes("\nLine 2 handover"), "Free-text newlines must be HL7-escaped");
        }
    });

    it("posts HL7v2 messages to a REST gateway via /api/v1/hl7v2/send and surfaces 422 on MSA|AE NACK", async function () {
        const er7 = "MSH|^~\\&|APP|FAC|HIS|HOSP|20261126120000||MDM^T02|CTRL-9001|P|2.5.1\rPID|1||PAT-1^^^HOSP^MR||Doe^Jane";

        const okRes = await supertest(app)
            .post("/api/v1/hl7v2/send")
            .send({
                gatewayUrl: `${mockHl7Gateway.baseUrl}/hl7/inbound`,
                hl7v2Message: er7,
                format: "json_envelope",
                auth: "bearer",
                token: "inline-gw-token"
            })
            .expect(200);

        assert.equal(okRes.body.ok, true);
        assert.equal(okRes.body.ack.ackCode, "AA");
        assert.equal(receivedGatewayPosts.length, 1);
        assert.equal(receivedGatewayPosts[0].headers["idempotency-key"], "CTRL-9001");
        assert.equal(receivedGatewayPosts[0].headers.authorization, "Bearer inline-gw-token");

        nextGatewayAckCode = "AE";
        const nackRes = await supertest(app)
            .post("/api/v1/hl7v2/send")
            .send({
                gatewayUrl: `${mockHl7Gateway.baseUrl}/hl7/inbound`,
                hl7v2Message: er7
            })
            .expect(422);

        assert.match(nackRes.body.error.message, /NACK \(AE\)/);
        assert.equal(nackRes.body.detail.ackCode, "AE");
    });

    it("lists customers with redacted Vault refs, enforces per-customer inboundAuth, and delivers inbound FHIR & outbound HL7v2", async function () {
        const listRes = await supertest(app).get("/api/v1/customers").expect(200);
        assert.equal(listRes.body.customers.length, 1);
        const custSummary = listRes.body.customers[0];
        assert.equal(custSummary.customerId, "klinikum-west");
        assert.equal(custSummary.targets.fhirServer.auth.tokenRef, "[REDACTED:file]");
        assert.equal(custSummary.targets.hl7v2Gateway.auth.apiKeyRef, "[REDACTED:file]");

        // Missing X-Customer-Key must be rejected with 401
        await supertest(app)
            .post("/api/v1/customers/klinikum-west/inbound/ADT_A01")
            .set("Content-Type", "application/hl7-v2")
            .send(sampleHl7Adt)
            .expect(401);

        // Inbound HL7v2 -> FHIR + direct delivery to customer's FHIR server using K8s secret file
        const inboundRes = await supertest(app)
            .post("/api/v1/customers/klinikum-west/inbound/ADT_A01?deliver=true")
            .set("X-Customer-Key", "cust-inbound-secret-42")
            .set("Content-Type", "application/hl7-v2")
            .send(sampleHl7Adt)
            .expect(200);

        assert.equal(inboundRes.body.fhirResource.resourceType, "Bundle");
        assert.equal(inboundRes.body.delivery.ok, true);
        assert.equal(receivedFhirPosts.length, 1);
        assert.equal(receivedFhirPosts[0].headers.authorization, "Bearer fhir-secret-token-abc");
        assert.equal(receivedFhirPosts[0].body.type, "transaction");

        // Outbound FHIR Discharge Bundle -> HL7v2 MDM_T02 (fallback to built-in output template) + delivery to customer's HL7v2 gateway
        const outboundRes = await supertest(app)
            .post("/api/v1/customers/klinikum-west/outbound/MDM_T02?deliver=true")
            .set("X-Customer-Key", "cust-inbound-secret-42")
            .set("Content-Type", "application/fhir+json")
            .send(compositionBundle)
            .expect(200);

        assert.ok(outboundRes.body.hl7v2Message.includes("MSH|^~\\&|RECARE_DISCHARGE|CLOUD|ORBIS_KIS|KLINIKUM_WEST|"));
        assert.ok(outboundRes.body.hl7v2Message.includes("PAT-100492^^^KLINIKUM_WEST^MR"));
        assert.ok(outboundRes.body.hl7v2Message.includes("FALL-2026-55901^^^KLINIKUM_WEST^VN"));
        assert.equal(outboundRes.body.delivery.ok, true);
        assert.equal(outboundRes.body.delivery.ack.ackCode, "AA");
        assert.equal(receivedGatewayPosts.length, 1);
        assert.equal(receivedGatewayPosts[0].headers["x-gateway-key"], "gw-secret-key-xyz");
    });

    it("keeps customer pipelines active when HEADLESS_RUNTIME=true while blocking ad-hoc Studio gateway routes", async function () {
        process.env.HEADLESS_RUNTIME = "true";

        await supertest(app).post("/api/v1/hl7v2/send").send({}).expect(403);

        const outboundRes = await supertest(app)
            .post("/api/v1/customers/klinikum-west/outbound/ADT_A03")
            .set("X-Customer-Key", "cust-inbound-secret-42")
            .set("Content-Type", "application/fhir+json")
            .send(compositionBundle)
            .expect(200);

        assert.ok(outboundRes.body.hl7v2Message.startsWith("MSH|^~\\&|RECARE_DISCHARGE|CLOUD|ORBIS_KIS|KLINIKUM_WEST|"));
    });
});
