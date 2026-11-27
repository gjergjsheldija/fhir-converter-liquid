import assert from "assert";
import {mkdir, mkdtemp, rm, symlink, writeFile} from "fs/promises";
import os from "os";
import path from "path";
import {CUSTOMERS_LOCATION} from "../constants/constants.js";
import {createSecretResolver} from "../vault/secretResolver.js";
import {convertInlineHl7v2} from "../workers/worker.js";
import {
    clearCustomerCache,
    getRedactedCustomerSummary,
    listCustomers,
    loadCustomer,
    validateCustomerId,
    verifyCustomerInboundAuth
} from "./customerConfig.js";
import {
    buildCustomerContext,
    runCustomerInbound,
    runCustomerOutbound
} from "./customerPipeline.js";

const SAMPLE_ADT =
    "MSH|^~\\&|KIS|EXHOSP|FHIR_CONV|EXHOSP|20261126103000||ADT^A01^ADT_A01|MSG-ADT-101|P|2.5.1\r" +
    "EVN|A01|20261126103000\r" +
    "PID|1||MRN-778899^^^EXHOSP^MR||SCHMIDT^CLARA||19920315|F\r" +
    "PV1|1|IMP|WARD-3^12^A||||||||||||||||VISIT-5501^^^EXHOSP^VN\r";

describe("customers (customerConfig & customerPipeline)", function () {
    let tempCustomersRoot;

    beforeEach(async function () {
        clearCustomerCache();
        tempCustomersRoot = await mkdtemp(path.join(os.tmpdir(), "fhir-customers-spec-"));
    });

    afterEach(async function () {
        clearCustomerCache();
        await rm(tempCustomersRoot, {recursive: true, force: true});
    });

    describe("customerConfig & reference customer (customers/example-hospital)", function () {
        it("validates customerId format and blocks path traversal or symlink escapes", async function () {
            assert.strictEqual(validateCustomerId("example-hospital"), "example-hospital");
            assert.strictEqual(validateCustomerId("uk.essen_01"), "uk.essen_01");

            for (const badId of ["", ".", "..", "../etc", "UPPERCASE", "-leading-dash", "a/b", "a..b"]) {
                assert.throws(() => validateCustomerId(badId), {status: 400});
            }

            const outsideDir = await mkdtemp(path.join(os.tmpdir(), "fhir-outside-cust-"));
            try {
                await writeFile(
                    path.join(outsideDir, "config.yaml"),
                    "customerId: evil-link\nname: Evil\n",
                    "utf8"
                );
                await symlink(outsideDir, path.join(tempCustomersRoot, "evil-link"));
                await assert.rejects(() => loadCustomer("evil-link", tempCustomersRoot), {status: 400});
            } finally {
                await rm(outsideDir, {recursive: true, force: true});
            }
        });

        it("loads and redacts customers/example-hospital from the repository", async function () {
            const loaded = await loadCustomer("example-hospital", CUSTOMERS_LOCATION);
            assert.strictEqual(loaded.customerId, "example-hospital");
            assert.strictEqual(loaded.name, "Example University Hospital");
            assert.deepStrictEqual(loaded.templates.input, ["ADT_A01.liquid", "ADT_A03.liquid", "ADT_A08.liquid", "MDM_T02.liquid"]);
            assert.deepStrictEqual(loaded.templates.output, ["MDM_T02.liquid"]);
            assert.strictEqual(loaded.defaults.fallbackToBuiltin, true);
            assert.strictEqual(loaded.defaults.autoDeliverInbound, false);
            assert.strictEqual(loaded.defaults.autoDeliverOutbound, false);

            const summary = getRedactedCustomerSummary(loaded);
            assert.strictEqual(summary.inboundAuth.secretRef, "[REDACTED:env]");
            assert.strictEqual(summary.targets.fhirServer.auth.secretRef, "[REDACTED:env]");
            assert.strictEqual(summary.targets.hl7v2Gateway.auth.secretRef, "[REDACTED:env]");
            assert.strictEqual("customerDir" in summary, false);

            const allCustomers = await listCustomers(CUSTOMERS_LOCATION);
            const exampleEntry = allCustomers.find((c) => c.customerId === "example-hospital");
            assert.ok(exampleEntry);
            assert.strictEqual(exampleEntry.targets.fhirServer.auth.secretRef, "[REDACTED:env]");
        });

        it("verifies inboundAuth in constant time via X-Customer-Key and Authorization Bearer", async function () {
            const loaded = await loadCustomer("example-hospital", CUSTOMERS_LOCATION);
            const secretResolver = createSecretResolver({
                env: {
                    EXAMPLE_HOSPITAL_SECRETS: JSON.stringify({
                        inboundApiKey: "hospital-inbound-key-secret"
                    })
                }
            });

            assert.strictEqual(
                await verifyCustomerInboundAuth(
                    {"x-customer-key": "hospital-inbound-key-secret"},
                    loaded,
                    secretResolver
                ),
                true
            );
            assert.strictEqual(
                await verifyCustomerInboundAuth(
                    {Authorization: "Bearer hospital-inbound-key-secret"},
                    loaded,
                    secretResolver
                ),
                true
            );

            await assert.rejects(
                () => verifyCustomerInboundAuth({}, loaded, secretResolver),
                {status: 401}
            );
            await assert.rejects(
                () =>
                    verifyCustomerInboundAuth(
                        {"X-Customer-Key": "wrong-key"},
                        loaded,
                        secretResolver
                    ),
                {status: 401}
            );

            // Customer without inboundAuth passes automatically
            assert.strictEqual(await verifyCustomerInboundAuth({}, {customerId: "open-cust"}), true);
        });

        it("caches parsed customer config in LRU and invalidates on clearCustomerCache()", async function () {
            const custDir = path.join(tempCustomersRoot, "cached-clinic");
            await mkdir(custDir, {recursive: true});
            const cfgPath = path.join(custDir, "config.yaml");
            await writeFile(cfgPath, "customerId: cached-clinic\nname: Initial Name\n", "utf8");

            const first = await loadCustomer("cached-clinic", tempCustomersRoot);
            assert.strictEqual(first.name, "Initial Name");

            // Modify file on disk without clearing cache: should still return cached value
            await writeFile(cfgPath, "customerId: cached-clinic\nname: Updated Name\n", "utf8");
            const second = await loadCustomer("cached-clinic", tempCustomersRoot);
            assert.strictEqual(second, first);
            assert.strictEqual(second.name, "Initial Name");

            // Bypass cache sees disk update immediately
            const bypassed = await loadCustomer("cached-clinic", tempCustomersRoot, {bypassCache: true});
            assert.strictEqual(bypassed.name, "Updated Name");

            // clearCustomerCache() invalidates cached entry
            clearCustomerCache();
            const reloaded = await loadCustomer("cached-clinic", tempCustomersRoot);
            assert.strictEqual(reloaded.name, "Updated Name");
        });
    });

    describe("customerPipeline (inbound HL7v2 -> FHIR & outbound FHIR -> HL7v2)", function () {
        it("runs example-hospital/input/ADT_A01.liquid end-to-end and delivers conditional_update transaction to FHIR server", async function () {
            const inlineWorkerPool = {
                exec: (task) => convertInlineHl7v2(task)
            };
            const secretResolver = createSecretResolver({
                env: {
                    EXAMPLE_HOSPITAL_SECRETS: JSON.stringify({
                        fhirBearerToken: "live-fhir-bearer-token"
                    })
                }
            });

            const fhirCalls = [];
            const fetchImpl = async (url, init) => {
                fhirCalls.push({url, init});
                return {
                    ok: true,
                    status: 200,
                    text: async () => JSON.stringify({resourceType: "Bundle", type: "transaction-response"}),
                    headers: {get: () => ""}
                };
            };

            const res = await runCustomerInbound({
                customerId: "example-hospital",
                customersRoot: CUSTOMERS_LOCATION,
                templateName: "ADT_A01",
                srcData: SAMPLE_ADT,
                deliver: true,
                workerPool: inlineWorkerPool,
                secretResolver,
                fetchImpl
            });

            assert.strictEqual(res.status, 200);
            const bundle = res.resultMessage.fhirResource;
            assert.strictEqual(bundle.resourceType, "Bundle");
            assert.strictEqual(bundle.entry.length, 2);
            assert.strictEqual(bundle.entry[0].resource.resourceType, "Patient");
            assert.strictEqual(bundle.entry[0].resource.identifier[0].value, "MRN-778899");
            assert.strictEqual(bundle.entry[0].resource.name[0].family, "SCHMIDT");
            assert.strictEqual(bundle.entry[1].resource.resourceType, "Encounter");

            assert.strictEqual(fhirCalls.length, 1);
            assert.strictEqual(fhirCalls[0].url, "https://fhir.example-hospital.org/fhir/r4");
            assert.strictEqual(fhirCalls[0].init.headers.Authorization, "Bearer live-fhir-bearer-token");
            const deliveredBundle = JSON.parse(fhirCalls[0].init.body);
            assert.strictEqual(deliveredBundle.type, "transaction");
            assert.strictEqual(deliveredBundle.entry[0].request.method, "PUT");
            assert.ok(deliveredBundle.entry[0].request.url.includes("MRN-778899"));
            assert.strictEqual(res.resultMessage.delivery.ok, true);
        });

        it("enforces fallbackToBuiltin: false and requires targets.fhirServer.baseUrl when delivering", async function () {
            const custDir = path.join(tempCustomersRoot, "strict-clinic");
            await mkdir(path.join(custDir, "input"), {recursive: true});
            await writeFile(
                path.join(custDir, "config.yaml"),
                [
                    "customerId: strict-clinic",
                    "name: Strict Clinic",
                    "defaults:",
                    "  fallbackToBuiltin: false",
                    "  autoDeliverInbound: true"
                ].join("\n"),
                "utf8"
            );
            await writeFile(
                path.join(custDir, "input", "CustomOnly.liquid"),
                '{"resourceType": "Patient", "id": "p1"}',
                "utf8"
            );

            const mockWorkerPool = {
                exec: async () => ({
                    status: 200,
                    resultMsg: {fhirResource: {resourceType: "Patient", id: "p1"}}
                })
            };

            // Builtin ADT_A04 is rejected when fallbackToBuiltin is false
            await assert.rejects(
                () =>
                    runCustomerInbound({
                        customerId: "strict-clinic",
                        customersRoot: tempCustomersRoot,
                        templateName: "ADT_A04",
                        srcData: SAMPLE_ADT,
                        deliver: false,
                        workerPool: mockWorkerPool
                    }),
                {status: 404}
            );

            // autoDeliverInbound: true without targets.fhirServer.baseUrl throws 400
            await assert.rejects(
                () =>
                    runCustomerInbound({
                        customerId: "strict-clinic",
                        customersRoot: tempCustomersRoot,
                        templateName: "CustomOnly",
                        srcData: SAMPLE_ADT,
                        workerPool: mockWorkerPool
                    }),
                {status: 400}
            );
        });

        it("runs customer outbound conversion end-to-end with convertInlineHl7v2, customerContext, and gateway ACK inspection", async function () {
            const capturedTasks = [];
            const realWorkerPool = {
                exec: async (task) => {
                    capturedTasks.push(task);
                    return convertInlineHl7v2(task).catch((rej) => rej);
                }
            };

            const secretResolver = createSecretResolver({
                env: {
                    EXAMPLE_HOSPITAL_SECRETS: JSON.stringify({
                        hl7v2GatewayApiKey: "gw-live-api-key"
                    })
                }
            });

            const gwCalls = [];
            const fetchImpl = async (url, init) => {
                gwCalls.push({url, init});
                return {
                    ok: true,
                    status: 200,
                    text: async () =>
                        JSON.stringify({
                            ack: "MSH|^~\\&|KIS_ARCHIVE|EXHOSP|FHIR_CONVERTER|EXHOSP|20261126150001||ACK^T02|OUT-CTRL-77|P|2.5.1\rMSA|AA|OUT-CTRL-77|Archived"
                        })
                };
            };

            const customer = await loadCustomer("example-hospital", CUSTOMERS_LOCATION);
            const ctxPreview = buildCustomerContext(customer);
            assert.strictEqual(ctxPreview.customerId, "example-hospital");
            assert.strictEqual(ctxPreview.customerName, "Example University Hospital");
            assert.strictEqual(ctxPreview.mrnSystem, "https://fhir.example-hospital.org/sid/mrn");
            assert.strictEqual(ctxPreview.sendingApplication, "FHIR_CONVERTER");

            const dischargeBundle = {
                resourceType: "Bundle",
                id: "OUT-CTRL-77",
                type: "document",
                entry: [
                    {
                        resource: {
                            resourceType: "Composition",
                            id: "comp-77",
                            status: "final",
                            title: "Cardiology Discharge Letter"
                        }
                    },
                    {
                        resource: {
                            resourceType: "Patient",
                            id: "pat-77",
                            identifier: [{system: "https://fhir.example-hospital.org/sid/mrn", value: "MRN-778899"}],
                            name: [{family: "SCHMIDT", given: ["CLARA"]}]
                        }
                    },
                    {
                        resource: {
                            resourceType: "Encounter",
                            id: "enc-77",
                            status: "finished",
                            identifier: [{system: "https://fhir.example-hospital.org/sid/visit-number", value: "VISIT-5501"}]
                        }
                    }
                ]
            };

            const out = await runCustomerOutbound({
                customerId: "example-hospital",
                customersRoot: CUSTOMERS_LOCATION,
                templateName: "MDM_T02",
                srcData: dischargeBundle,
                deliver: true,
                workerPool: realWorkerPool,
                secretResolver,
                fetchImpl
            });

            assert.strictEqual(out.status, 200);
            assert.ok(out.resultMessage.hl7v2Message.includes("MSH|^~\\&|FHIR_CONVERTER|EXHOSP|KIS_ARCHIVE|EXHOSP|"));
            assert.ok(out.resultMessage.hl7v2Message.includes("PID|1||MRN-778899^^^EXHOSP^MR||SCHMIDT^CLARA"));
            assert.ok(out.resultMessage.hl7v2Message.includes("VISIT-5501^^^EXHOSP^VN"));
            assert.strictEqual(capturedTasks.length, 1);
            assert.strictEqual(capturedTasks[0].srcDataType, "fhir");
            assert.strictEqual(capturedTasks[0].requireCorrelationIds, true);
            assert.strictEqual(capturedTasks[0].customerContext.assigningAuthority, "EXHOSP");

            assert.strictEqual(gwCalls.length, 1);
            assert.strictEqual(gwCalls[0].url, "https://hl7-gateway.example-hospital.org/v1/hl7v2");
            assert.strictEqual(gwCalls[0].init.headers["X-Gateway-Key"], "gw-live-api-key");
            assert.strictEqual(gwCalls[0].init.headers["Idempotency-Key"], "OUT-CTRL-77");
            assert.strictEqual(out.resultMessage.delivery.ok, true);
            assert.strictEqual(out.resultMessage.delivery.ack.ackCode, "AA");
            assert.strictEqual(out.resultMessage.delivery.ack.accepted, true);

            // Missing correlation IDs returns status 422 without delivering to gateway
            const missingCorrRes = await runCustomerOutbound({
                customerId: "example-hospital",
                customersRoot: CUSTOMERS_LOCATION,
                templateName: "MDM_T02",
                srcData: {resourceType: "Bundle", id: "BAD-1", type: "document", entry: []},
                deliver: true,
                workerPool: realWorkerPool,
                secretResolver,
                fetchImpl
            });
            assert.strictEqual(missingCorrRes.status, 422);
            assert.strictEqual(gwCalls.length, 1);
        });

        it("forwards X-Request-Id and traceparent to FHIR server and HL7v2 gateway", async function () {
            const reqId = "req-trace-12345";
            const traceparent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
            const secretResolver = createSecretResolver({
                env: {
                    EXAMPLE_HOSPITAL_SECRETS: JSON.stringify({
                        fhirBearerToken: "live-fhir-bearer-token",
                        hl7v2GatewayApiKey: "gw-live-api-key"
                    })
                }
            });

            const fhirCalls = [];
            const fhirFetch = async (url, init) => {
                fhirCalls.push({url, init});
                return {
                    ok: true,
                    status: 200,
                    text: async () => JSON.stringify({resourceType: "Bundle", type: "transaction-response"}),
                    headers: {get: () => ""}
                };
            };

            const inboundWorkerPool = {
                exec: async () => ({
                    status: 200,
                    resultMsg: {fhirResource: {resourceType: "Patient", id: "p-1"}}
                })
            };

            await runCustomerInbound({
                customerId: "example-hospital",
                customersRoot: CUSTOMERS_LOCATION,
                templateName: "ADT_A01",
                srcData: SAMPLE_ADT,
                deliver: true,
                workerPool: inboundWorkerPool,
                secretResolver,
                fetchImpl: fhirFetch,
                requestId: reqId,
                traceparent
            });

            assert.strictEqual(fhirCalls.length, 1);
            assert.strictEqual(fhirCalls[0].init.headers["X-Request-Id"], reqId);
            assert.strictEqual(fhirCalls[0].init.headers.traceparent, traceparent);

            const gwCalls = [];
            const gwFetch = async (url, init) => {
                gwCalls.push({url, init});
                return {
                    ok: true,
                    status: 200,
                    text: async () => JSON.stringify({ackCode: "AA", controlId: "OUT-1"})
                };
            };

            const outboundWorkerPool = {
                exec: async () => ({
                    status: 200,
                    resultMsg: {
                        hl7v2Message: "MSH|^~\\&|FHIR_CONVERTER|EXHOSP|KIS|EXHOSP|20261126150000||MDM^T02|OUT-1|P|2.5.1\r"
                    }
                })
            };

            await runCustomerOutbound({
                customerId: "example-hospital",
                customersRoot: CUSTOMERS_LOCATION,
                templateName: "MDM_T02",
                srcData: {resourceType: "Bundle", id: "OUT-1", type: "document", entry: []},
                deliver: true,
                workerPool: outboundWorkerPool,
                secretResolver,
                fetchImpl: gwFetch,
                requestId: reqId,
                traceparent
            });

            assert.strictEqual(gwCalls.length, 1);
            assert.strictEqual(gwCalls[0].init.headers["X-Request-Id"], reqId);
            assert.strictEqual(gwCalls[0].init.headers.traceparent, traceparent);
        });

        it("attaches err.phase === 'delivery' on downstream FHIR server or HL7v2 gateway failures", async function () {
            const secretResolver = createSecretResolver({
                env: {
                    EXAMPLE_HOSPITAL_SECRETS: JSON.stringify({
                        fhirBearerToken: "live-fhir-bearer-token",
                        hl7v2GatewayApiKey: "gw-live-api-key"
                    })
                }
            });

            const failingFetch = async () => {
                throw new Error("ECONNREFUSED");
            };

            const inboundWorkerPool = {
                exec: async () => ({
                    status: 200,
                    resultMsg: {fhirResource: {resourceType: "Patient", id: "p-1"}}
                })
            };

            await assert.rejects(
                () =>
                    runCustomerInbound({
                        customerId: "example-hospital",
                        customersRoot: CUSTOMERS_LOCATION,
                        templateName: "ADT_A01",
                        srcData: SAMPLE_ADT,
                        deliver: true,
                        workerPool: inboundWorkerPool,
                        secretResolver,
                        fetchImpl: failingFetch
                    }),
                (err) => {
                    assert.strictEqual(err.phase, "delivery");
                    assert.ok(err.message.includes("ECONNREFUSED"));
                    return true;
                }
            );

            const outboundWorkerPool = {
                exec: async () => ({
                    status: 200,
                    resultMsg: {
                        hl7v2Message: "MSH|^~\\&|FHIR_CONVERTER|EXHOSP|KIS|EXHOSP|20261126150000||MDM^T02|OUT-2|P|2.5.1\r"
                    }
                })
            };

            await assert.rejects(
                () =>
                    runCustomerOutbound({
                        customerId: "example-hospital",
                        customersRoot: CUSTOMERS_LOCATION,
                        templateName: "MDM_T02",
                        srcData: {resourceType: "Bundle", id: "OUT-2", type: "document", entry: []},
                        deliver: true,
                        workerPool: outboundWorkerPool,
                        secretResolver,
                        fetchImpl: failingFetch
                    }),
                (err) => {
                    assert.strictEqual(err.phase, "delivery");
                    assert.strictEqual(err.status, 502);
                    return true;
                }
            );
        });

        it("blocks outbound delivery with 403 when ENABLE_OUTBOUND_DELIVERY=false and allows by default", async function () {
            const secretResolver = createSecretResolver({
                env: {
                    EXAMPLE_HOSPITAL_SECRETS: JSON.stringify({
                        fhirBearerToken: "live-fhir-bearer-token",
                        hl7v2GatewayApiKey: "gw-live-api-key"
                    })
                }
            });

            const inboundWorkerPool = {
                exec: async () => ({
                    status: 200,
                    resultMsg: {fhirResource: {resourceType: "Patient", id: "p-1"}}
                })
            };
            const outboundWorkerPool = {
                exec: async () => ({
                    status: 200,
                    resultMsg: {
                        hl7v2Message: "MSH|^~\\&|FHIR_CONVERTER|EXHOSP|KIS|EXHOSP|20261126150000||MDM^T02|OUT-3|P|2.5.1\r"
                    }
                })
            };

            const prevEnv = process.env.ENABLE_OUTBOUND_DELIVERY;
            try {
                process.env.ENABLE_OUTBOUND_DELIVERY = "false";
                let fetchCalled = false;
                const guardedFetch = async () => {
                    fetchCalled = true;
                    return {ok: true, status: 200, text: async () => "{}", headers: {get: () => ""}};
                };

                await assert.rejects(
                    () =>
                        runCustomerInbound({
                            customerId: "example-hospital",
                            customersRoot: CUSTOMERS_LOCATION,
                            templateName: "ADT_A01",
                            srcData: SAMPLE_ADT,
                            deliver: true,
                            workerPool: inboundWorkerPool,
                            secretResolver,
                            fetchImpl: guardedFetch
                        }),
                    (err) => {
                        assert.strictEqual(err.status, 403);
                        assert.strictEqual(err.phase, "delivery");
                        return true;
                    }
                );

                await assert.rejects(
                    () =>
                        runCustomerOutbound({
                            customerId: "example-hospital",
                            customersRoot: CUSTOMERS_LOCATION,
                            templateName: "MDM_T02",
                            srcData: {resourceType: "Bundle", id: "OUT-3", type: "document", entry: []},
                            deliver: true,
                            workerPool: outboundWorkerPool,
                            secretResolver,
                            fetchImpl: guardedFetch
                        }),
                    (err) => {
                        assert.strictEqual(err.status, 403);
                        assert.strictEqual(err.phase, "delivery");
                        return true;
                    }
                );
                assert.strictEqual(fetchCalled, false);

                // Default (unset) allows delivery
                delete process.env.ENABLE_OUTBOUND_DELIVERY;
                const okRes = await runCustomerInbound({
                    customerId: "example-hospital",
                    customersRoot: CUSTOMERS_LOCATION,
                    templateName: "ADT_A01",
                    srcData: SAMPLE_ADT,
                    deliver: true,
                    workerPool: inboundWorkerPool,
                    secretResolver,
                    fetchImpl: guardedFetch
                });
                assert.strictEqual(okRes.status, 200);
                assert.strictEqual(okRes.resultMessage.delivery.ok, true);
                assert.strictEqual(fetchCalled, true);
            } finally {
                if (prevEnv === undefined) {
                    delete process.env.ENABLE_OUTBOUND_DELIVERY;
                } else {
                    process.env.ENABLE_OUTBOUND_DELIVERY = prevEnv;
                }
            }
        });
    });
});
